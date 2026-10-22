import type { FastifyPluginAsync } from 'fastify';
import { requireStaff } from '../../shared/guards.js';
import { badRequest, mapDbError } from '../../shared/errors.js';
import { isUuid } from '../../shared/validate.js';
import { RosterUpsertSchema } from './schema.js';
import { listStudents, upsertStudents } from './service.js';

export const rosterRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireStaff);

  // ---------------------------------------------------------------- List Students
  app.get('/', async (req) => {
    const q = req.query as Record<string, unknown>;
    const limit = Math.min(Math.max(parseInt(String(q.limit ?? '200'), 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(String(q.offset ?? '0'), 10) || 0, 0);

    const conditions = ['public.can_manage(centre_id, course_id)'];
    const params: unknown[] = [];
    for (const col of ['batch_id', 'centre_id', 'course_id'] as const) {
      const v = q[col];
      if (v === undefined || v === '') continue;
      if (!isUuid(v)) throw badRequest(`Invalid ${col}`);
      params.push(v);
      conditions.push(`${col} = $${params.length}`);
    }
    params.push(limit, offset);

    return listStudents(req.user!.email, params, conditions);
  });

  // ---------------------------------------------------------------- Upsert Students (CSV Upload)
  // 2000 rows is ~0.5 MB of JSON; only this route gets the bigger limit.
  app.post('/upsert', { bodyLimit: 1024 * 1024 }, async (req) => {
    const parsed = RosterUpsertSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid roster format');

    try {
      const count = await upsertStudents(req.user!.email, req.ip, parsed.data.students);
      return { ok: true, count };
    } catch (err) {
      req.log.error({ err }, 'Roster upsert failed');
      throw mapDbError(err);
    }
  });
};
