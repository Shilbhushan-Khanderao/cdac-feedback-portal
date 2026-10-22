import { withUser } from '../../db/pool.js';
import { audit } from '../../shared/audit.js';
import { notFound } from '../../shared/errors.js';
import { assertCanWrite } from './authorize.js';
import { LIST_SCOPE, type TableConfig } from './configs.js';
import { checkFilter, type Row } from './schema.js';

interface Actor {
  email: string;
  role: string;
  ip: string;
}

export function listRows(actor: Actor, table: string, cfg: TableConfig, queryParams: Record<string, unknown>) {
  const limit = Math.min(Math.max(parseInt(String(queryParams.limit ?? '100'), 10) || 100, 1), 500);
  const offset = Math.max(parseInt(String(queryParams.offset ?? '0'), 10) || 0, 0);

  const conditions: string[] = [];
  const values: unknown[] = [];
  for (const key of Object.keys(queryParams)) {
    if (key === 'limit' || key === 'offset' || key === 'order' || !cfg.readableColumns.includes(key)) continue;
    values.push(checkFilter(table, key, queryParams[key]));
    conditions.push(`${key} = $${values.length}`);
  }
  if (LIST_SCOPE[table]) conditions.push(LIST_SCOPE[table]);

  let orderByClause = '';
  const orderParam = queryParams.order;
  if (typeof orderParam === 'string') {
    const parts = orderParam.trim().split(/\s+/);
    const dir = parts[1]?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    if (cfg.readableColumns.includes(parts[0])) orderByClause = `ORDER BY ${parts[0]} ${dir}`;
  }
  if (!orderByClause && cfg.defaultOrder) orderByClause = `ORDER BY ${cfg.defaultOrder}`;

  values.push(limit, offset);
  const sql = `SELECT ${cfg.readableColumns.join(', ')} FROM public.${table}
               ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
               ${orderByClause} LIMIT $${values.length - 1} OFFSET $${values.length}`;

  return withUser(actor.email, async (client) => {
    const rows = (await client.query(sql, values)).rows;
    // CMP-6: bulk PII reads get a light trail (action + table + actor + count), not a
    // row dump. Reference tables (batches, courses, ...) are deliberately left out here —
    // they carry no personal data, and auditing every GET on them would just be noise.
    if (table === 'student_roster' || table === 'staff_roster') {
      await audit({ actor: actor.email, action: 'BULK_READ', entityType: table, details: { count: rows.length }, ip: actor.ip }, client);
    }
    return rows;
  });
}

export function createRow(actor: Actor, table: string, cfg: TableConfig, data: Row) {
  return withUser(actor.email, async (client) => {
    await assertCanWrite(client, actor, table, 'create', undefined, data);
    const keys = Object.keys(data);
    const r = await client.query(
      `INSERT INTO public.${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING ${cfg.readableColumns.join(', ')}`,
      keys.map((k) => data[k])
    );
    await audit({ actor: actor.email, action: 'TABLE_CREATE', entityType: table, entityId: String(r.rows[0][cfg.pk]), details: { fields: keys }, ip: actor.ip }, client);
    return r.rows[0];
  });
}

export async function updateRow(actor: Actor, table: string, cfg: TableConfig, id: string, data: Row) {
  const keys = Object.keys(data);
  const row = await withUser(actor.email, async (client) => {
    await assertCanWrite(client, actor, table, 'update', id, data);
    const r = await client.query(
      `UPDATE public.${table} SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}
        WHERE ${cfg.pk} = $1 RETURNING ${cfg.readableColumns.join(', ')}`,
      [id, ...keys.map((k) => data[k])]
    );
    if (r.rows[0]) {
      await audit({ actor: actor.email, action: 'TABLE_UPDATE', entityType: table, entityId: id, details: { fields: keys }, ip: actor.ip }, client);
    }
    return r.rows[0] ?? null;
  });
  if (!row) throw notFound('Row not found or no changes allowed');
  return row;
}

export async function deleteRow(actor: Actor, table: string, cfg: TableConfig, id: string) {
  const deleted = await withUser(actor.email, async (client) => {
    await assertCanWrite(client, actor, table, 'delete', id, {});
    // The last-admin guard trigger rejects removing the final admin.
    const r = await client.query(`DELETE FROM public.${table} WHERE ${cfg.pk} = $1 RETURNING ${cfg.pk}`, [id]);
    if (r.rows[0]) {
      await audit({ actor: actor.email, action: 'TABLE_DELETE', entityType: table, entityId: id, ip: actor.ip }, client);
    }
    return r.rows[0] ?? null;
  });
  if (!deleted) throw notFound('Row not found or deletion not allowed');
}
