import type { FastifyPluginAsync } from 'fastify';
import { requireStaff } from '../auth/guard.js';
import { withUser } from '../db/pool.js';

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
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    try {
      const report = await withUser(req.user!.email, async (client) => {
        const res = await client.query('SELECT public.session_report($1) AS report', [id]);
        return res.rows[0]?.report;
      });

      return reply.send(report);
    } catch (err: any) {
      req.log.warn({ err, id }, 'Session report retrieval failed');
      return reply.status(400).send({ error: err.message || 'Report unavailable' });
    }
  });
};
