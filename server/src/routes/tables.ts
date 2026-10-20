import type { FastifyPluginAsync } from 'fastify';
import { requireStaff } from '../auth/guard.js';
import { withUser } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, mapDbError, notFound } from '../lib/errors.js';
import { EmailSchema, isUuid } from '../lib/validate.js';

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
  grievance_officers: {
    pk: 'id',
    readableColumns: ['id', 'full_name', 'email', 'active'],
    writableColumns: ['full_name', 'email', 'active'],
    defaultOrder: 'full_name ASC',
  },
};

const STAFF_WRITABLE = ['faculty', 'student_roster', 'modules'];

type Row = Record<string, any>;

/** Row-visibility scope appended to list queries (on top of RLS, which is the real boundary). */
const LIST_SCOPE: Record<string, string> = {
  student_roster: 'public.can_manage(centre_id, course_id)',
  staff_roster: '(email = public.my_email() OR public.is_my_centre(centre_id))',
};

/** Validate the primary-key path parameter before it reaches SQL. */
function checkPk(table: string, cfg: TableConfig, id: string) {
  const ok =
    cfg.pk === 'email'
      ? EmailSchema.safeParse(id).success
      : table === 'questions'
        ? id.length > 0 && id.length <= 100
        : isUuid(id);
  if (!ok) throw badRequest('Invalid identifier');
}

/** Filter values: strings only, UUID-checked for id-like columns. */
function checkFilter(table: string, col: string, v: unknown): string {
  if (typeof v !== 'string' || v.length > 254) throw badRequest(`Invalid ${col}`);
  const idLike = col === 'id' ? table !== 'questions' : col.endsWith('_id');
  if (idLike && !isUuid(v)) throw badRequest(`Invalid ${col}`);
  return v;
}

/** Whitelist writable columns and bound value shapes (scalars; string arrays <= 50 x 500 chars). */
function cleanBody(cfg: TableConfig, raw: unknown, skip?: string): Row {
  const body = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Row;
  const out: Row = {};
  for (const k of cfg.writableColumns) {
    if (k === skip || body[k] === undefined) continue;
    const v = body[k];
    const scalar = v === null || typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && v.length <= 2000);
    const arr = Array.isArray(v) && v.length <= 50 && v.every((x) => typeof x === 'string' && x.length <= 500);
    if (!scalar && !arr) throw badRequest(`Invalid value for ${k}`);
    out[k] = v;
  }
  return out;
}

/**
 * Explicit centre/course authorisation for CC writes (admins pass). Checks BOTH the existing
 * (source) row and the resulting (destination) values; RLS policies are the backstop.
 * May fill defaults into `data` (a CC's faculty defaults to their own centre).
 */
async function assertCanWrite(
  client: any,
  user: { email: string; role: string },
  table: string,
  action: 'create' | 'update' | 'delete',
  id: string | undefined,
  data: Row
): Promise<void> {
  if (user.role === 'admin') return;
  if (!STAFF_WRITABLE.includes(table)) throw forbidden('Admin access required');

  const staff = (await client.query('SELECT centre_id, course_id FROM public.staff_roster WHERE email = $1', [user.email])).rows[0];
  if (!staff) throw forbidden('Staff record not found');

  if (table === 'modules') {
    if (!staff.course_id) return; // CC covers every course at their centre
    if (action === 'create') {
      if (data.course_id !== staff.course_id) throw forbidden('You can only add modules for your assigned course');
      return;
    }
    const mod = (await client.query('SELECT course_id FROM public.modules WHERE id = $1', [id])).rows[0];
    if (!mod) throw notFound('Module not found');
    if (mod.course_id !== staff.course_id) throw forbidden('You can only edit or delete modules for your assigned course');
    if (action === 'update' && data.course_id && data.course_id !== staff.course_id) {
      throw forbidden('Cannot change module course assignment');
    }
  } else if (table === 'faculty') {
    if (action === 'create') {
      data.centre_id ??= staff.centre_id;
      if (data.centre_id !== staff.centre_id) throw forbidden('You can only add faculty for your own centre');
      return;
    }
    const fac = (await client.query('SELECT centre_id FROM public.faculty WHERE id = $1', [id])).rows[0];
    if (!fac) throw notFound('Faculty not found');
    if (fac.centre_id !== staff.centre_id) throw forbidden('You can only edit or delete faculty for your own centre');
    if (action === 'update' && data.centre_id !== undefined && data.centre_id !== staff.centre_id) {
      throw forbidden('You can only assign faculty to your own centre');
    }
  } else if (table === 'student_roster') {
    let centre: string | undefined = data.centre_id;
    let course: string | undefined = data.course_id;
    if (action !== 'create') {
      // Source row (RLS only shows rows we can manage, so foreign rows read as "not found").
      const cur = (await client.query('SELECT centre_id, course_id FROM public.student_roster WHERE email = $1', [id])).rows[0];
      if (!cur) throw notFound('Row not found or no changes allowed');
      const src = await client.query('SELECT public.can_manage($1, $2) AS ok', [cur.centre_id, cur.course_id]);
      if (!src.rows[0]?.ok) throw forbidden('You cannot manage this student');
      centre ??= cur.centre_id;
      course ??= cur.course_id;
    }
    if (action !== 'delete') {
      if (!centre || !course) throw badRequest('centre_id and course_id are required');
      const dst = await client.query('SELECT public.can_manage($1, $2) AS ok', [centre, course]);
      if (!dst.rows[0]?.ok) throw forbidden('You cannot manage student roster for this cohort');
    }
  } else if (table === 'staff_roster') {
    // Independent of STAFF_WRITABLE (VAPT AZ-1): role/centre_id/course_id are the columns a
    // staff write could use for privilege escalation (self-promotion to admin, or reassigning
    // oneself to another centre/course). staff_roster isn't in STAFF_WRITABLE today, so this
    // branch is currently unreachable for non-admins — it stays as a second, independent block
    // so adding the table there later can't reopen escalation on its own.
    throw forbidden('Admin access required');
  }
}

