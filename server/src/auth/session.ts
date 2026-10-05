import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { config } from '../config.js';

export interface UserSession {
  id: string;
  email: string;
  role: 'student' | 'cc' | 'admin';
  expires_at: Date;
}

export async function createSession(
  email: string,
  role: 'student' | 'cc' | 'admin',
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600 * 1000);

  await query(
    `INSERT INTO public.user_sessions (id, email, role, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, email.toLowerCase(), role, expiresAt, ipAddress ?? null, userAgent ?? null]
  );

  // CERT-In 180-day compliance logging
  await query(
    `INSERT INTO public.audit_logs (actor_email, action, entity_type, entity_id, ip_address)
     VALUES ($1, 'LOGIN', 'user_sessions', $2, $3)`,
    [email.toLowerCase(), sessionId, ipAddress ?? null]
  );

  return sessionId;
}

export async function getSession(sessionId: string): Promise<UserSession | null> {
  const res = await query<UserSession>(
    `SELECT id, email, role, expires_at
       FROM public.user_sessions
      WHERE id = $1 AND expires_at > now()`,
    [sessionId]
  );
  return res.rows[0] ?? null;
}

export async function destroySession(sessionId: string, ipAddress?: string): Promise<void> {
  const res = await query<{ email: string }>(
    `DELETE FROM public.user_sessions WHERE id = $1 RETURNING email`,
    [sessionId]
  );
  if (res.rows[0]) {
    await query(
      `INSERT INTO public.audit_logs (actor_email, action, entity_type, entity_id, ip_address)
       VALUES ($1, 'LOGOUT', 'user_sessions', $2, $3)`,
      [res.rows[0].email, sessionId, ipAddress ?? null]
    );
  }
}
