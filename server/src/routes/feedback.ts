import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../auth/guard.js';
import { withUser } from '../db/pool.js';
import { badRequest, mapDbError, notFound } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // ---------------------------------------------------------------- My Submissions (Student)
  app.get('/my-submissions', async (req) => {
    return withUser(req.user!.email, async (client) => {
      const res = await client.query<{ session_id: string }>(
        'SELECT session_id FROM public.submissions WHERE email = $1',
        [req.user!.email]
      );
      return res.rows;
    });
  });

  // ---------------------------------------------------------------- Session Submissions List (Staff only)
  // Who submitted, never when (submitted_at is not even granted to the app role).
  app.get('/submissions/:sessionId', { preHandler: requireStaff }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    if (!isUuid(sessionId)) throw badRequest('Invalid session ID format');
    return withUser(req.user!.email, async (client) => {
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
  });

  // ---------------------------------------------------------------- Submit Feedback
  const SubmitFeedbackSchema = z.object({
    session_id: z.string().uuid(),
    answers: z
      .record(z.string().max(2000))
      .refine((a) => Object.keys(a).length <= 100, 'Too many answers'),
  });

  app.post('/submit', async (req) => {
    const parsed = SubmitFeedbackSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid answers format');

    const { session_id, answers } = parsed.data;

    try {
      await withUser(req.user!.email, async (client) => {
        await client.query('SELECT public.submit_feedback($1, $2)', [session_id, JSON.stringify(answers)]);
      });
      return { ok: true };
    } catch (err: any) {
      req.log.warn({ err, session_id }, 'Feedback submission rejected');
      // submit_feedback raises user-facing P0001 messages; everything else is generic.
      throw mapDbError(err);
    }
  });
};
