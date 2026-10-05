import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../auth/guard.js';
import { withUser } from '../db/pool.js';

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
  app.get('/submissions/:sessionId', { preHandler: requireStaff }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    return withUser(req.user!.email, async (client) => {
      const res = await client.query<{ email: string }>(
        'SELECT email FROM public.submissions WHERE session_id = $1',
        [sessionId]
      );
      return res.rows;
    });
  });

  // ---------------------------------------------------------------- Submit Feedback
  const SubmitFeedbackSchema = z.object({
    session_id: z.string().uuid(),
    answers: z.record(z.string()),
  });

  app.post('/submit', async (req, reply) => {
    const parsed = SubmitFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid answers format' });
    }

    const { session_id, answers } = parsed.data;

    try {
      await withUser(req.user!.email, async (client) => {
        await client.query('SELECT public.submit_feedback($1, $2)', [session_id, JSON.stringify(answers)]);
      });

      return reply.send({ ok: true });
    } catch (err: any) {
      req.log.warn({ err, email: req.user!.email, session_id }, 'Feedback submission rejected');
      return reply.status(400).send({ error: err.message || 'Submission failed' });
    }
  });
};
