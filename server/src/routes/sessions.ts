import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../auth/guard.js';
import { withUser } from '../db/pool.js';

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // ---------------------------------------------------------------- List Sessions
  app.get('/', async (req) => {
    return withUser(req.user!.email, async (client) => {
      if (req.user!.role === 'student') {
        const res = await client.query(`
          SELECT s.id, s.opens_at, s.closes_at, s.faculty,
                 jsonb_build_object('name', m.name) AS modules
            FROM public.feedback_sessions s
            JOIN public.modules m ON m.id = s.module_id
           WHERE public.in_my_cohort(s.batch_id, s.centre_id, s.course_id)
           ORDER BY s.closes_at ASC
        `);
        return res.rows;
      }

      // Staff / Admin
      const res = await client.query(`
        SELECT s.*,
               jsonb_build_object('name', m.name) AS modules,
               jsonb_build_object('label', b.label) AS batches,
               jsonb_build_object('name', c.name) AS centres,
               jsonb_build_object('code', co.code) AS courses,
               COALESCE(
                 (SELECT jsonb_agg(jsonb_build_object('session_id', sub.session_id))
                    FROM public.submissions sub
                   WHERE sub.session_id = s.id),
                 '[]'::jsonb
               ) AS submissions
          FROM public.feedback_sessions s
          JOIN public.modules m ON m.id = s.module_id
          LEFT JOIN public.batches b ON b.id = s.batch_id
          LEFT JOIN public.centres c ON c.id = s.centre_id
          LEFT JOIN public.courses co ON co.id = s.course_id
         WHERE public.can_manage(s.centre_id, s.course_id)
         ORDER BY s.opens_at DESC
      `);
      return res.rows;
    });
  });

  // ---------------------------------------------------------------- Single Session
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await withUser(req.user!.email, async (client) => {
      const res = await client.query(
        `SELECT s.*,
                jsonb_build_object('name', m.name) AS modules,
                jsonb_build_object('label', b.label) AS batches,
                jsonb_build_object('name', c.name) AS centres,
                jsonb_build_object('code', co.code) AS courses
           FROM public.feedback_sessions s
           JOIN public.modules m ON m.id = s.module_id
           LEFT JOIN public.batches b ON b.id = s.batch_id
           LEFT JOIN public.centres c ON c.id = s.centre_id
           LEFT JOIN public.courses co ON co.id = s.course_id
          WHERE s.id = $1`,
        [id]
      );
      return res.rows[0] ?? null;
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return session;
  });

  // ---------------------------------------------------------------- Create Session (Staff only)
  const CreateSessionSchema = z.object({
    batch_id: z.string().uuid(),
    centre_id: z.string().uuid(),
    course_id: z.string().uuid(),
    module_id: z.string().uuid(),
    faculty: z.array(z.string()).default([]),
    opens_at: z.string().datetime(),
    closes_at: z.string().datetime(),
  });

  app.post('/', { preHandler: requireStaff }, async (req, reply) => {
    const isArray = Array.isArray(req.body);
    const parsed = isArray
      ? z.array(CreateSessionSchema).safeParse(req.body)
      : CreateSessionSchema.safeParse(req.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid session payload' });
    }

    const items = isArray ? (parsed.data as z.infer<typeof CreateSessionSchema>[]) : [parsed.data as z.infer<typeof CreateSessionSchema>];

    try {
      const rows = await withUser(req.user!.email, async (client) => {
        const results = [];
        for (const item of items) {
          const res = await client.query(
            `INSERT INTO public.feedback_sessions 
               (batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [item.batch_id, item.centre_id, item.course_id, item.module_id, item.faculty, item.opens_at, item.closes_at, req.user!.email]
          );
          results.push(res.rows[0]);
        }
        return results;
      });

      return reply.status(201).send(isArray ? rows : rows[0]);
    } catch (err: any) {
      req.log.error(err, 'Failed to create session');
      return reply.status(400).send({ error: err.message });
    }
  });

  // ---------------------------------------------------------------- Update Faculty (Staff only)
  const UpdateFacultySchema = z.object({
    faculty: z.array(z.string()),
  });

  app.patch('/:id/faculty', { preHandler: requireStaff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateFacultySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid faculty array' });
    }

    const updated = await withUser(req.user!.email, async (client) => {
      const res = await client.query(
        `UPDATE public.feedback_sessions
            SET faculty = $1
          WHERE id = $2
      RETURNING *`,
        [parsed.data.faculty, id]
      );
      return res.rows[0] ?? null;
    });

    if (!updated) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return updated;
  });

  // ---------------------------------------------------------------- Update Schedule (Staff only)
  const RescheduleSchema = z.object({
    opens_at: z.string().datetime().optional(),
    closes_at: z.string().datetime().optional(),
  });

  app.patch('/:id/schedule', { preHandler: requireStaff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = RescheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid schedule dates' });
    }

    const { opens_at, closes_at } = parsed.data;
    const updated = await withUser(req.user!.email, async (client) => {
      const res = await client.query(
        `UPDATE public.feedback_sessions
            SET opens_at = COALESCE($1, opens_at),
                closes_at = COALESCE($2, closes_at)
          WHERE id = $3
          RETURNING *`,
        [opens_at ?? null, closes_at ?? null, id]
      );
      return res.rows[0] ?? null;
    });

    if (!updated) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return updated;
  });

  // ---------------------------------------------------------------- Delete Session (Staff only)
  app.delete('/:id', { preHandler: requireStaff }, async (req, reply) => {
    const { id } = req.params as { id: string };

    try {
      await withUser(req.user!.email, async (client) => {
        const subCheck = await client.query('SELECT 1 FROM public.submissions WHERE session_id = $1', [id]);
        if (subCheck.rowCount && subCheck.rowCount > 0) {
          throw new Error('Cannot delete session that already has submissions');
        }
        await client.query('DELETE FROM public.feedback_sessions WHERE id = $1', [id]);
      });
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
