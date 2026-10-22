import crypto from 'node:crypto';
import { query } from '../../db/pool.js';
import { config } from '../../config.js';
import { audit } from '../../shared/audit.js';

export interface UserSession {
  id: string;
  email: string;
  role: 'student' | 'cc' | 'admin';
  expires_at: Date;
}

/** The cookie carries the random token; the DB only ever stores its SHA-256. */
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Current role from the rosters (null = not on any roster). Works without a user context. */
export async function lookupRole(email: string): Promise<UserSession['role'] | null> {
  const res = await query<{ r: UserSession['role'] | null }>('SELECT public.auth_role($1) AS r', [email.toLowerCase()]);
  return res.rows[0]?.r ?? null;
}

export async function createSession(
  email: string,
  role: 'student' | 'cc' | 'admin',
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600 * 1000);

  await query(
    `INSERT INTO public.user_sessions (id, email, role, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, email.toLowerCase(), role, expiresAt, ipAddress ?? null, userAgent ?? null]
  );
  await audit({ actor: email.toLowerCase(), action: 'LOGIN', entityType: 'user_sessions', entityId: id.slice(0, 12), ip: ipAddress });
  return token;
}

/**
 * Valid session + the user's CURRENT roster role. If the roster row is gone (access
 * revoked) the session is treated as invalid and removed.
 */
export async function getSession(token: string): Promise<UserSession | null> {
  const id = hashToken(token);
  const res = await query<UserSession>(
    `SELECT id, email, public.auth_role(email) AS role, expires_at
       FROM public.user_sessions
      WHERE id = $1 AND expires_at > now()`,
    [id]
  );
  const s = res.rows[0];
  if (!s) return null;
  if (!s.role) {
    await query('DELETE FROM public.user_sessions WHERE id = $1', [id]);
    return null;
  }
  return s;
}

export async function destroySession(token: string, ipAddress?: string): Promise<void> {
  const id = hashToken(token);
  const res = await query<{ email: string }>(`DELETE FROM public.user_sessions WHERE id = $1 RETURNING email`, [id]);
  if (res.rows[0]) {
    await audit({ actor: res.rows[0].email, action: 'LOGOUT', entityType: 'user_sessions', entityId: id.slice(0, 12), ip: ipAddress });
  }
}

export async function purgeExpiredSessions(): Promise<number> {
  const res = await query('DELETE FROM public.user_sessions WHERE expires_at <= now()');
  return res.rowCount ?? 0;
}
