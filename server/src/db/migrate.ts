import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  console.log('[migrate] Starting database migration...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('[migrate] Schema applied successfully.');

    const seedPath = path.join(__dirname, 'seed.sql');
    try {
      const seedSql = await fs.readFile(seedPath, 'utf8');
      await client.query('BEGIN');
      await client.query(seedSql);
      await client.query('COMMIT');
      console.log('[migrate] Seed data applied successfully.');
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate] Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run directly if invoked from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
