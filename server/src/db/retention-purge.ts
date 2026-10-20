import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Usage: node dist/db/retention-purge.js [--confirm] [--years N]
// Retention policy (VAPT CMP-2): closed feedback sessions' submissions/responses, and audit
// log rows, older than --years (default 2) are no longer needed for their original purpose.
// Without --confirm this only counts and prints what would be deleted (dry run, default).
// audit_logs is append-only (002_security.sql trg_audit_logs_no_change) by design, so this
// script is the one controlled, auditable path allowed to age it out: it disables the trigger,
// deletes, and re-enables the trigger inside a single transaction, so a crash mid-run rolls
// back to "still immutable" rather than leaving the table unprotected. Run manually/yearly by
// an operator, never from migrate.ts, which auto-applies on every deploy.
try {
  process.loadEnvFile();
} catch {
  // .env is optional
}

export async function retentionPurge(years: number, confirm: boolean, adminUrl = process.env.DATABASE_ADMIN_URL) {
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required');
  if (!Number.isFinite(years) || years <= 0) throw new Error('--years must be a positive number');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const cutoffSessions = await client.query(
      `SELECT count(*) FROM public.feedback_sessions WHERE closes_at < now() - ($1 || ' years')::interval`,
      [years]
    );
    const subs = await client.query(
      `SELECT count(*) FROM public.submissions s JOIN public.feedback_sessions f ON f.id = s.session_id
        WHERE f.closes_at < now() - ($1 || ' years')::interval`,
      [years]
    );
    const resp = await client.query(
      `SELECT count(*) FROM public.responses r JOIN public.feedback_sessions f ON f.id = r.session_id
        WHERE f.closes_at < now() - ($1 || ' years')::interval`,
      [years]
    );
    const audit = await client.query(`SELECT count(*) FROM public.audit_logs WHERE logged_at < now() - ($1 || ' years')::interval`, [years]);
    const counts = {
      expiredSessions: Number(cutoffSessions.rows[0].count),
      submissionsToDelete: Number(subs.rows[0].count),
      responsesToDelete: Number(resp.rows[0].count),
      auditLogsToDelete: Number(audit.rows[0].count),
    };
    if (!confirm) return { confirmed: false, ...counts };

    await client.query('BEGIN');
    await client.query(
      `DELETE FROM public.responses WHERE session_id IN
         (SELECT id FROM public.feedback_sessions WHERE closes_at < now() - ($1 || ' years')::interval)`,
      [years]
    );
    await client.query(
      `DELETE FROM public.submissions WHERE session_id IN
         (SELECT id FROM public.feedback_sessions WHERE closes_at < now() - ($1 || ' years')::interval)`,
      [years]
    );
    await client.query('ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_no_change');
    await client.query(`DELETE FROM public.audit_logs WHERE logged_at < now() - ($1 || ' years')::interval`, [years]);
    await client.query('ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_no_change');
    await client.query(
      `INSERT INTO public.audit_logs (actor_email, action, entity_type, details)
       VALUES ('retention-purge', 'RETENTION_PURGE', 'system', $1)`,
      [JSON.stringify({ years, ...counts })]
    );
    await client.query('COMMIT');
    return { confirmed: true, ...counts };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const yearsArg = args.indexOf('--years');
  const years = yearsArg >= 0 ? Number(args[yearsArg + 1]) : 2;
  retentionPurge(years, confirm).then(
    (r) => {
      console.log(`[retention-purge] years=${years} confirm=${r.confirmed}`, r);
      if (!r.confirmed) console.log('[retention-purge] Dry run only. Re-run with --confirm to delete.');
      process.exit(0);
    },
    (e) => { console.error(e.message ?? e); process.exit(1); }
  );
}
