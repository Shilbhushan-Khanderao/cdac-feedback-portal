import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireStaff, requireAdmin } from '../auth/guard.js';
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

  // ---------------------------------------------------------------- Generic Table CRUD (Admin / Staff Setup)
  const ALLOWED_TABLES = [
    'centres',
    'courses',
    'modules',
    'batches',
    'faculty',
    'staff_roster',
    'questions',
    'student_roster',
  ];

  const STAFF_WRITABLE = ['faculty', 'student_roster'];

  const getPkCol = (table: string, queryPk?: string) => {
    if (queryPk && /^[a-zA-Z0-9_]+$/.test(queryPk)) return queryPk;
    if (table === 'staff_roster' || table === 'student_roster') return 'email';
    return 'id';
  };

  app.get('/tables/:table', { preHandler: requireStaff }, async (req, reply) => {
    const { table } = req.params as { table: string };
    if (!ALLOWED_TABLES.includes(table)) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    const queryParams = req.query as Record<string, string>;
    const orderParam = queryParams.order;
    const filterKeys = Object.keys(queryParams).filter(
      (k) => k !== 'order' && k !== 'pk' && /^[a-zA-Z0-9_]+$/.test(k)
    );

    const conditions: string[] = [];
    const values: any[] = [];
    filterKeys.forEach((key, idx) => {
      conditions.push(`${key} = $${idx + 1}`);
      values.push(queryParams[key]);
    });

    let orderByClause = '';
    if (orderParam && /^[a-zA-Z0-9_]+(\s+(asc|desc))?$/i.test(orderParam.trim())) {
      orderByClause = `ORDER BY ${orderParam.trim()}`;
    } else if (table === 'modules') {
      orderByClause = 'ORDER BY sort_order ASC, name ASC';
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM public.${table} ${whereClause} ${orderByClause}`.trim();

    const res = await withUser(req.user!.email, async (client) => {
      const r = await client.query(sql, values);
      return r.rows;
    });
    return res;
  });

  app.post('/tables/:table', { preHandler: requireStaff }, async (req, reply) => {
    const { table } = req.params as { table: string };
    if (!ALLOWED_TABLES.includes(table)) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    if (req.user!.role !== 'admin' && !STAFF_WRITABLE.includes(table)) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const body = req.body as Record<string, any>;
    const keys = Object.keys(body).filter((k) => /^[a-zA-Z0-9_]+$/.test(k) && body[k] !== undefined);
    const values = keys.map((k) => body[k]);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const sql = `INSERT INTO public.${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    try {
      const res = await withUser(req.user!.email, async (client) => {
        const r = await client.query(sql, values);
        return r.rows[0];
      });
      return reply.status(201).send(res);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.put('/tables/:table/:id', { preHandler: requireStaff }, async (req, reply) => {
    const { table, id } = req.params as { table: string; id: string };
    if (!ALLOWED_TABLES.includes(table)) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    if (req.user!.role !== 'admin' && !STAFF_WRITABLE.includes(table)) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const queryParams = req.query as { pk?: string };
    const pkCol = getPkCol(table, queryParams.pk);

    const body = req.body as Record<string, any>;
    const keys = Object.keys(body).filter(
      (k) => k !== pkCol && /^[a-zA-Z0-9_]+$/.test(k) && body[k] !== undefined
    );
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [id, ...keys.map((k) => body[k])];

    const sql = `UPDATE public.${table} SET ${setClauses} WHERE ${pkCol} = $1 RETURNING *`;
    try {
      const res = await withUser(req.user!.email, async (client) => {
        const r = await client.query(sql, values);
        return r.rows[0] ?? null;
      });

      if (!res) {
        return reply.status(404).send({ error: 'Row not found or no changes allowed' });
      }
      return res;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete('/tables/:table/:id', { preHandler: requireStaff }, async (req, reply) => {
    const { table, id } = req.params as { table: string; id: string };
    if (!ALLOWED_TABLES.includes(table)) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    if (req.user!.role !== 'admin' && !STAFF_WRITABLE.includes(table)) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const queryParams = req.query as { pk?: string };
    const pkCol = getPkCol(table, queryParams.pk);

    try {
      const res = await withUser(req.user!.email, async (client) => {
        const r = await client.query(`DELETE FROM public.${table} WHERE ${pkCol} = $1 RETURNING *`, [id]);
        return r.rows[0] ?? null;
      });

      if (!res) {
        return reply.status(404).send({ error: 'Row not found or deletion not allowed' });
      }
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
