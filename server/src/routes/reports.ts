import type { FastifyPluginAsync } from 'fastify';
import { requireStaff } from '../auth/guard.js';
import { withUser } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { badRequest, mapDbError } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireStaff);

  // ---------------------------------------------------------------- Dashboard Data
  app.get('/dashboard', async (req) => {
    return withUser(req.user!.email, async (client) => {
      const res = await client.query('SELECT public.dashboard_data() AS data');
      return res.rows[0]?.data ?? [];
    });
  });

  // ---------------------------------------------------------------- Session Report
  // The only path to response content: session_report() enforces can_manage, closed, n>=3, random order.
  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Invalid session ID format');

    try {
      return await withUser(req.user!.email, async (client) => {
        const res = await client.query('SELECT public.session_report($1) AS report', [id]);
        await audit({ actor: req.user!.email, action: 'REPORT_VIEW', entityType: 'feedback_sessions', entityId: id, ip: req.ip }, client);
        return res.rows[0]?.report;
      });
    } catch (err) {
      req.log.warn({ err, id }, 'Session report retrieval failed');
      throw mapDbError(err);
    }
  });
};
