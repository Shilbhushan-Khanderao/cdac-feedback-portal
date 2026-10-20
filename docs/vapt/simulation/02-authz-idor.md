# VAPT Simulation — 02: Authorization, IDOR, RLS Enforcement

Scope: `https://localhost:8443` (local disposable staging stack, self-signed TLS). White-box source review of
`server/src/**` + `server/src/db/migrations/**`, plus live HTTP testing with the prepared role cookies and
direct `psql` testing as the unprivileged `feedback_app` DB role.

Identities used:

| Role | Email | Centre | Course |
|---|---|---|---|
| student | load0001@loadtest.local | `dbaaef4f` (ATC) | `a8f82dde` (PGCP-AC) |
| cc (own-centre) | cc@test.local | `915feedf` (Mumbai) | `a8f82dde` (PGCP-AC) |
| cc (other-centre) | cc.atc@test.local | `dbaaef4f` (ATC) | `null` (all courses at centre) |
| admin | admin@test.local | — | — |

## Result summary

**No exploitable authorization bypass, IDOR, or RLS gap was found.** Every cross-role / cross-tenant
request tested was rejected at the correct layer (route guard, explicit `assertCanWrite`/`can_manage` check,
or the underlying RLS policy / `SECURITY DEFINER` function). One low-severity defense-in-depth observation
is recorded as AZ-1 (not independently exploitable).

## Route × Role matrix

Legend: **PASS** = correctly enforced (expected behaviour observed); route prefix per `server/src/index.ts`.

