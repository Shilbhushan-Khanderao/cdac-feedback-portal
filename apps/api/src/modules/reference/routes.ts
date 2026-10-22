import type { FastifyPluginAsync } from 'fastify';
import { requireAuth, requireStaff } from '../../shared/guards.js';
import { badRequest, conflict, mapDbError } from '../../shared/errors.js';
import { FacultyInsertSchema } from './schema.js';
import {
  cohortSizes,
  createFaculty,
  listActiveFaculty,
  listActiveModules,
  listBatches,
  listCentres,
  listCourses,
} from './service.js';

export const referenceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.get('/batches', async () => listBatches());
  app.get('/centres', async () => listCentres());
  app.get('/courses', async () => listCourses());
  app.get('/modules', async () => listActiveModules());

  // ---------------------------------------------------------------- Faculty (Staff only)
  app.get('/faculty', { preHandler: requireStaff }, async (req) => listActiveFaculty(req.user!.email));

  app.post('/faculty', { preHandler: requireStaff }, async (req, reply) => {
    const parsed = FacultyInsertSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid faculty name');

    const { name, centre_id } = parsed.data;
    try {
      const row = await createFaculty(req.user!.email, req.ip, name, centre_id ?? null);
      return reply.status(201).send(row);
    } catch (err: any) {
      if (err.code === '23505') throw conflict('Faculty with this name already exists');
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Cohort Sizes
  app.get('/cohort-sizes', { preHandler: requireStaff }, async (req) => cohortSizes(req.user!.email));
};
