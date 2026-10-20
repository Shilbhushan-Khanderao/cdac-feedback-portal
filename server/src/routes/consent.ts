import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../auth/guard.js';
import { withUser } from '../db/pool.js';
import { mapDbError } from '../lib/errors.js';

// CMP-4: literal for now. No admin UI exists to manage notice versions yet (YAGNI) — bump
// this string and ship a new migration/notice the day that changes.
const CONSENT_VERSION = 'v1';

export const consentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // Any authenticated role (student, cc, admin). Fire-and-forget from the client on the same
  // click that already sets the localStorage flag; RLS (005_consent.sql) restricts this to the
  // caller's own row regardless of what email is implied by the body — there is no body.
  app.post('/', async (req) => {
    try {
      await withUser(req.user!.email, async (client) => {
        await client.query(
          `INSERT INTO public.consent_records (email, version, accepted_at)
           VALUES ($1, $2, now())
           ON CONFLICT (email, version) DO UPDATE SET accepted_at = now()`,
          [req.user!.email, CONSENT_VERSION]
        );
      });
      return { ok: true };
    } catch (err) {
      throw mapDbError(err);
    }
  });
};
