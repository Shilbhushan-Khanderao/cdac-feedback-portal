import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Standalone on purpose: no import of config.ts/pool.ts (those need the app env and the
// app role). Uses DATABASE_ADMIN_URL (owner/superuser). Never seeds.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROLE = 'feedback_app';

try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

async function ensureAppRole(client: pg.Client) {
  const pw = process.env.APP_DB_PASSWORD;
  const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_ROLE])).rowCount;
  if (!exists && !pw) throw new Error('APP_DB_PASSWORD is required to create the feedback_app role');
  // format(%L) quotes the password server-side; DDL cannot take bind parameters.
  const attrs = 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION';
  if (!exists) {
    const { rows } = await client.query(`SELECT format('CREATE ROLE ${APP_ROLE} ${attrs} PASSWORD %L', $1::text) AS s`, [pw]);
    await client.query(rows[0].s);
    console.log(`[migrate] Created role ${APP_ROLE}`);
  } else {
    // Re-assert the safe attributes; rotate password when one is supplied.
    await client.query(`ALTER ROLE ${APP_ROLE} ${attrs}`);
    if (pw) {
      const { rows } = await client.query(`SELECT format('ALTER ROLE ${APP_ROLE} PASSWORD %L', $1::text) AS s`, [pw]);
      await client.query(rows[0].s);
    }
  }
  const { rows } = await client.query(`SELECT format('GRANT CONNECT ON DATABASE %I TO ${APP_ROLE}', current_database()) AS s`);
  await client.query(rows[0].s);
}

export async function runMigrations(adminUrl = process.env.DATABASE_ADMIN_URL) {
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required to run migrations');
  const dir = path.join(__dirname, 'migrations');
  const files = (await fs.readdir(dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)'); // serialise concurrent runners
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await client.query('REVOKE ALL ON public.schema_migrations FROM PUBLIC');
    await ensureAppRole(client);

    const done = new Set((await client.query('SELECT version FROM public.schema_migrations')).rows.map((r) => r.version));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await fs.readFile(path.join(dir, f), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [f]);
        await client.query('COMMIT');
        console.log(`[migrate] Applied ${f}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] ${f} failed`);
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('[migrate] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
