import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../../shared/guards.js';
import { badRequest, mapDbError } from '../../shared/errors.js';
import { isUuid } from '../../shared/validate.js';
import { CreateSessionSchema, FacultyUpdateSchema, RescheduleSchema, type CreateItem } from './schema.js';
import { createSessions, deleteSession, getSession, listSessions, updateFaculty, updateSchedule } from './service.js';

const actorOf = (req: FastifyRequest) => ({ email: req.user!.email, role: req.user!.role, ip: req.ip });

export const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // ---------------------------------------------------------------- List Sessions
  app.get('/', async (req) => {
    const queryParams = req.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(parseInt(queryParams.limit || '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(queryParams.offset || '0', 10) || 0, 0);
    return listSessions(actorOf(req), limit, offset);
  });

  // ---------------------------------------------------------------- Single Session
  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Invalid session ID format');
    return getSession(actorOf(req), id);
  });

  // ---------------------------------------------------------------- Create Session (Staff only)
  app.post('/', { preHandler: requireStaff }, async (req, reply) => {
    const isArray = Array.isArray(req.body);
    const parsed = isArray
      ? z.array(CreateSessionSchema).min(1).max(50).safeParse(req.body)
      : CreateSessionSchema.safeParse(req.body);

    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid session payload');

    const items = isArray ? (parsed.data as CreateItem[]) : [parsed.data as CreateItem];

    try {
      const rows = await createSessions(actorOf(req), items);
      return reply.status(201).send(isArray ? rows : rows[0]);
    } catch (err) {
      req.log.error({ err }, 'Failed to create session');
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Update Faculty (Staff only)
  app.patch('/:id/faculty', { preHandler: requireStaff }, async (req) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Invalid session ID format');
    const parsed = FacultyUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid faculty array');

    try {
      return await updateFaculty(actorOf(req), id, parsed.data.faculty);
    } catch (err) {
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Update Schedule (Staff only)
  app.patch('/:id/schedule', { preHandler: requireStaff }, async (req) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Invalid session ID format');
    const parsed = RescheduleSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid schedule dates');

    try {
      return await updateSchedule(actorOf(req), id, parsed.data.opens_at, parsed.data.closes_at);
    } catch (err) {
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Delete Session (Staff only)
  app.delete('/:id', { preHandler: requireStaff }, async (req) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Invalid session ID format');

    try {
      await deleteSession(actorOf(req), id);
      return { ok: true };
    } catch (err) {
      throw mapDbError(err);
    }
  });
};
