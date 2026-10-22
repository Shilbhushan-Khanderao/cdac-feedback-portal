import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../../shared/guards.js';
import { mapDbError } from '../../shared/errors.js';
import { recordConsent } from './service.js';

export const consentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // Any authenticated role (student, cc, admin). Fire-and-forget from the client on the same
  // click that already sets the localStorage flag; RLS (005_consent.sql) restricts this to the
  // caller's own row regardless of what email is implied by the body — there is no body.
  app.post('/', async (req) => {
    try {
      await recordConsent(req.user!.email);
      return { ok: true };
    } catch (err) {
      throw mapDbError(err);
    }
  });
};
