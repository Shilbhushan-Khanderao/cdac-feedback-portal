import pg from 'pg';

try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

/** Owner/superuser connection for test fixtures and assertions the app role may not make. */
export const hasAdminDb = Boolean(process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL);

export const adminPool = new pg.Pool({
  connectionString: process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL,
  max: 2,
});

export function adminQuery<R extends pg.QueryResultRow = any>(text: string, params?: any[]) {
  return adminPool.query<R>(text, params);
}
