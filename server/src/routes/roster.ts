import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireStaff } from '../auth/guard.js';
import { withUser } from '../db/pool.js';

export const rosterRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireStaff);

  // ---------------------------------------------------------------- List Students
  app.get('/', async (req) => {
    const q = req.query as { batch_id?: string; centre_id?: string; course_id?: string };
    return withUser(req.user!.email, async (client) => {
      const conditions = ['public.can_manage(centre_id, course_id)'];
      const params: any[] = [];

      if (q.batch_id) {
        params.push(q.batch_id);
        conditions.push(`batch_id = $${params.length}`);
      }
      if (q.centre_id) {
        params.push(q.centre_id);
        conditions.push(`centre_id = $${params.length}`);
      }
      if (q.course_id) {
        params.push(q.course_id);
        conditions.push(`course_id = $${params.length}`);
      }

      const sql = `
        SELECT email, prn, full_name, batch_id, centre_id, course_id
          FROM public.student_roster
         WHERE ${conditions.join(' AND ')}
         ORDER BY prn ASC, full_name ASC
      `;
      const res = await client.query(sql, params);
      return res.rows;
    });
  });

  // ---------------------------------------------------------------- Upsert Students (CSV Upload)
  const StudentSchema = z.object({
    email: z.string().email(),
    prn: z.string().trim().min(1),
    full_name: z.string().trim().min(1),
    batch_id: z.string().uuid(),
    centre_id: z.string().uuid(),
    course_id: z.string().uuid(),
  });

  const RosterUpsertSchema = z.object({
    students: z.array(StudentSchema).min(1).max(2000),
  });

  app.post('/upsert', async (req, reply) => {
    const parsed = RosterUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid roster format' });
    }

    const { students } = parsed.data;

    try {
      const count = await withUser(req.user!.email, async (client) => {
        let inserted = 0;
        for (const s of students) {
          // Verify coordinator can manage this centre and course
          const authCheck = await client.query(
            'SELECT public.can_manage($1, $2) AS allowed',
            [s.centre_id, s.course_id]
          );
          if (!authCheck.rows[0]?.allowed) {
            throw new Error(`Unauthorized to add students to centre ${s.centre_id} or course ${s.course_id}`);
          }

          await client.query(
            `INSERT INTO public.student_roster (email, prn, full_name, batch_id, centre_id, course_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (email) DO UPDATE SET
               prn = EXCLUDED.prn,
               full_name = EXCLUDED.full_name,
               batch_id = EXCLUDED.batch_id,
               centre_id = EXCLUDED.centre_id,
               course_id = EXCLUDED.course_id`,
            [s.email.toLowerCase().trim(), s.prn, s.full_name, s.batch_id, s.centre_id, s.course_id]
          );
          inserted++;
        }

        // CERT-In audit logging
        await client.query(
          `INSERT INTO public.audit_logs (actor_email, action, entity_type, details, ip_address)
           VALUES ($1, 'ROSTER_UPLOAD', 'student_roster', $2, $3)`,
          [req.user!.email, JSON.stringify({ count: inserted }), req.ip]
        );

        return inserted;
      });

      return reply.send({ ok: true, count });
    } catch (err: any) {
      req.log.error(err, 'Roster upsert failed');
      return reply.status(400).send({ error: err.message });
    }
  });
};