| Method & Path | No cookie | Student | CC own-centre | CC other-centre | Admin |
|---|---|---|---|---|---|
| `GET /auth/whoami` | 200 `{user:null}` PASS | 200 own identity PASS | 200 own identity PASS | 200 own identity PASS | 200 own identity PASS |
| `POST /auth/dev-login` | 404 (disabled, `NODE_ENV=production`) PASS | — | — | — | — |
| `GET /api/sessions` | 401 PASS | 200, own cohort only PASS | 200, own centre/course only PASS | 200, own centre/course only PASS | 200, all |
| `GET /api/sessions/:id` (other tenant's id) | 401 PASS | 404 (cross-cohort id) PASS | n/a | 404 (cross-centre id) PASS | 200 |
| `POST /api/sessions` | 401 PASS | 403 Forbidden: Staff access required PASS | 400/403 on module↔course mismatch or wrong cohort PASS | same PASS | 201 |
| `PATCH /api/sessions/:id/faculty` (other tenant) | 401 PASS | 403 PASS | n/a | 404 Session not found PASS | 200 |
| `PATCH /api/sessions/:id/schedule` (other tenant) | 401 PASS | 403 PASS | n/a | 404 PASS | 200 |
| `PATCH /api/sessions/:id/schedule` (own, already closed) | — | — | 400 "session has closed" PASS (trigger) | — | same trigger applies |
| `DELETE /api/sessions/:id` (other tenant) | 401 PASS | 403 PASS | n/a | 404 PASS | 200 |
| `DELETE /api/sessions/:id` (own, has submissions) | — | — | 409 Conflict PASS | — | same guard applies |
| `GET /api/feedback/my-submissions` | 401 PASS | 200 own rows only | 200 own rows (also staff) | — | — |
| `GET /api/feedback/submissions/:sessionId` (other tenant) | 401 PASS | 403 PASS | n/a | 404 PASS | 200 |
| `POST /api/feedback/submit` (session outside own cohort) | 401 PASS | Rejected by `submit_feedback()` (`in_my_cohort` check, code-verified — see note) | n/a | n/a | n/a |
| `GET /api/reports/dashboard` | 401 PASS | 403 PASS | 200, own centre/course rows only PASS | 200, own centre/course rows only PASS | 200 |
| `GET /api/reports/:id` (other tenant, closed) | 401 PASS | 403 PASS | n/a | 400 "not found, or not in your centre" PASS | 200 (report / too_few / open per status) |
| `GET /api/reference/tables/:table` (CC/admin only) | 401 PASS | 403 PASS | 200 scoped by `LIST_SCOPE`/RLS | 200 scoped | 200 |
| `GET …/tables/{STAFF_ROSTER\|public.staff_roster\|staff_roster;drop}` | — | — | 404 Table not found (case/alias/injection tricks fail) PASS | — | — |
| `GET …/tables/{responses,submissions,audit_logs,user_sessions}` | — | — | 404 Table not found (not in allowlist) PASS | — | — |
| `PUT …/tables/staff_roster/cc@test.local {role:"admin"}` | — | — | 403 "Admin access required" PASS | — | — |
| `PUT …/tables/staff_roster/cc@test.local {centre_id:...}` | — | — | 403 PASS (same guard) | — | — |
| `POST …/tables/staff_roster` (CC creates new admin row) | — | — | 403 PASS | — | — |
| `POST …/tables/courses` (admin-only table) | — | — | 403 (not `STAFF_WRITABLE`, RLS backstop too) PASS | — | — |
| `PUT …/tables/modules/:id` (module in CC's own course) | — | — | 200 PASS | — | — |
| `PUT …/tables/modules/:id` (module in a different course) | — | — | 403 "only edit... your assigned course" PASS | — | — |
| `PUT …/tables/faculty/:id` (other centre's faculty row) | — | — | 403 "only edit... your own centre" PASS | 403 (symmetric) | 200 |
| `DELETE …/tables/faculty/:id` (other centre's faculty row) | — | — | 403 PASS | — | — |
| `POST /api/reference/faculty {centre_id: other}` | — | — | 403 Access denied (RLS `faculty_ins`) PASS | — | 201 (admin may set any centre) |
| `GET /api/roster?centre_id=<other centre>` | — | 403 (staff-only route) | 200, empty array (RLS hides foreign rows) PASS | 200, empty for Mumbai centre PASS | 200, real rows |
| `GET …/tables/student_roster?order=1;DROP TABLE x&limit=99999` | — | — | 200, malicious `order` ignored, falls back to default order; no injection, rows scoped to own cohort PASS | — | — |
| `POST /api/roster/upsert` (re-home another centre's student into own centre) | — | — | n/a (own centre) | 403 "cannot add students to this centre or course" PASS | 200 |
| Create session: module belongs to a different course than claimed | — | — | 400 "Module does not belong to the selected course" PASS | — | — |

Note on `POST /api/feedback/submit` cross-cohort: the live student session token was invalidated mid-run by
a `user_sessions` reset from a concurrent test process sharing this stack (see "Environment note" below),
so the live call returned `401 Session expired`. The control was instead confirmed by code+schema review:
`public.submit_feedback()` (`server/src/db/migrations/001_init.sql:198-241`) calls
`in_my_cohort(v_session.batch_id, v_session.centre_id, v_session.course_id)` and raises
`'You are not enrolled in this batch'` before any insert; it is the only path that writes
`submissions`/`responses` (no app-level INSERT policy exists on either table — see AZ-1 note on `responses`).

## DB-level checks (connected directly as `feedback_app`, no `app.current_user_email` GUC set)

```
$ psql -U feedback_app -d cdac_feedback
SELECT * FROM responses LIMIT 3;     -- ERROR: permission denied for table responses
SELECT * FROM submissions LIMIT 3;   -- ERROR: permission denied for table submissions (only session_id,email granted)
SELECT session_id, email FROM submissions LIMIT 3;  -- 0 rows: RLS requires my_email()/can_manage(), both NULL outside the app's transaction GUC
UPDATE audit_logs SET action='TAMPERED' WHERE id=1;  -- ERROR: permission denied for table audit_logs (no UPDATE grant)
DELETE FROM audit_logs WHERE id=1;                   -- ERROR: permission denied for table audit_logs (no DELETE grant)
INSERT INTO responses (session_id, answers) VALUES (...);  -- ERROR: permission denied for table responses (no grant, no policy)
INSERT INTO submissions (session_id, email, submitted_at) VALUES (...);  -- ERROR: permission denied (no submissions_insert policy; GRANT is SELECT-only)
```

All PASS: `feedback_app` cannot read `responses` under any circumstance (no GRANT, no policy — table is
unreachable even if the app layer were fully compromised by SQLi), cannot read `submitted_at` on
`submissions` (column-level GRANT omits it, preserving "who, not when"), and cannot write or tamper with
`audit_logs` (append-only, enforced by both GRANT and the `audit_logs_immutable()` trigger).

## Controls verified

- Route guards: `requireAuth` / `requireStaff` / `requireAdmin` (`server/src/auth/guard.ts`) correctly gate
  every route; no route under `/api/*` is reachable without a valid signed, non-expired `cdac_session` cookie
  whose token hashes to a live `user_sessions` row with a still-valid roster role.
  Session validity is re-checked against the roster on every request (`getSession()`,
  `server/src/auth/session.ts:45-60`), so a revoked staff/student is logged out immediately, not just at login.
- Tenant scoping is enforced in triplicate for every centre/course-bound table: (1) explicit
  `assertCanWrite()` checks in `server/src/routes/tables.ts:115-171`, (2) explicit `can_manage()` /
  `is_my_centre()` checks inline in `sessions.ts`/`feedback.ts`/`reports.ts`/`roster.ts`, and (3) Postgres RLS
  policies (`FORCE ROW LEVEL SECURITY`, `server/src/db/migrations/002_security.sql:113-221`) as the backstop
  if any app-layer check were ever missed.
- Generic table endpoint (`server/src/routes/tables.ts`) uses a hardcoded `TABLE_CONFIGS` allowlist for both
  table names and column names (`readableColumns`/`writableColumns`); table name is matched by exact string
  key lookup (no templating of the identifier bypasses this — `routes/tables.ts:177-181`, `:218-220`), so
  case variants, `public.`-qualification, and `;`-injection in the path param all miss the lookup and 404
  before reaching SQL. `responses`, `submissions`, `audit_logs`, `user_sessions` are absent from
  `TABLE_CONFIGS` and thus unreachable through this endpoint entirely.
- Mass-assignment / privilege-escalation via the generic table endpoint is blocked twice: `staff_roster` is
  excluded from `STAFF_WRITABLE` (`tables.ts:66`), so any non-admin write to it — self-promotion to admin,
  self-reassignment of `centre_id`/`course_id`, or creating a new staff row — is rejected before a query is
  even built; the RLS `staff_roster_upd`/`staff_roster_ins` policies (`is_admin()` only) back this up.
  `guard_last_admin()` trigger additionally blocks demoting/deleting the last remaining admin.
- `order`/`limit`/`offset` query parameters on the list endpoint are bounded (`limit` clamped 1–500,
  `offset` floor 0) and `order` is validated against `readableColumns` before being interpolated, with a safe
  default fallback — no SQL injection or unbounded scan surface.
- Anonymity boundary: `responses` has no SELECT/INSERT grant and no RLS policy for `feedback_app` at all;
  the only path to response content is `session_report()` (`SECURITY DEFINER`), which itself requires
  `can_manage()`, a closed session, and `n >= 3`, and returns answers in `random()` order
  (`001_init.sql:243-264`). `submissions.submitted_at` is never granted to the app role, so staff genuinely
  cannot correlate "who submitted" with "when."
- A closed session's schedule is immutable for every role including staff (`lock_closed_schedule()` trigger,
  `002_security.sql:41-51`; no role exemption), and a session with submissions can never be deleted
  (`block_delete_with_submissions()` trigger, `002_security.sql:54-67`, redundantly checked in
  `routes/sessions.ts:224-225` for a clean 409 instead of a raw trigger exception).
- Module/course and faculty/centre consistency is checked both on create (payload cross-validated against
  `modules`/`faculty` before insert) and on update (existing row's course/centre re-verified, and the
  destination value in the request body re-verified against the same scope) — a CC cannot reassign a module
  to a foreign course or a faculty row to a foreign centre by supplying a different value in the PUT body.
- CSRF/CORS: state-changing methods require `Origin` to match `CORS_ORIGIN` (or be absent) — see
  `server/src/index.ts:95-104` — independent of the authz checks above.

## Findings

### AZ-1 — `staff_roster.role`/`centre_id`/`course_id` listed as "writable" in `TABLE_CONFIGS` despite being blocked for every non-admin caller (defense-in-depth gap, not exploitable)

- **Severity:** Informational / Low (hardening suggestion only — no bypass was achieved).
- **Root cause:** `server/src/routes/tables.ts:46-51` declares `staff_roster.writableColumns` to include
  `role`, `centre_id`, `course_id`, relying entirely on `STAFF_WRITABLE` (`tables.ts:66`, which omits
  `staff_roster`) and the RLS `is_admin()`-only policies to stop a CC from using them. This is currently safe
  — confirmed live (`PUT …/tables/staff_roster/cc@test.local` → `403 Admin access required` for `role`,
  `centre_id`, and a bare `POST` with a new row) — but it means the column allowlist alone does not express
  "no CC can ever touch this"; a future refactor of `assertCanWrite()` or `STAFF_WRITABLE` that accidentally
  added `staff_roster` would silently reopen self-promotion to admin, because `cleanBody()` would then pass
  `role`/`centre_id`/`course_id` straight through.
- **Fix (optional hardening):** Either split `staff_roster` into an admin-only route (never exposed under
  `/api/reference/tables/staff_roster` to non-admins) or keep it in `TABLE_CONFIGS` but drop `role`,
  `centre_id`, `course_id` from `writableColumns` so no code path can pass them to `cleanBody()`, independent
  of `STAFF_WRITABLE`'s current contents. Either change makes the control resilient to a future one-line
  regression rather than reviewer vigilance.

No other findings. Every tested vector (vertical escalation student→staff→admin, horizontal escalation
CC-own-centre→CC-other-centre, IDOR by object id, generic-table allowlist bypass, mass assignment,
ordering/limit parameter abuse, DB-role privilege boundary) returned the expected deny.

## Environment note

The staging stack's `db`, `api`, and `nginx` containers were observed restarting repeatedly during this
session (confirmed via `docker compose logs`, visible 502/`000` responses, and a `user_sessions` wipe that
invalidated the prepared student cookies mid-test), consistent with a concurrent VAPT exercise
(`docs/vapt/simulation/01-authn-session.md`) and the DB-level anonymity probe (`xmin`-based response/submission
correlation query visible in `db` logs) running against the same shared stack at the same time. All findings
above were either reproduced after the stack stabilized or corroborated independently by source/schema review
where a live call could not be completed cleanly; this is noted for transparency, not as a finding (no other
host or IP was touched, and no container was stopped or had its DB dropped by this session).
