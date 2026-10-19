import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Dev/test only: loads fake users, sessions and responses. Run via `npm run seed`
// (tsx, from src). Refuses production. Needs DATABASE_ADMIN_URL.
try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

export async function seed(adminUrl = process.env.DATABASE_ADMIN_URL) {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed: NODE_ENV=production');
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required to seed');
  const sql = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed.sql'), 'utf8');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seed().then(
    () => { console.log('[seed] Done.'); process.exit(0); },
    (e) => { console.error(e); process.exit(1); }
  );
}
