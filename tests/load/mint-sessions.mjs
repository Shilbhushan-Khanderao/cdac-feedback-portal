// STAGING ONLY. NEVER RUN AGAINST PRODUCTION: it inserts fake students and live login sessions.
// Usage (from repo root):
//   CONFIRM_STAGING=yes DATABASE_URL=postgres://...staging COOKIE_SECRET=<staging secret> \
//   TARGET_SESSION_ID=<open feedback_sessions.id> N=1500 node tests/load/mint-sessions.mjs
// Creates loadNNNN@loadtest.local students in the target session's cohort, N signed cookies,
// and one cookie per existing staff email in CC_EMAILS (default cc@test.local).
// Writes tests/load/cookies.json (gitignored; delete after the run). Cleanup SQL: docs/ops/TEST-AND-LOAD-PLAN.md.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const pg = createRequire(import.meta.url)('../../server/node_modules/pg'); // reuse server's pg, no new dep

const E = process.env;
if (E.CONFIRM_STAGING !== 'yes') { console.error('Set CONFIRM_STAGING=yes (staging DB only).'); process.exit(2); }
if (/prod/i.test(E.DATABASE_URL || '')) { console.error('DATABASE_URL contains "prod". Refusing.'); process.exit(2); }
for (const k of ['DATABASE_URL', 'COOKIE_SECRET', 'TARGET_SESSION_ID']) if (!E[k]) { console.error(`${k} required`); process.exit(2); }
const N = +(E.N || 1500), ccEmails = (E.CC_EMAILS || 'cc@test.local').split(',');
// Same format as @fastify/cookie sign(): value + '.' + base64(HMAC-SHA256) without padding.
const sign = (v) => `${v}.${crypto.createHmac('sha256', E.COOKIE_SECRET).update(v).digest('base64').replace(/=+$/, '')}`;
const cookie = (id) => `cdac_session=${encodeURIComponent(sign(id))}`;

const db = new pg.Client({ connectionString: E.DATABASE_URL });
await db.connect();
const { rows: [s] } = await db.query('SELECT batch_id, centre_id, course_id FROM public.feedback_sessions WHERE id=$1', [E.TARGET_SESSION_ID]);
if (!s) throw new Error('TARGET_SESSION_ID not found');

const students = [], cc = [];
try {
  await db.query('BEGIN');
  for (let i = 1; i <= N; i++) {
    const n = String(i).padStart(4, '0'), email = `load${n}@loadtest.local`, id = crypto.randomBytes(32).toString('hex');
    await db.query(`INSERT INTO public.student_roster (email,prn,full_name,batch_id,centre_id,course_id)
                    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING`, [email, `LOAD${n}`, `Load Student ${i}`, s.batch_id, s.centre_id, s.course_id]);
    await db.query(`INSERT INTO public.user_sessions (id,email,role,expires_at) VALUES ($1,$2,'student', now()+interval '6 hours')`, [id, email]);
    students.push(cookie(id));
  }
  for (const email of ccEmails) {
    const { rows: [r] } = await db.query('SELECT role FROM public.staff_roster WHERE email=$1', [email]);
    if (!r) throw new Error(`${email} not in staff_roster`);
    const id = crypto.randomBytes(32).toString('hex');
    await db.query(`INSERT INTO public.user_sessions (id,email,role,expires_at) VALUES ($1,$2,$3, now()+interval '6 hours')`, [id, email, r.role]);
    cc.push(cookie(id));
  }
  await db.query('COMMIT');
} catch (e) { await db.query('ROLLBACK'); throw e; } finally { await db.end(); }
fs.writeFileSync(E.OUT || 'tests/load/cookies.json', JSON.stringify({ sessionId: E.TARGET_SESSION_ID, reportSessionId: E.REPORT_SESSION_ID, students, cc }));
console.log(`minted ${students.length} student + ${cc.length} staff sessions`);
