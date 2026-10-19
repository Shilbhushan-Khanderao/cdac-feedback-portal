import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../auth/guard.js';
import { query, withUser } from '../db/pool.js';

export const referenceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // ---------------------------------------------------------------- Batches
  app.get('/batches', async () => {
    const res = await query('SELECT * FROM public.batches ORDER BY label DESC');
    return res.rows;
  });

  // ---------------------------------------------------------------- Centres
  app.get('/centres', async () => {
    const res = await query('SELECT * FROM public.centres ORDER BY name ASC');
    return res.rows;
  });

  // ---------------------------------------------------------------- Courses
  app.get('/courses', async () => {
    const res = await query('SELECT * FROM public.courses ORDER BY code ASC');
    return res.rows;
  });

  // ---------------------------------------------------------------- Modules
  app.get('/modules', async () => {
    const res = await query(
      'SELECT * FROM public.modules WHERE active = true ORDER BY sort_order ASC, name ASC'
    );
    return res.rows;
  });

  // ---------------------------------------------------------------- Faculty (Staff only)
  app.get('/faculty', { preHandler: requireStaff }, async (req) => {
    const res = await withUser(req.user!.email, async (client) => {
      const r = await client.query(
        `SELECT id, name, centre_id, active 
           FROM public.faculty 
          WHERE active = true 
          ORDER BY name ASC`
      );
      return r.rows;
    });
    return res;
  });

  const FacultyInsertSchema = z.object({
    name: z.string().trim().min(1).max(255),
    centre_id: z.string().uuid().nullable().optional(),
  });

  app.post('/faculty', { preHandler: requireStaff }, async (req, reply) => {
    const parsed = FacultyInsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid faculty name' });
    }

    const { name, centre_id } = parsed.data;
    try {
      const row = await withUser(req.user!.email, async (client) => {
        const r = await client.query(
          `INSERT INTO public.faculty (name, centre_id) VALUES ($1, $2) RETURNING *`,
          [name, centre_id ?? null]
        );
        return r.rows[0];
      });
      return reply.status(201).send(row);
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Faculty with this name already exists' });
      }
      throw err;
    }
  });

  // ---------------------------------------------------------------- Cohort Sizes
  app.get('/cohort-sizes', { preHandler: requireStaff }, async (req) => {
    const res = await withUser(req.user!.email, async (client) => {
      const r = await client.query('SELECT * FROM public.cohort_sizes');
      return r.rows;
    });
    return res;
  });
};
