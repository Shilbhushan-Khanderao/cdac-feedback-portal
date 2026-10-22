import { withUser } from '../../db/pool.js';
import { audit } from '../../shared/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../shared/errors.js';
import type { CreateItem } from './schema.js';

interface Actor {
  email: string;
  role: string;
  ip: string;
}

export function listSessions(actor: Actor, limit: number, offset: number) {
  return withUser(actor.email, async (client) => {
    if (actor.role === 'student') {
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
}

export async function getSession(actor: Actor, id: string) {
  // Students: own cohort only. Staff: sessions they manage only (explicit, on top of RLS).
  const access =
    actor.role === 'student'
      ? 'public.in_my_cohort(s.batch_id, s.centre_id, s.course_id)'
      : 'public.can_manage(s.centre_id, s.course_id)';

  const session = await withUser(actor.email, async (client) => {
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
}

export function createSessions(actor: Actor, items: CreateItem[]) {
  return withUser(actor.email, async (client) => {
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
        [item.batch_id, item.centre_id, item.course_id, item.module_id, item.faculty, item.opens_at, item.closes_at, actor.email]
      );
      await audit({ actor: actor.email, action: 'SESSION_CREATE', entityType: 'feedback_sessions', entityId: res.rows[0].id, ip: actor.ip }, client);
      results.push(res.rows[0]);
    }
    return results;
  });
}

export async function updateFaculty(actor: Actor, id: string, faculty: string[]) {
  const updated = await withUser(actor.email, async (client) => {
    const res = await client.query(
      `UPDATE public.feedback_sessions
          SET faculty = $1
        WHERE id = $2 AND public.can_manage(centre_id, course_id)
    RETURNING *`,
      [faculty, id]
    );
    if (res.rows[0]) {
      await audit({ actor: actor.email, action: 'SESSION_FACULTY_UPDATE', entityType: 'feedback_sessions', entityId: id, ip: actor.ip }, client);
    }
    return res.rows[0] ?? null;
  });
  if (!updated) throw notFound('Session not found');
  return updated;
}

export async function updateSchedule(actor: Actor, id: string, opens_at?: string, closes_at?: string) {
  const updated = await withUser(actor.email, async (client) => {
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
      await audit({ actor: actor.email, action: 'SESSION_SCHEDULE_UPDATE', entityType: 'feedback_sessions', entityId: id, details: { opens_at, closes_at }, ip: actor.ip }, client);
    }
    return res.rows[0] ?? null;
  });
  if (!updated) throw notFound('Session not found');
  return updated;
}

export async function deleteSession(actor: Actor, id: string) {
  await withUser(actor.email, async (client) => {
    const sess = await client.query(
      'SELECT 1 FROM public.feedback_sessions WHERE id = $1 AND public.can_manage(centre_id, course_id)',
      [id]
    );
    if (!sess.rowCount) throw notFound('Session not found');
    const subCheck = await client.query('SELECT 1 FROM public.submissions WHERE session_id = $1', [id]);
    if (subCheck.rowCount) throw conflict('Cannot delete session that already has submissions');
    await client.query('DELETE FROM public.feedback_sessions WHERE id = $1', [id]);
    await audit({ actor: actor.email, action: 'SESSION_DELETE', entityType: 'feedback_sessions', entityId: id, ip: actor.ip }, client);
  });
}
