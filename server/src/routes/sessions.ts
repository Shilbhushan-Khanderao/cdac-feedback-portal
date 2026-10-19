import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../auth/guard.js';
import { withUser } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, mapDbError, notFound } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

const FacultyArray = z.array(z.string().trim().min(1).max(255)).max(20);

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // ---------------------------------------------------------------- List Sessions
  app.get('/', async (req) => {
    const queryParams = req.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(parseInt(queryParams.limit || '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(queryParams.offset || '0', 10) || 0, 0);

    return withUser(req.user!.email, async (client) => {
      if (req.user!.role === 'student') {
        const res = await client.query(`
          SELECT s.id, s.opens_at, s.closes_at, s.faculty,
                 COALESCE(jsonb_array_length(s.questions), 0)::int AS question_count,
                 jsonb_build_object('name', m.name) AS modules
            FROM public.feedback_sessions s
            JOIN public.modules m ON m.id = s.module_id
           WHERE public.in_my_cohort(s.batch_id, s.centre_id, s.course_id)
           ORDER BY s.closes_at ASC
           LIMIT $1 OFFSET $2
        `, [limit, offset]);
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
         LIMIT $1 OFFSET $2
      `, [limit, offset]);
      return res.rows;
    });
  });

  // ---------------------------------------------------------------- Single Session
  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Invalid session ID format');

    // Students: own cohort only. Staff: sessions they manage only (explicit, on top of RLS).
    const access =
      req.user!.role === 'student'
        ? 'public.in_my_cohort(s.batch_id, s.centre_id, s.course_id)'
        : 'public.can_manage(s.centre_id, s.course_id)';

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
          WHERE s.id = $1 AND ${access}`,
        [id]
      );
      return res.rows[0] ?? null;
    });

    if (!session) throw notFound('Session not found');
    return session;
  });

  // ---------------------------------------------------------------- Create Session (Staff only)
  const CreateSessionSchema = z.object({
    batch_id: z.string().uuid(),
    centre_id: z.string().uuid(),
    course_id: z.string().uuid(),
    module_id: z.string().uuid(),
    faculty: FacultyArray.default([]),
    opens_at: z.string().datetime(),
    closes_at: z.string().datetime(),
  });
  type CreateItem = z.infer<typeof CreateSessionSchema>;

  app.post('/', { preHandler: requireStaff }, async (req, reply) => {
    const isArray = Array.isArray(req.body);
    const parsed = isArray
      ? z.array(CreateSessionSchema).min(1).max(50).safeParse(req.body)
      : CreateSessionSchema.safeParse(req.body);

    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid session payload');

    const items = isArray ? (parsed.data as CreateItem[]) : [parsed.data as CreateItem];

    try {
      const rows = await withUser(req.user!.email, async (client) => {
        const results = [];
        for (const item of items) {
          const ok = await client.query(
            `SELECT public.can_manage($1, $2) AS allowed,
                    EXISTS (SELECT 1 FROM public.modules WHERE id = $3 AND course_id = $2) AS module_ok`,
            [item.centre_id, item.course_id, item.module_id]
          );
          if (!ok.rows[0]?.allowed) throw forbidden('You cannot schedule sessions for this centre or course');
          if (!ok.rows[0]?.module_ok) throw badRequest('Module does not belong to the selected course');

          const res = await client.query(
            `INSERT INTO public.feedback_sessions
               (batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [item.batch_id, item.centre_id, item.course_id, item.module_id, item.faculty, item.opens_at, item.closes_at, req.user!.email]
          );
          await audit({ actor: req.user!.email, action: 'SESSION_CREATE', entityType: 'feedback_sessions', entityId: res.rows[0].id, ip: req.ip }, client);
          results.push(res.rows[0]);
        }
        return results;
      });

      return reply.status(201).send(isArray ? rows : rows[0]);
    } catch (err) {
      req.log.error({ err }, 'Failed to create session');
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Update Faculty (Staff only)
  app.patch('/:id/faculty', { preHandler: requireStaff }, async (req) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Invalid session ID format');
    const parsed = z.object({ faculty: FacultyArray }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid faculty array');

    try {
      const updated = await withUser(req.user!.email, async (client) => {
        const res = await client.query(
          `UPDATE public.feedback_sessions
              SET faculty = $1
            WHERE id = $2 AND public.can_manage(centre_id, course_id)
        RETURNING *`,
          [parsed.data.faculty, id]
        );
        if (res.rows[0]) {
          await audit({ actor: req.user!.email, action: 'SESSION_FACULTY_UPDATE', entityType: 'feedback_sessions', entityId: id, ip: req.ip }, client);
        }
        return res.rows[0] ?? null;
      });
      if (!updated) throw notFound('Session not found');
      return updated;
    } catch (err) {
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Update Schedule (Staff only)
  const RescheduleSchema = z.object({
    opens_at: z.string().datetime().optional(),
    closes_at: z.string().datetime().optional(),
  });

  app.patch('/:id/schedule', { preHandler: requireStaff }, async (req) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Invalid session ID format');
    const parsed = RescheduleSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid schedule dates');

    const { opens_at, closes_at } = parsed.data;
    try {
      const updated = await withUser(req.user!.email, async (client) => {
        // trg_lock_closed_schedule rejects changes once the session has closed.
        const res = await client.query(
          `UPDATE public.feedback_sessions
              SET opens_at = COALESCE($1, opens_at),
                  closes_at = COALESCE($2, closes_at)
            WHERE id = $3 AND public.can_manage(centre_id, course_id)
            RETURNING *`,
          [opens_at ?? null, closes_at ?? null, id]
        );
        if (res.rows[0]) {
          await audit({ actor: req.user!.email, action: 'SESSION_SCHEDULE_UPDATE', entityType: 'feedback_sessions', entityId: id, details: { opens_at, closes_at }, ip: req.ip }, client);
        }
        return res.rows[0] ?? null;
      });
      if (!updated) throw notFound('Session not found');
      return updated;
    } catch (err) {
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Delete Session (Staff only)
  app.delete('/:id', { preHandler: requireStaff }, async (req) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Invalid session ID format');

    try {
      await withUser(req.user!.email, async (client) => {
        const sess = await client.query(
          'SELECT 1 FROM public.feedback_sessions WHERE id = $1 AND public.can_manage(centre_id, course_id)',
          [id]
        );
        if (!sess.rowCount) throw notFound('Session not found');
        const subCheck = await client.query('SELECT 1 FROM public.submissions WHERE session_id = $1', [id]);
        if (subCheck.rowCount) throw conflict('Cannot delete session that already has submissions');
        await client.query('DELETE FROM public.feedback_sessions WHERE id = $1', [id]);
        await audit({ actor: req.user!.email, action: 'SESSION_DELETE', entityType: 'feedback_sessions', entityId: id, ip: req.ip }, client);
      });
      return { ok: true };
    } catch (err) {
      throw mapDbError(err);
    }
  });
};
