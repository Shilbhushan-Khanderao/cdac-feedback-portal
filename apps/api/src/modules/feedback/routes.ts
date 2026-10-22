import type { FastifyPluginAsync } from 'fastify';
import { requireAuth, requireStaff } from '../../shared/guards.js';
import { badRequest, mapDbError } from '../../shared/errors.js';
import { isUuid } from '../../shared/validate.js';
import { SubmitFeedbackSchema } from './schema.js';
import { mySubmissions, sessionSubmitters, submitFeedback } from './service.js';

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // ---------------------------------------------------------------- My Submissions (Student)
  app.get('/my-submissions', async (req) => mySubmissions(req.user!.email));

  // ---------------------------------------------------------------- Session Submissions List (Staff only)
  app.get('/submissions/:sessionId', { preHandler: requireStaff }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    if (!isUuid(sessionId)) throw badRequest('Invalid session ID format');
    return sessionSubmitters(req.user!.email, sessionId);
  });

  // ---------------------------------------------------------------- Submit Feedback
  app.post('/submit', async (req) => {
    const parsed = SubmitFeedbackSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid answers format');

    const { session_id, answers } = parsed.data;

    try {
      await submitFeedback(req.user!.email, session_id, answers);
      return { ok: true };
    } catch (err: any) {
      req.log.warn({ err, session_id }, 'Feedback submission rejected');
      // submit_feedback raises user-facing P0001 messages; everything else is generic.
      throw mapDbError(err);
    }
  });
};
