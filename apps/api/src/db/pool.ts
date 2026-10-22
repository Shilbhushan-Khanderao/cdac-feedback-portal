import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client', err);
});

/** Execute a query with connection pooling */
export async function query<R extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<R>> {
  return pool.query<R>(text, params);
}

let appRoleAvailable: boolean | null = null;

async function hasFeedbackAppRole(client: pg.PoolClient): Promise<boolean> {
  if (appRoleAvailable !== null) return appRoleAvailable;
  try {
    const res = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'feedback_app'");
    appRoleAvailable = (res.rowCount ?? 0) > 0;
  } catch {
    appRoleAvailable = false;
  }
  return appRoleAvailable;
}

/** Execute work within a transaction setting app.current_user_email for RLS / audit triggers */
export async function withUser<T>(
  email: string | null,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Pin the unprivileged role (no-op for the normal feedback_app connection; strips
    // superuser rights if DATABASE_URL were ever misconfigured) and set the identity
    // GUC, both for this transaction only. A null email leaves my_email() NULL.
    if (await hasFeedbackAppRole(client)) {
      await client.query('SET LOCAL ROLE feedback_app');
    }
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_email', email ?? '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
