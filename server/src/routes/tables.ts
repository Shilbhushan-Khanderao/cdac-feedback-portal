import type { FastifyPluginAsync } from 'fastify';
import { requireStaff } from '../auth/guard.js';
import { withUser } from '../db/pool.js';
import { sanitizeDbError } from '../lib/errors.js';

interface TableConfig {
  pk: 'id' | 'email';
  readableColumns: string[];
  writableColumns: string[];
  defaultOrder?: string;
}

export const TABLE_CONFIGS: Record<string, TableConfig> = {
  centres: {
    pk: 'id',
    readableColumns: ['id', 'name', 'kind', 'parent_id'],
    writableColumns: ['name', 'kind', 'parent_id'],
    defaultOrder: 'name ASC',
  },
  courses: {
    pk: 'id',
    readableColumns: ['id', 'code', 'name', 'active'],
    writableColumns: ['code', 'name', 'active'],
    defaultOrder: 'code ASC',
  },
  modules: {
    pk: 'id',
    readableColumns: ['id', 'course_id', 'name', 'short_name', 'sort_order', 'active'],
    writableColumns: ['course_id', 'name', 'short_name', 'sort_order', 'active'],
    defaultOrder: 'sort_order ASC, name ASC',
  },
  batches: {
    pk: 'id',
    readableColumns: ['id', 'label', 'active'],
    writableColumns: ['label', 'active'],
    defaultOrder: 'label DESC',
  },
  faculty: {
    pk: 'id',
    readableColumns: ['id', 'centre_id', 'name', 'active'],
    writableColumns: ['centre_id', 'name', 'active'],
    defaultOrder: 'name ASC',
  },
  staff_roster: {
    pk: 'email',
    readableColumns: ['email', 'full_name', 'role', 'centre_id', 'course_id'],
    writableColumns: ['email', 'full_name', 'role', 'centre_id', 'course_id'],
    defaultOrder: 'full_name ASC',
  },
  student_roster: {
    pk: 'email',
    readableColumns: ['email', 'prn', 'full_name', 'batch_id', 'centre_id', 'course_id'],
    writableColumns: ['email', 'prn', 'full_name', 'batch_id', 'centre_id', 'course_id'],
    defaultOrder: 'prn ASC',
  },
  questions: {
    pk: 'id',
    readableColumns: ['id', 'sort_order', 'text', 'kind', 'options', 'active'],
    writableColumns: ['sort_order', 'text', 'kind', 'options', 'active'],
    defaultOrder: 'sort_order ASC',
  },
};

const STAFF_WRITABLE = ['faculty', 'student_roster'];

export const tablesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireStaff);

  // ---------------------------------------------------------------- List Table Rows
  app.get('/:table', async (req, reply) => {
    const { table } = req.params as { table: string };
    const tableCfg = TABLE_CONFIGS[table];
    if (!tableCfg) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    const queryParams = req.query as Record<string, string>;
    const orderParam = queryParams.order;
    const limit = Math.min(Math.max(parseInt(queryParams.limit || '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(queryParams.offset || '0', 10) || 0, 0);

    const filterKeys = Object.keys(queryParams).filter(
      (k) => k !== 'limit' && k !== 'offset' && tableCfg.readableColumns.includes(k)
    );

    const conditions: string[] = [];
    const values: any[] = [];
    filterKeys.forEach((key, idx) => {
      conditions.push(`${key} = $${idx + 1}`);
      values.push(queryParams[key]);
    });

    let orderByClause = '';
    if (orderParam) {
      const parts = orderParam.trim().split(/\s+/);
      const col = parts[0];
      const dir = parts[1]?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      if (tableCfg.readableColumns.includes(col)) {
        orderByClause = `ORDER BY ${col} ${dir}`;
      }
    }
    if (!orderByClause && tableCfg.defaultOrder) {
      orderByClause = `ORDER BY ${tableCfg.defaultOrder}`;
    }

    const cols = tableCfg.readableColumns.join(', ');
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitPlaceholder = `$${values.length + 1}`;
    const offsetPlaceholder = `$${values.length + 2}`;
    values.push(limit, offset);

    const sql = `SELECT ${cols} FROM public.${table} ${whereClause} ${orderByClause} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`.trim();

    const res = await withUser(req.user!.email, async (client) => {
      const r = await client.query(sql, values);
      return r.rows;
    });
    return res;
  });

  // ---------------------------------------------------------------- Create Table Row
  app.post('/:table', async (req, reply) => {
    const { table } = req.params as { table: string };
    const tableCfg = TABLE_CONFIGS[table];
    if (!tableCfg) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    if (req.user!.role !== 'admin' && !STAFF_WRITABLE.includes(table)) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const keys = Object.keys(body).filter(
      (k) => tableCfg.writableColumns.includes(k) && body[k] !== undefined
    );
    if (keys.length === 0) {
      return reply.status(400).send({ error: 'No valid writable fields provided' });
    }

    const values = keys.map((k) => body[k]);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const returnCols = tableCfg.readableColumns.join(', ');

    const sql = `INSERT INTO public.${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING ${returnCols}`;
    try {
      const res = await withUser(req.user!.email, async (client) => {
        const r = await client.query(sql, values);
        return r.rows[0];
      });
      return reply.status(201).send(res);
    } catch (err: any) {
      req.log.warn({ err, table }, 'Table insert failed');
      return reply.status(400).send({ error: sanitizeDbError(err) });
    }
  });

  // ---------------------------------------------------------------- Update Table Row
  app.put('/:table/:id', async (req, reply) => {
    const { table, id } = req.params as { table: string; id: string };
    const tableCfg = TABLE_CONFIGS[table];
    if (!tableCfg) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    if (req.user!.role !== 'admin' && !STAFF_WRITABLE.includes(table)) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const pkCol = tableCfg.pk;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const keys = Object.keys(body).filter(
      (k) => k !== pkCol && tableCfg.writableColumns.includes(k) && body[k] !== undefined
    );
    if (keys.length === 0) {
      return reply.status(400).send({ error: 'No valid fields to update' });
    }

    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [id, ...keys.map((k) => body[k])];
    const returnCols = tableCfg.readableColumns.join(', ');

    const sql = `UPDATE public.${table} SET ${setClauses} WHERE ${pkCol} = $1 RETURNING ${returnCols}`;
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
      req.log.warn({ err, table, id }, 'Table update failed');
      return reply.status(400).send({ error: sanitizeDbError(err) });
    }
  });

  // ---------------------------------------------------------------- Delete Table Row
  app.delete('/:table/:id', async (req, reply) => {
    const { table, id } = req.params as { table: string; id: string };
    const tableCfg = TABLE_CONFIGS[table];
    if (!tableCfg) {
      return reply.status(404).send({ error: 'Table not found' });
    }

    if (req.user!.role !== 'admin' && !STAFF_WRITABLE.includes(table)) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const pkCol = tableCfg.pk;

    try {
      const res = await withUser(req.user!.email, async (client) => {
        const r = await client.query(`DELETE FROM public.${table} WHERE ${pkCol} = $1 RETURNING ${pkCol}`, [id]);
        return r.rows[0] ?? null;
      });

      if (!res) {
        return reply.status(404).send({ error: 'Row not found or deletion not allowed' });
      }
      return reply.send({ ok: true });
    } catch (err: any) {
      req.log.warn({ err, table, id }, 'Table delete failed');
      return reply.status(400).send({ error: sanitizeDbError(err) });
    }
  });
};
