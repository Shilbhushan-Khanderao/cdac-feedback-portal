import type { FastifyPluginAsync } from 'fastify';
import { requireStaff } from '../../shared/guards.js';
import { badRequest, mapDbError } from '../../shared/errors.js';
import { isUuid } from '../../shared/validate.js';
import { dashboardData, sessionReport } from './service.js';

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireStaff);

  // ---------------------------------------------------------------- Dashboard Data
  app.get('/dashboard', async (req) => dashboardData(req.user!.email));

  // ---------------------------------------------------------------- Session Report
  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Invalid session ID format');

    try {
      return await sessionReport(req.user!.email, req.ip, id);
    } catch (err) {
      req.log.warn({ err, id }, 'Session report retrieval failed');
      throw mapDbError(err);
    }
  });
};
