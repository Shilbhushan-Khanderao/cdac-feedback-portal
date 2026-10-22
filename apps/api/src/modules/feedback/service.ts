import { withUser } from '../../db/pool.js';
import { notFound } from '../../shared/errors.js';

export function mySubmissions(email: string) {
  return withUser(email, async (client) => {
    const res = await client.query<{ session_id: string }>(
      'SELECT session_id FROM public.submissions WHERE email = $1',
      [email]
    );
    return res.rows;
  });
}

// Who submitted, never when (submitted_at is not even granted to the app role).
export function sessionSubmitters(email: string, sessionId: string) {
  return withUser(email, async (client) => {
    const sess = await client.query(
      'SELECT 1 FROM public.feedback_sessions WHERE id = $1 AND public.can_manage(centre_id, course_id)',
      [sessionId]
    );
    if (!sess.rowCount) throw notFound('Session not found');
    const res = await client.query<{ email: string }>(
      'SELECT email FROM public.submissions WHERE session_id = $1 ORDER BY email',
      [sessionId]
    );
    return res.rows;
  });
}

// submit_feedback() is the only writer of submissions and responses.
export async function submitFeedback(email: string, sessionId: string, answers: Record<string, string>) {
  await withUser(email, async (client) => {
    await client.query('SELECT public.submit_feedback($1, $2)', [sessionId, JSON.stringify(answers)]);
  });
}
