# Test and Load Plan

Scope: staging verification before production cutover. Never run anything in `tests/load/` against production.

## 0. Known risk to settle first: per-IP rate limits

nginx `api_limit` is 120 r/min per IP (burst 100) and Fastify `@fastify/rate-limit` is 120/min (per IP, keyed on the
proxied `$remote_addr`). If students sit behind one campus NAT, 700 students (about 4 API calls each, plus the SPA's own
calls) share ONE bucket and will see 429s. Decide before UAT: raise limits for the campus CIDR (nginx `geo`/`map` + a
higher zone, Fastify `allowList`), or confirm students have distinct IPs. The load test reports the 429 count; from a
single load-generator IP it WILL hit the limit, so for staging either raise limits there or run generators from several IPs.

## 1. Load test (staging, through nginx)

Files: `tests/load/loadtest.mjs` (Node 18+, no deps), `tests/load/mint-sessions.mjs`, `tests/load/load.k6.js` (optional).

Flow per student VU: whoami, list my sessions, load form, submit. About 2% of VUs run the CC flow: dashboard, session report.
VUs start staggered over `RAMP_S` (default 120 s) up to `VUS` (default 1500).

### Mode dev (staging with `NODE_ENV != production`, seeded data)
`/auth/dev-login` only exists outside production. Uses the seeded emails `pune.studentNN`, `mumbai.studentNN`,
`bda.studentNN`, `ai.studentNN` @test.local (62 distinct accounts), so with 1500 VUs most submits return "already
submitted" (400). Those are counted as `expectedDupSubmits`, not errors. Good for read-path load, weak for write-path load.
```
BASE_URL=https://staging.example MODE=dev REPORT_SESSION_ID=<closed session uuid> node tests/load/loadtest.mjs
```

### Mode cookie (realistic: 1500 unique students)
1. Staging DB only. Pick an OPEN feedback session id (`TARGET_SESSION_ID`).
2. Mint (inserts `loadNNNN@loadtest.local` students into that cohort and 6 h sessions; refuses without `CONFIRM_STAGING=yes`):
```
CONFIRM_STAGING=yes DATABASE_URL=<staging> COOKIE_SECRET=<staging secret> TARGET_SESSION_ID=<uuid> \
REPORT_SESSION_ID=<closed uuid with >=3 responses> N=1500 node tests/load/mint-sessions.mjs
```
3. Run: `BASE_URL=https://staging.example MODE=cookie node tests/load/loadtest.mjs` (or the k6 script).
4. Cleanup (staging DB), then delete `tests/load/cookies.json`:
```sql
DELETE FROM user_sessions WHERE email LIKE 'load%@loadtest.local';
DELETE FROM submissions WHERE email LIKE 'load%@loadtest.local';
DELETE FROM student_roster WHERE email LIKE 'load%@loadtest.local';
-- responses are anonymous (no email): remove by resetting the staging DB, or delete responses of TARGET_SESSION_ID.
```
`audit_logs` is append-only; leave it. Prefer a throwaway staging DB you can reset.

Output: console JSON plus `tests/load/summary.json` (p50/p95/p99, per-step latency, status histogram, `count429`, failures).
Exit code 0 only if p95 < 1000 ms and zero failed requests. 429s count as failed requests AND are reported separately.
Watch during the run: `docker stats`, Postgres `pg_stat_activity` (API pool max is 20), nginx error log.

## 2. RLS / IDOR checklist (manual, curl or browser devtools, two student cookies A and B)

