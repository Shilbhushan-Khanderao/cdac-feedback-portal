import type pg from 'pg';
import { query } from '../db/pool.js';

interface AuditEvent {
  actor: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

/** Append an audit row. Pass `client` to make it atomic with the action being audited. */
export async function audit(e: AuditEvent, client?: pg.PoolClient): Promise<void> {
  const sql = `INSERT INTO public.audit_logs (actor_email, action, entity_type, entity_id, details, ip_address)
               VALUES ($1, $2, $3, $4, $5, $6)`;
  const params = [e.actor, e.action, e.entityType, e.entityId ?? null, JSON.stringify(e.details ?? {}), e.ip ?? null];
  await (client ? client.query(sql, params) : query(sql, params));
}

/** "student@cdac.in" -> "st***@cdac.in": enough to trace a roster change, not a full identifier. */
export const maskEmail = (email: string) => email.replace(/^(.{1,2})[^@]*@/, '$1***@');