export const tablesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireStaff);

  // ---------------------------------------------------------------- List Table Rows
  app.get('/:table', async (req) => {
    const { table } = req.params as { table: string };
    const tableCfg = TABLE_CONFIGS[table];
    if (!tableCfg) throw notFound('Table not found');

    const queryParams = req.query as Record<string, unknown>;
    const limit = Math.min(Math.max(parseInt(String(queryParams.limit ?? '100'), 10) || 100, 1), 500);
    const offset = Math.max(parseInt(String(queryParams.offset ?? '0'), 10) || 0, 0);

    const conditions: string[] = [];
    const values: unknown[] = [];
    for (const key of Object.keys(queryParams)) {
      if (key === 'limit' || key === 'offset' || key === 'order' || !tableCfg.readableColumns.includes(key)) continue;
      values.push(checkFilter(table, key, queryParams[key]));
      conditions.push(`${key} = $${values.length}`);
    }
    if (LIST_SCOPE[table]) conditions.push(LIST_SCOPE[table]);

    let orderByClause = '';
    const orderParam = queryParams.order;
    if (typeof orderParam === 'string') {
      const parts = orderParam.trim().split(/\s+/);
      const dir = parts[1]?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      if (tableCfg.readableColumns.includes(parts[0])) orderByClause = `ORDER BY ${parts[0]} ${dir}`;
    }
    if (!orderByClause && tableCfg.defaultOrder) orderByClause = `ORDER BY ${tableCfg.defaultOrder}`;

    values.push(limit, offset);
    const sql = `SELECT ${tableCfg.readableColumns.join(', ')} FROM public.${table}
                 ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
                 ${orderByClause} LIMIT $${values.length - 1} OFFSET $${values.length}`;

    try {
      return await withUser(req.user!.email, async (client) => (await client.query(sql, values)).rows);
    } catch (err) {
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Create Table Row
  app.post('/:table', async (req, reply) => {
    const { table } = req.params as { table: string };
    const tableCfg = TABLE_CONFIGS[table];
    if (!tableCfg) throw notFound('Table not found');

    const data = cleanBody(tableCfg, req.body);
    if (Object.keys(data).length === 0) throw badRequest('No valid writable fields provided');

    try {
      const row = await withUser(req.user!.email, async (client) => {
        await assertCanWrite(client, req.user!, table, 'create', undefined, data);
        const keys = Object.keys(data);
        const r = await client.query(
          `INSERT INTO public.${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
           RETURNING ${tableCfg.readableColumns.join(', ')}`,
          keys.map((k) => data[k])
        );
        await audit({ actor: req.user!.email, action: 'TABLE_CREATE', entityType: table, entityId: String(r.rows[0][tableCfg.pk]), details: { fields: keys }, ip: req.ip }, client);
        return r.rows[0];
      });
      return reply.status(201).send(row);
    } catch (err) {
      req.log.warn({ err, table }, 'Table insert failed');
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Update Table Row
  app.put('/:table/:id', async (req) => {
    const { table, id } = req.params as { table: string; id: string };
    const tableCfg = TABLE_CONFIGS[table];
    if (!tableCfg) throw notFound('Table not found');
    checkPk(table, tableCfg, id);

    const data = cleanBody(tableCfg, req.body, tableCfg.pk);
    const keys = Object.keys(data);
    if (keys.length === 0) throw badRequest('No valid fields to update');

    try {
      const row = await withUser(req.user!.email, async (client) => {
        await assertCanWrite(client, req.user!, table, 'update', id, data);
        const r = await client.query(
          `UPDATE public.${table} SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}
            WHERE ${tableCfg.pk} = $1 RETURNING ${tableCfg.readableColumns.join(', ')}`,
          [id, ...keys.map((k) => data[k])]
        );
        if (r.rows[0]) {
          await audit({ actor: req.user!.email, action: 'TABLE_UPDATE', entityType: table, entityId: id, details: { fields: keys }, ip: req.ip }, client);
        }
        return r.rows[0] ?? null;
      });
      if (!row) throw notFound('Row not found or no changes allowed');
      return row;
    } catch (err) {
      req.log.warn({ err, table, id }, 'Table update failed');
      throw mapDbError(err);
    }
  });

  // ---------------------------------------------------------------- Delete Table Row
  app.delete('/:table/:id', async (req) => {
    const { table, id } = req.params as { table: string; id: string };
    const tableCfg = TABLE_CONFIGS[table];
    if (!tableCfg) throw notFound('Table not found');
    checkPk(table, tableCfg, id);

    try {
      const deleted = await withUser(req.user!.email, async (client) => {
        await assertCanWrite(client, req.user!, table, 'delete', id, {});
        // The last-admin guard trigger rejects removing the final admin.
        const r = await client.query(`DELETE FROM public.${table} WHERE ${tableCfg.pk} = $1 RETURNING ${tableCfg.pk}`, [id]);
        if (r.rows[0]) {
          await audit({ actor: req.user!.email, action: 'TABLE_DELETE', entityType: table, entityId: id, ip: req.ip }, client);
        }
        return r.rows[0] ?? null;
      });
      if (!deleted) throw notFound('Row not found or deletion not allowed');
      return { ok: true };
    } catch (err) {
      req.log.warn({ err, table, id }, 'Table delete failed');
      throw mapDbError(err);
    }
  });
};