- [ ] Unauthenticated: `/api/sessions`, `/api/reports/dashboard`, `/api/feedback/submit` all 401.
- [ ] Student A cannot read other-cohort session: `GET /api/sessions/<other cohort id>` returns 404/403, not data.
- [ ] Student A list shows only own cohort sessions.
- [ ] Student cannot submit to other-cohort session ("not enrolled"), nor outside the open window.
- [ ] Double submit rejected (400 already submitted).
- [ ] Student gets 403 on `/api/reports/*`, `/api/feedback/submissions/:id`, `/api/roster`, `POST /api/sessions`, `POST /api/reference/faculty`.
- [ ] Student cannot reach `/api/reference/tables/responses` or `submissions` (no direct table read of `responses` by anyone).
- [ ] CC of centre X: cannot open report/sessions of centre Y or other course (`can_manage`); cannot create session for another centre.
- [ ] Report before close or with fewer than 3 responses is refused; answers come in random order; no timestamps or emails in `responses`.
- [ ] CC sees who submitted, not when.
- [ ] Closed session schedule cannot be edited; session with submissions cannot be deleted.
- [ ] Malformed ids (`/api/sessions/abc`, SQL chars) return 400, not 500.
- [ ] Tampered cookie (altered signature) returns 401; expired/destroyed session returns 401; after `/auth/logout` the old cookie fails.
- [ ] `/auth/dev-login` returns 404 in production.
- [ ] Cookie flags in prod: `HttpOnly; Secure; SameSite=Lax`.
- [ ] Direct DB role used by API cannot bypass RLS (not superuser, no BYPASSRLS); Postgres port not published externally.

## 3. Backup restore drill

1. Take or locate the latest encrypted backup (`/var/backups/cdac-feedback/`, produced by `deploy/backup/backup.sh`).
2. Run `bash deploy/backup/restore-test.sh` on a scratch host/container (never the live DB).
3. Verify: row counts for `student_roster`, `staff_roster`, `feedback_sessions`, `submissions`, `responses` match the source within the backup window; `submissions` count equals `responses` count per session.
4. Boot the API against the restored DB, run `/api/health`, log in as a seeded CC, open a report.
5. Record: backup age (RPO), time from start to healthy (RTO), operator, result. Target: RPO <= 24 h, RTO <= 1 h (adjust to policy).
6. Repeat on cutover day +7 (see cutover runbook).

## 4. UAT script (1 CC + 5-10 student sample, real accounts on staging)

CC:
1. Sign in, land on dashboard scoped to own centre/course.
2. Add a faculty member inline; create a session for a module (window opens in 5 min, closes in 30 min).
3. Confirm sessions of other centres are not visible.
4. After students submit, see the submitted-by list (names, no times). Try the report while open: refused.
5. After close (or after editing the window on staging), open the report: at least 3 responses, answers in random order, charts render; download the PDF.
6. Try to delete a session with submissions: refused.

Students (sample of 5-10, include one from another cohort):
1. Sign in with the institute account; see only own cohort sessions.
2. Open the form on a phone and a laptop; answer all questions; submit; see confirmation.
3. Reopen: shows already submitted; resubmit is refused.
4. Other-cohort student sees no session.
5. Sign out; back button does not reveal data.

Sign-off: CC and student reps record pass/fail per step with screenshots for failures.

## 5. Go / No-go criteria

GO requires ALL:
- Load test (1500 VUs, cookie mode): p95 < 1000 ms, 0 failed requests, 0 unexplained 429s (rate-limit plan from section 0 decided and verified).
- No 5xx in nginx/API logs during the run; Postgres connections stayed below limit; CPU < 80%, no OOM.
- RLS/IDOR checklist 100% pass; `npm run test:db`-equivalent security tests and server tests green.
- Restore drill passed with recorded RPO/RTO.
- UAT signed off by CC and student reps; no open Sev1/Sev2.
- Anonymity spot check: no email/timestamp column in `responses`.
- TLS valid, secrets set (COOKIE_SECRET >= 32 chars), dev-login absent in prod build.

NO-GO on any failure above; a rate-limit decision pending is a NO-GO.

## 6. Results template

| Run | Date | Mode | VUs | Ramp (s) | Requests | Failed | Error % | 429s | p50 ms | p95 ms | p99 ms | Pass | Notes |
|-----|------|------|-----|----------|----------|--------|---------|------|--------|--------|--------|------|-------|
| 1 | | | | | | | | | | | | | |
| 2 | | | | | | | | | | | | | |

Per-step p95 (ms): login / whoami / list_sessions / load_form / submit / cc_dashboard / cc_report

| Run | login | whoami | list | form | submit | dashboard | report |
|-----|-------|--------|------|------|--------|-----------|--------|
| 1 | | | | | | | |

| Gate | Result | Evidence link | Owner | Date |
|------|--------|---------------|-------|------|
| Load test | | | | |
| RLS/IDOR | | | | |
| Restore drill (RPO/RTO) | | | | |
| UAT | | | | |
| Decision (GO / NO-GO) | | | | |
