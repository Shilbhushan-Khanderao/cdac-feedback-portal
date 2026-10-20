import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireStaff } from '../auth/guard.js';
import { withUser } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, mapDbError } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

export const rosterRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireStaff);

  // ---------------------------------------------------------------- List Students
  app.get('/', async (req) => {
    const q = req.query as Record<string, unknown>;
    const limit = Math.min(Math.max(parseInt(String(q.limit ?? '200'), 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(String(q.offset ?? '0'), 10) || 0, 0);

    const conditions = ['public.can_manage(centre_id, course_id)'];
    const params: unknown[] = [];
    for (const col of ['batch_id', 'centre_id', 'course_id'] as const) {
      const v = q[col];
      if (v === undefined || v === '') continue;
      if (!isUuid(v)) throw badRequest(`Invalid ${col}`);
      params.push(v);
      conditions.push(`${col} = $${params.length}`);
    }
    params.push(limit, offset);

    return withUser(req.user!.email, async (client) => {
      const res = await client.query(
        `SELECT email, prn, full_name, batch_id, centre_id, course_id
           FROM public.student_roster
          WHERE ${conditions.join(' AND ')}
          ORDER BY prn ASC, full_name ASC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return res.rows;
    });
  });

  // ---------------------------------------------------------------- Upsert Students (CSV Upload)
  const StudentSchema = z.object({
    email: z.string().trim().email().max(254),
    prn: z.string().trim().min(1).max(64),
    full_name: z.string().trim().min(1).max(255),
    batch_id: z.string().uuid(),
    centre_id: z.string().uuid(),
    course_id: z.string().uuid(),
  });

  const RosterUpsertSchema = z.object({
    students: z.array(StudentSchema).min(1).max(2000),
  });

  // 2000 rows is ~0.5 MB of JSON; only this route gets the bigger limit.
  app.post('/upsert', { bodyLimit: 1024 * 1024 }, async (req) => {
    const parsed = RosterUpsertSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid roster format');

    const { students } = parsed.data;

    try {
      const count = await withUser(req.user!.email, async (client) => {
        // Destination check, once per distinct cohort.
        const pairs = new Map<string, [string, string]>();
        for (const s of students) pairs.set(`${s.centre_id}|${s.course_id}`, [s.centre_id, s.course_id]);
        for (const [centre, course] of pairs.values()) {
          const r = await client.query('SELECT public.can_manage($1, $2) AS allowed', [centre, course]);
          if (!r.rows[0]?.allowed) throw forbidden('You cannot add students to this centre or course');
        }

        // Source check: an email already rostered elsewhere belongs to someone else's cohort.
        // RLS hides rows outside our scope, so "not visible but exists" means foreign. The
        // ON CONFLICT ... DO UPDATE below also fails closed via the UPDATE policy USING clause.
        const emails = students.map((s) => s.email.toLowerCase().trim());
        const foreign = await client.query(
          `SELECT count(*)::int AS n
             FROM unnest($1::text[]) e(email)
            WHERE public.roster_email_taken(e.email::citext)
              AND NOT EXISTS (SELECT 1 FROM public.student_roster r WHERE r.email = e.email::citext)`,
          [emails]
        );
        if (foreign.rows[0].n > 0) throw forbidden('Some emails already belong to another centre or course');

        let inserted = 0;
        for (const s of students) {
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

        // CMP-6: record which emails were touched (and the row count) so a cohort move or
        // PII overwrite can be reconstructed later; emails already flow through this route's
        // own logs/payload, so listing them here isn't a new PII exposure.
        await audit({ actor: req.user!.email, action: 'ROSTER_UPLOAD', entityType: 'student_roster', details: { count: inserted, emails }, ip: req.ip }, client);
        return inserted;
      });

      return { ok: true, count };
    } catch (err) {
      req.log.error({ err }, 'Roster upsert failed');
      throw mapDbError(err);
    }
  });
};
