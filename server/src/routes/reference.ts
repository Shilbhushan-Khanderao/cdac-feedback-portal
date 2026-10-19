import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireStaff } from '../auth/guard.js';
import { query, withUser } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, mapDbError } from '../lib/errors.js';

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
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid faculty name');

    const { name, centre_id } = parsed.data;
    try {
      const row = await withUser(req.user!.email, async (client) => {
        // Admin: centre as given (NULL = shared). CC: defaults to their own centre; any other
        // centre (or shared) is rejected by the faculty_ins RLS policy.
        const r = await client.query(
          `INSERT INTO public.faculty (name, centre_id)
           VALUES ($1, CASE WHEN public.is_admin() THEN $2::uuid
                            ELSE COALESCE($2::uuid, (SELECT centre_id FROM public.staff_roster WHERE email = public.my_email())) END)
           RETURNING id, name, centre_id, active`,
          [name, centre_id ?? null]
        );
        await audit({ actor: req.user!.email, action: 'FACULTY_CREATE', entityType: 'faculty', entityId: r.rows[0].id, ip: req.ip }, client);
        return r.rows[0];
      });
      return reply.status(201).send(row);
    } catch (err: any) {
      if (err.code === '23505') throw conflict('Faculty with this name already exists');
      throw mapDbError(err);
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
