import { badRequest } from '../../shared/errors.js';
import { EmailSchema, isUuid } from '../../shared/validate.js';
import type { TableConfig } from './configs.js';

export type Row = Record<string, any>;

/** Validate the primary-key path parameter before it reaches SQL. */
export function checkPk(table: string, cfg: TableConfig, id: string) {
  const ok =
    cfg.pk === 'email'
      ? EmailSchema.safeParse(id).success
      : table === 'questions'
        ? id.length > 0 && id.length <= 100
        : isUuid(id);
  if (!ok) throw badRequest('Invalid identifier');
}

/** Filter values: strings only, UUID-checked for id-like columns. */
export function checkFilter(table: string, col: string, v: unknown): string {
  if (typeof v !== 'string' || v.length > 254) throw badRequest(`Invalid ${col}`);
  const idLike = col === 'id' ? table !== 'questions' : col.endsWith('_id');
  if (idLike && !isUuid(v)) throw badRequest(`Invalid ${col}`);
  return v;
}

/** Whitelist writable columns and bound value shapes (scalars; string arrays <= 50 x 500 chars). */
export function cleanBody(cfg: TableConfig, raw: unknown, skip?: string): Row {
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
