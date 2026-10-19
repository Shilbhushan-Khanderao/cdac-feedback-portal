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
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate] Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }

  // Seed runs in a separate transaction so a seed error
  // doesn't attempt ROLLBACK on the already-committed schema.
  const seedPath = path.join(__dirname, 'seed.sql');
  try {
    const seedSql = await fs.readFile(seedPath, 'utf8');
    const seedClient = await pool.connect();
    try {
      await seedClient.query('BEGIN');
      await seedClient.query(seedSql);
      await seedClient.query('COMMIT');
      console.log('[migrate] Seed data applied successfully.');
    } catch (seedErr) {
      await seedClient.query('ROLLBACK');
      console.error('[migrate] Seed failed:', seedErr);
      throw seedErr;
    } finally {
      seedClient.release();
    }
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
    // seed.sql is optional
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
