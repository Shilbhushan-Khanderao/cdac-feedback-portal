import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Usage: node dist/db/bootstrap-admin.js <email> "<Full Name>"
// Creates (or promotes to) the first admin. Uses DATABASE_ADMIN_URL, audited.
try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

async function bootstrapAdmin(email: string, name: string, adminUrl = process.env.DATABASE_ADMIN_URL) {
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required');
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name.trim()) throw new Error('Usage: bootstrap-admin <email> <name>');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO public.staff_roster (email, full_name, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin', full_name = EXCLUDED.full_name, centre_id = NULL, course_id = NULL`,
      [email, name.trim()]
    );
    await client.query(
      `INSERT INTO public.audit_logs (actor_email, action, entity_type, entity_id) VALUES ('bootstrap-admin', 'ADMIN_BOOTSTRAP', 'staff_roster', $1)`,
      [email]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  bootstrapAdmin(process.argv[2] ?? '', process.argv[3] ?? '').then(
    () => { console.log('[bootstrap-admin] Admin ready.'); process.exit(0); },
    (e) => { console.error(e.message ?? e); process.exit(1); }
  );
}
