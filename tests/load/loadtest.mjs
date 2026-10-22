// Real HTTP load test (Node >=18, built-in fetch, no deps). Run against STAGING via nginx.
//   BASE_URL=https://staging.example MODE=dev node tests/load/loadtest.mjs
//   BASE_URL=... MODE=cookie COOKIES_FILE=tests/load/cookies.json node tests/load/loadtest.mjs
// Env: VUS=1500 RAMP_S=120 CC_PCT=2 THINK_MS=1500 REPORT_SESSION_ID=<closed session uuid> OUT=tests/load/summary.json
import fs from 'node:fs';

const E = process.env;
const BASE = (E.BASE_URL || '').replace(/\/$/, '');
if (!BASE) { console.error('BASE_URL required'); process.exit(2); }
if (/prod/i.test(BASE) && E.ALLOW_PROD !== 'no-really') {
  console.error('BASE_URL looks like production. Staging only.'); process.exit(2);
}
const MODE = E.MODE || 'dev';
const VUS = +(E.VUS || 1500), RAMP_S = +(E.RAMP_S || 120), CC_PCT = +(E.CC_PCT || 2);
const THINK = +(E.THINK_MS || 1500), OUT = E.OUT || 'tests/load/summary.json';
const P95_MS = 1000;

// Seeded students (apps/api/src/db/seed.sql): pune 1-20, mumbai 1-15, bda 1-15, ai 1-12.
// Dev mode reuses these ~62 emails, so repeat submits get "already submitted" (expected, counted separately).
const pad = (i) => String(i).padStart(2, '0');
const SEEDED = [['pune', 20], ['mumbai', 15], ['bda', 15], ['ai', 12]]
  .flatMap(([p, n]) => Array.from({ length: n }, (_, i) => `${p}.student${pad(i + 1)}@test.local`));
const CC_EMAIL = E.CC_EMAIL || 'cc@test.local';

const cookieFile = MODE === 'cookie' ? JSON.parse(fs.readFileSync(E.COOKIES_FILE || 'tests/load/cookies.json', 'utf8')) : null;
const REPORT_ID = E.REPORT_SESSION_ID || cookieFile?.reportSessionId;

const lat = {};
const stat = { total: 0, failed: 0, r429: 0, dupSubmit: 0, byStatus: {}, failures: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(THINK * (0.5 + Math.random()));

async function call(step, cookie, method, path, body) {
  const t0 = performance.now();
  let status = 0, json = null, setCookie = '';
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    status = res.status;
    setCookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
    const txt = await res.text();
    try { json = JSON.parse(txt); } catch { /* non-json */ }
  } catch (e) { json = { error: String(e.cause?.code || e.message) }; }
  (lat[step] ||= []).push(performance.now() - t0);
  stat.total++;
  stat.byStatus[status] = (stat.byStatus[status] || 0) + 1;
  if (status === 429) stat.r429++;
  return { status, body: json, setCookie };
}
const fail = (step, r) => { stat.failed++; const k = `${step}:${r.status}`; stat.failures[k] = (stat.failures[k] || 0) + 1; };
const ok = (step, r, allowed = []) => { if ((r.status < 200 || r.status >= 300) && !allowed.includes(r.status)) fail(step, r); };

async function student(i) {
  let cookie;
  if (MODE === 'cookie') cookie = cookieFile.students[i % cookieFile.students.length];
  else {
    const r = await call('login', null, 'POST', '/auth/dev-login', { email: SEEDED[i % SEEDED.length] });
    ok('login', r); if (!r.setCookie) return; cookie = r.setCookie;
  }
  let r = await call('whoami', cookie, 'GET', '/auth/whoami'); ok('whoami', r); await think();
  r = await call('list_sessions', cookie, 'GET', '/api/sessions'); ok('list_sessions', r);
  const list = Array.isArray(r.body) ? r.body : [];
  const now = Date.now();
  const open = (cookieFile?.sessionId && list.find((s) => s.id === cookieFile.sessionId))
    || list.find((s) => Date.parse(s.opens_at) <= now && Date.parse(s.closes_at) >= now);
  if (!open) { fail('no_open_session', { status: 0 }); return; }
  await think();
  r = await call('load_form', cookie, 'GET', `/api/sessions/${open.id}`); ok('load_form', r);
  const qs = r.body?.questions || [];
  const answers = Object.fromEntries(qs.map((q) => [q.id, q.kind === 'choice' ? q.options[0] : 'load test']));
  await think();
  r = await call('submit', cookie, 'POST', '/api/feedback/submit', { session_id: open.id, answers });
  if (r.status === 400 && MODE === 'dev' && /already submitted/i.test(r.body?.error || '')) stat.dupSubmit++;
  else ok('submit', r);
}

async function cc(i) {
  let cookie;
  if (MODE === 'cookie') cookie = cookieFile.cc[i % cookieFile.cc.length];
  else {
    const r = await call('login', null, 'POST', '/auth/dev-login', { email: CC_EMAIL });
    ok('login', r); if (!r.setCookie) return; cookie = r.setCookie;
  }
  let r = await call('cc_dashboard', cookie, 'GET', '/api/reports/dashboard'); ok('cc_dashboard', r); await think();
  if (REPORT_ID) {
    r = await call('cc_report', cookie, 'GET', `/api/reports/${REPORT_ID}`);
    ok('cc_report', r, [400]); // 400 = "not closed / fewer than 3 responses": app rule, not a server fault
  }
}

const pct = (a, p) => {
  if (!a?.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]);
};
const t0 = Date.now();
const jobs = [];
for (let i = 0; i < VUS; i++) {
  const isCC = i % 100 < CC_PCT;
  jobs.push(sleep((i / VUS) * RAMP_S * 1000)
    .then(() => (isCC ? cc(i) : student(i)))
    .catch((e) => { fail('vu_crash', { status: 0 }); console.error(e); }));
}
await Promise.all(jobs);

const all = Object.values(lat).flat();
const steps = Object.fromEntries(Object.entries(lat).map(([k, a]) => [k, { n: a.length, p50: pct(a, 50), p95: pct(a, 95), max: Math.round(Math.max(...a)) }]));
const summary = {
  base: BASE, mode: MODE, vus: VUS, rampS: RAMP_S, durationS: Math.round((Date.now() - t0) / 1000),
  requests: stat.total, failed: stat.failed, errorRatePct: +((stat.total ? stat.failed / stat.total : 1) * 100).toFixed(3),
  count429: stat.r429, expectedDupSubmits: stat.dupSubmit,
  p50: pct(all, 50), p95: pct(all, 95), p99: pct(all, 99), steps, byStatus: stat.byStatus, failures: stat.failures,
  thresholds: { p95Under1000ms: pct(all, 95) < P95_MS, zeroErrors: stat.failed === 0 },
};
summary.pass = summary.thresholds.p95Under1000ms && summary.thresholds.zeroErrors;
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(summary.pass ? 'PASS' : 'FAIL (429s count as failures; see count429)');
process.exit(summary.pass ? 0 : 1);
