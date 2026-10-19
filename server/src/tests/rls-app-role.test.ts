import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminPool, adminQuery, hasAdminDb } from './admin-db.js';

/**
 * Security regression suite. Every assertion runs through the REAL app code path
 * (withUser => SET LOCAL ROLE feedback_app + identity GUC) against a migrated database.
 * Needs DATABASE_URL (feedback_app) and DATABASE_ADMIN_URL (owner). Skipped otherwise.
 * Fixtures are created with unique names and removed afterwards.
 */
describe.skipIf(!hasAdminDb)('RLS / anonymity as the feedback_app role', () => {
  const tag = Math.random().toString(36).slice(2, 8);
  const em = (n: string) => `${n}.${tag}@rls.test`;
  const ccA = em('cca'), ccB = em('ccb'), adminE = em('admin'), stuA = em('stua'), stuB = em('stub');

  let withUser: typeof import('../db/pool.js').withUser;
  let poolEnd: () => Promise<void>;
  const id: Record<string, string> = {};

  const one = async (sql: string, p: any[] = []) => (await adminQuery(sql, p)).rows[0];
  const as = <T>(email: string, fn: (q: (sql: string, p?: any[]) => Promise<any>) => Promise<T>) =>
    withUser(email, (c) => fn((sql, p) => c.query(sql, p)));

  beforeAll(async () => {
    const { runMigrations } = await import('../db/migrate.js');
    await runMigrations(); // idempotent
    const mod = await import('../db/pool.js');
    withUser = mod.withUser;
    poolEnd = () => mod.pool.end();

    id.cA = (await one(`INSERT INTO centres (name, kind) VALUES ($1,'cdac') RETURNING id`, [`CentreA-${tag}`])).id;
    id.cB = (await one(`INSERT INTO centres (name, kind) VALUES ($1,'cdac') RETURNING id`, [`CentreB-${tag}`])).id;
    id.course = (await one(`INSERT INTO courses (code, name) VALUES ($1,'RLS course') RETURNING id`, [`RLS-${tag}`])).id;
    id.batch = (await one(`INSERT INTO batches (label) VALUES ($1) RETURNING id`, [`Batch ${tag}`])).id;
    id.mod = (await one(`INSERT INTO modules (course_id, name) VALUES ($1,'RLS module') RETURNING id`, [id.course])).id;

    await adminQuery(`INSERT INTO staff_roster (email, full_name, role) VALUES ($1,'Admin','admin')`, [adminE]);
    await adminQuery(`INSERT INTO staff_roster (email, full_name, role, centre_id) VALUES ($1,'CC A','cc',$2)`, [ccA, id.cA]);
    await adminQuery(`INSERT INTO staff_roster (email, full_name, role, centre_id) VALUES ($1,'CC B','cc',$2)`, [ccB, id.cB]);
    await adminQuery(
      `INSERT INTO student_roster (email, prn, full_name, batch_id, centre_id, course_id) VALUES
         ($1,$2,'Stu A',$5,$6,$7), ($3,$4,'Stu B',$5,$8,$7)`,
      [stuA, `PA-${tag}`, stuB, `PB-${tag}`, id.batch, id.cA, id.course, id.cB]
    );

    const mkSession = async (centre: string, opens: string, closes: string) =>
      (await one(
        `INSERT INTO feedback_sessions (batch_id, centre_id, course_id, module_id, opens_at, closes_at)
         VALUES ($1,$2,$3,$4, now() + $5::interval, now() + $6::interval) RETURNING id`,
        [id.batch, centre, id.course, id.mod, opens, closes]
      )).id;
    id.sA = await mkSession(id.cA, '-3 days', '-1 day'); // closed
    id.sB = await mkSession(id.cB, '-3 days', '-1 day'); // closed
    id.sOpenA = await mkSession(id.cA, '-1 day', '1 day'); // open
    for (let i = 0; i < 3; i++) {
      await adminQuery(`INSERT INTO responses (session_id, answers) VALUES ($1,$2)`, [id.sA, JSON.stringify({ overall: 'Good' })]);
    }
    await adminQuery(`INSERT INTO submissions (session_id, email) VALUES ($1,$2)`, [id.sA, stuA]);
  });

  afterAll(async () => {
    if (!hasAdminDb) return;
    const sessions = [id.sA, id.sB, id.sOpenA].filter(Boolean);
    await adminQuery(`DELETE FROM responses WHERE session_id = ANY($1)`, [sessions]);
    await adminQuery(`DELETE FROM submissions WHERE session_id = ANY($1)`, [sessions]);
    await adminQuery(`DELETE FROM feedback_sessions WHERE id = ANY($1)`, [sessions]);
    await adminQuery(`DELETE FROM student_roster WHERE email = ANY($1)`, [[stuA, stuB]]);
    await adminQuery(`DELETE FROM staff_roster WHERE email = ANY($1)`, [[ccA, ccB]]);
    await adminQuery(`DELETE FROM staff_roster WHERE email = $1 AND (SELECT count(*) FROM staff_roster WHERE role='admin') > 1`, [adminE]);
    await adminQuery(`DELETE FROM modules WHERE id = $1`, [id.mod]);
    await adminQuery(`DELETE FROM courses WHERE id = $1`, [id.course]);
    await adminQuery(`DELETE FROM batches WHERE id = $1`, [id.batch]);
    await adminQuery(`DELETE FROM centres WHERE id = ANY($1)`, [[id.cA, id.cB]]);
    await poolEnd?.();
    await adminPool.end();
  });

  it('the app connection is neither superuser nor BYPASSRLS', async () => {
    const r = await as(ccA, (q) => q(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`));
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('CC-A sees only centre A sessions and cannot touch centre B', async () => {
    const list = await as(ccA, (q) => q(`SELECT id FROM feedback_sessions WHERE id = ANY($1)`, [[id.sA, id.sB, id.sOpenA]]));
    expect(list.rows.map((r: any) => r.id).sort()).toEqual([id.sA, id.sOpenA].sort());

    const upd = await as(ccA, (q) => q(`UPDATE feedback_sessions SET faculty = '{x}' WHERE id = $1`, [id.sB]));
    expect(upd.rowCount).toBe(0);
    const del = await as(ccA, (q) => q(`DELETE FROM feedback_sessions WHERE id = $1`, [id.sB]));
    expect(del.rowCount).toBe(0);
    await expect(
      as(ccA, (q) =>
        q(`INSERT INTO feedback_sessions (batch_id, centre_id, course_id, module_id, opens_at, closes_at)
           VALUES ($1,$2,$3,$4, now(), now() + interval '1 day')`, [id.batch, id.cB, id.course, id.mod])
      )
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('CC-A cannot read, steal or re-home centre B students', async () => {
    const seen = await as(ccA, (q) => q(`SELECT email FROM student_roster WHERE email = ANY($1)`, [[stuA, stuB]]));
    expect(seen.rows.map((r: any) => r.email)).toEqual([stuA]);

    // Upsert onto B's student: source row is outside CC-A's scope => RLS error.
    await expect(
      as(ccA, (q) =>
        q(`INSERT INTO student_roster (email, prn, full_name, batch_id, centre_id, course_id)
           VALUES ($1,'x','x',$2,$3,$4)
           ON CONFLICT (email) DO UPDATE SET centre_id = EXCLUDED.centre_id`, [stuB, id.batch, id.cA, id.course])
      )
    ).rejects.toMatchObject({ code: '42501' });

    // Moving own student into centre B (destination) is refused too.
    await expect(as(ccA, (q) => q(`UPDATE student_roster SET centre_id = $1 WHERE email = $2`, [id.cB, stuA]))).rejects.toMatchObject({ code: '42501' });
  });

  it('a student sees only their own cohort and their own roster row', async () => {
    const s = await as(stuA, (q) => q(`SELECT id FROM feedback_sessions WHERE id = ANY($1)`, [[id.sA, id.sB, id.sOpenA]]));
    expect(s.rows.map((r: any) => r.id).sort()).toEqual([id.sA, id.sOpenA].sort());
    const r = await as(stuA, (q) => q(`SELECT email FROM student_roster WHERE email = ANY($1)`, [[stuA, stuB]]));
    expect(r.rows.map((x: any) => x.email)).toEqual([stuA]);
  });

  it('nobody can SELECT responses, and CCs cannot see submitted_at', async () => {
    for (const who of [ccA, adminE, stuA]) {
      await expect(as(who, (q) => q(`SELECT * FROM responses`))).rejects.toMatchObject({ code: '42501' });
      await expect(as(who, (q) => q(`INSERT INTO responses (session_id, answers) VALUES ($1,'{}')`, [id.sA]))).rejects.toMatchObject({ code: '42501' });
    }
    await expect(as(ccA, (q) => q(`SELECT submitted_at FROM submissions`))).rejects.toMatchObject({ code: '42501' });
    await expect(as(ccA, (q) => q(`INSERT INTO submissions (session_id, email) VALUES ($1,$2)`, [id.sOpenA, stuA]))).rejects.toMatchObject({ code: '42501' });
  });

  it('answers are reachable only through session_report (own centre, closed, n>=3)', async () => {
    const ok = await as(ccA, (q) => q(`SELECT public.session_report($1) AS r`, [id.sA]));
    expect(ok.rows[0].r.status).toBe('ready');
    expect(ok.rows[0].r.total).toBe(3);
    await expect(as(ccA, (q) => q(`SELECT public.session_report($1)`, [id.sB]))).rejects.toMatchObject({ code: 'P0001' });
    const open = await as(ccA, (q) => q(`SELECT public.session_report($1) AS r`, [id.sOpenA]));
    expect(open.rows[0].r.status).toBe('open');
  });

  it('a closed session schedule is immutable for every role, including the owner', async () => {
    await expect(as(ccA, (q) => q(`UPDATE feedback_sessions SET closes_at = now() + interval '1 day' WHERE id = $1`, [id.sA]))).rejects.toThrow(/closed/);
    await expect(as(adminE, (q) => q(`UPDATE feedback_sessions SET opens_at = now() WHERE id = $1`, [id.sA]))).rejects.toThrow(/closed/);
    await expect(adminQuery(`UPDATE feedback_sessions SET closes_at = now() + interval '1 day' WHERE id = $1`, [id.sA])).rejects.toThrow(/closed/);
  });

  it('sessions with submissions cannot be deleted', async () => {
    await expect(adminQuery(`DELETE FROM feedback_sessions WHERE id = $1`, [id.sA])).rejects.toThrow(/submissions/);
  });

  it('audit_logs is append-only', async () => {
    await adminQuery(`INSERT INTO audit_logs (actor_email, action, entity_type) VALUES ($1,'TEST','test')`, [adminE]);
    await expect(as(adminE, (q) => q(`UPDATE audit_logs SET action = 'x'`))).rejects.toMatchObject({ code: '42501' });
    await expect(as(adminE, (q) => q(`DELETE FROM audit_logs`))).rejects.toMatchObject({ code: '42501' });
    await expect(adminQuery(`UPDATE audit_logs SET action = 'x' WHERE actor_email = $1`, [adminE])).rejects.toThrow(/append-only/);
    await expect(adminQuery(`DELETE FROM audit_logs WHERE actor_email = $1`, [adminE])).rejects.toThrow(/append-only/);
    await expect(adminQuery(`TRUNCATE audit_logs`)).rejects.toThrow(/append-only/);
  });

  it('the last admin cannot be deleted or demoted', async () => {
    const c = await adminPool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`DELETE FROM staff_roster WHERE role = 'admin' AND email <> $1`, [adminE]);
      await expect(c.query(`DELETE FROM staff_roster WHERE email = $1`, [adminE])).rejects.toThrow(/last admin/);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('a forged request.jwt.claims GUC grants no identity', async () => {
    const r = await withUser(null, async (c) => {
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ email: adminE })]);
      return c.query(`SELECT public.is_admin() AS a, public.my_email() AS e`);
    });
    expect(r.rows[0]).toEqual({ a: false, e: null });
  });
});
