# C-DAC Feedback Portal — VAPT & Government Norms Compliance Report

> **Target Platform:** C-DAC Module Feedback Portal  
> **Auditing Standards:** CERT-In Cyber Security Directions (Sec 70B IT Act 2000), DPDP Act 2023, OWASP Top 10 (2021), GIGW 3.0 (Guidelines for Indian Government Websites) / WCAG 2.1 AA  
> **Test Suite Execution Date:** October 2026  
> **Automated Test Execution Status:** Test counts below are verified by direct count against the repo as of 2026-10-20 (61 server-side cases across 8 files, 8 frontend cases; see §4). Pass/fail outcome was not re-run as part of this correction pass — re-run `npm run server:test && npm test` and record the result before citing a pass/fail status to an auditor; both suites run in CI on every push (`.github/workflows/ci.yml`).  
> **Deployment Clearance Status:** **NOT YET CLEARED.** A VAPT simulation on 2026-10-19/20 found one High finding still open (CMP-1: no data-principal access/correction/erasure endpoint beyond a newly added admin-managed grievance contact) and several Medium findings; see `docs/vapt/simulation/00-MASTER-REGISTER.md` for the current open-findings list and what has already been fixed this session. Target: full clearance once CMP-1's export/erasure endpoints ship and the Medium findings are triaged per that register's recommended order of work. The register itself judges the stack usable for a controlled pilot now, short of external CERT-In audit submission.

---

## 1. Executive Summary

A comprehensive, multi-layered security assessment and regulatory compliance audit has been conducted on the C-DAC Module Feedback Portal. The platform was evaluated across four rigorous testing dimensions:

1. **VAPT & Penetration Testing (OWASP Top 10 / CWE):** Insecure Direct Object References (IDOR), Broken Access Control, Privilege Escalation, SQL/NoSQL Injection, Cross-Site Scripting (XSS), Session Hijacking, and Resource Exhaustion.
2. **CERT-In Directives (Cyber Security Directions under Section 70B, IT Act 2000):** 180-day logging (database-enforced append-only trigger; log coverage is still incomplete and a NTP config doesn't yet ship — see §2.1), incident reporting readiness, and secure credentials management.
3. **DPDP Act 2023 (Digital Personal Data Protection Act):** Complete student de-identification, $k \ge 3$ k-anonymity privacy safeguards, purpose limitation, and Indian sovereign on-prem hosting.
4. **GIGW 3.0 & WCAG 2.1 Level AA Accessibility:** Accessible form semantics, formula injection defense in exports, and high-contrast palette compliance.

**Audit Verdict:** The core architectural controls — database row-level security policies, server payload limits, and crypto session validations — are in place and were independently re-verified in the 2026-10-19/20 simulation (every student-to-staff and cross-centre access vector tested failed closed). Several compliance and client-side gaps found in that simulation are not yet closed (see `docs/vapt/simulation/00-MASTER-REGISTER.md`); this report is a work-in-progress compliance record, not yet a clean bill ready for external VAPT submission. Target: remove this caveat once the register's High and Medium findings are resolved or formally risk-accepted.

---

## 2. Regulatory Compliance Matrix

### 2.1. CERT-In Directives (Section 70B of IT Act 2000)

| Requirement | Statutory Mandate | Portal Implementation | Test Evidence |
|---|---|---|---|
| **Mandatory 180-Day Log Retention** | CERT-In Direction 2(b) | Append-only `public.audit_logs` table (DB-enforced: `trg_audit_logs_no_change`/`trg_audit_logs_no_truncate` block UPDATE/DELETE/TRUNCATE for every role, including the table owner — `server/src/db/migrations/002_security.sql:88-104`) logs `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, session/schedule/faculty/table mutations, roster uploads, and report views. A controlled retention job (`server/src/db/retention-purge.ts`) ages out rows older than a configurable `--years` (default 2, well past the 180-day floor), disabling and re-enabling the trigger inside one transaction and leaving its own `RETENTION_PURGE` audit row — run manually by an operator, never from `migrate.ts`. Not yet covered: authz failures, rate-limit/CORS blocks, and bulk PII reads/exports are not audited (CMP-6, target), and the trigger does not stop a Postgres superuser from dropping it outright — it is append-only by DB enforcement, not cryptographically tamper-evident (no hash chain, no off-host copy). | `compliance-gov-norms.test.ts:117,155`: *Audit logging ... immutable audit records* / *append-only immutability* (counts verified by direct read of the trigger and script; pass/fail not re-run in this pass) |
| **NTP Synchronization** | CERT-In Direction 2(a) | `DEPLOYMENT-CHECKLIST.md` ("Before first deploy") has an unchecked "NTP synced" item; target servers are named in `docs/vapt/INCIDENT-RESPONSE.md` §4 (`samay1.nplindia.org`, `samay2.nplindia.org`, `time.nic.in`). No systemd-timesyncd/chrony config ships in this repo, and `DEPLOYMENT-CHECKLIST.md` has no numbered sections (no "§3.1"). Target: ship a chrony/timesyncd config pinned to those servers and check it at deploy. | Not verified — checklist item only |
| **Encrypted Backups** | CERT-In Incident Response Guidance | Containerized backup service runs daily `pg_dump` encrypted with AES-256-CBC plus an HMAC-SHA256 (encrypt-then-MAC: a tampered backup fails `restore-test.sh` closed before decryption; key via `BACKUP_ENCRYPTION_KEY` env var, never on argv — `deploy/backup/backup.sh`), pruning local copies after 180 days. By default the dump connects as the Postgres superuser; an optional least-privilege `BACKUP_DB_ROLE` is documented (`deploy/.env.example`, `DEPLOYMENT-CHECKLIST.md`) but not mandatory, and the offsite `rsync` copy needs its SSH key mounted manually (`BACKUP_OFFSITE_SSH_KEY`) — see `DEPLOYMENT-CHECKLIST.md`'s Accepted risk section. | Verified live: a real backup → HMAC verification → tamper → fail-closed → restore → pass cycle. |
| **Reduced External Dependency (target: zero; Google OAuth requires egress)** | Critical Sector ICT Directive | All JavaScript and CSS are bundled locally; zero external CDNs, fonts, or analytics trackers load at runtime (`src/index.css` names "Fira Sans" with no bundled font files, so the browser falls back to its own `system-ui` stack — there is no `@fontsource/inter` dependency in `package.json`). Google OAuth is a server-side egress exception, not covered by this row (CMP-5). | `compliance-gov-norms.test.ts:174`: *Air-Gap & Sovereign Data Residency* — note the test only inspects package dependencies, it does not probe runtime egress |

---

### 2.2. DPDP Act 2023 (Digital Personal Data Protection Act)

| Requirement | Statutory Mandate | Portal Implementation | Test Evidence |
|---|---|---|---|
| **Zero-Linkage Student Anonymity** | Section 4 & Section 7 (Data Minimization) | The `public.responses` table contains **zero** student identifier columns (no email, no PRN, no user ID, no IP address, no timestamp — confirmed: `id`, `session_id`, `answers` only, `server/src/db/migrations/001_init.sql:106-110`). At the application layer, linkage is impossible: no RLS policy or grant lets `feedback_app` read `responses` directly (`002_security.sql:219-220,240`), and `session_report()` only returns answers after close, $k\ge3$, random order. **Not true at the raw storage layer** (CMP-3): `submit_feedback()` inserts the `submissions` and `responses` rows in the same transaction, so they share `xmin`/heap order, and `submissions.submitted_at` sits next to them — a database superuser or a decrypted backup holder can still correlate who-submitted-what by position and time. Target: write `responses` in a separate, randomly-delayed transaction (or batch-insert shuffled per session at close) to close this residual gap. | `compliance-gov-norms.test.ts`: *DB Verification: responses table contains NO student email, ID, or IP columns* — tests column schema only, not storage-layer linkage |
| **k-Anonymity Protection ($k \ge 3$)** | Section 6 (Purpose Limitation & Privacy Safeguards) | `session_report()` and `dashboard_data()` strictly withhold individual responses and rating distributions if fewer than 3 students have submitted (`status: 'too_few'`). | `compliance-gov-norms.test.ts`: *DPDP k-Anonymity Guard: Reports withhold all responses when count < 3* (Passed) |
| **Anti-Ballot Stuffing** | Data Accuracy & Integrity | `public.submissions` records participation independently from answers to guarantee each student can only submit once. | `compliance-gov-norms.test.ts`: *Anti-Ballot Stuffing: Database strictly prevents duplicate submissions* (Passed) |
| **Sovereign Indian Data Hosting** | Section 16 (transfer outside India) | Feedback data (`responses`, `submissions`) resides strictly on the C-DAC campus PostgreSQL server. **Caveat:** identity data does not — Google OAuth (`server/src/auth/routes.ts:96-160`) sends student/staff email and name to Google's US infrastructure during sign-in, and this is not disclosed in the student notice (CMP-5). "100% in India" holds only for the feedback tables, not the login flow. | Docker & schema architecture for the feedback tables; `server/src/auth/routes.ts` for the OAuth egress |
| *Section labels above are this document's best-effort mapping, not independently verified against the DPDP Act 2023 text* | — | — | — |

---

### 2.3. GIGW 3.0 & WCAG 2.1 AA Accessibility Standards

| Requirement | Standard | Portal Implementation | Test Evidence |
|---|---|---|---|
| **CSV Formula Injection Defense** | CWE-1236 / OWASP ASVS 5.1 | All student comments and text fields exported to CSV are sanitized with leading single-quote escaping for formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`). | `gigw_compliance.test.ts`: *Escapes formula injection characters with single quote prefix* (Passed) |
| **High Contrast & Color-Blind Safety** | WCAG 2.1 SC 1.4.3 / GIGW 4.1 | Rating and UI palette verified for contrast ratios: text `#1c1917` (> 12:1 against white), muted `#78716c` (> 4.5:1 against white), categorical chart colors validated with $\Delta E \ge 8$. | `gigw_compliance.test.ts`: *Palette definitions exist and specify distinct high-contrast colors* (Passed) |
| **Accessible Form Navigation** | WCAG 2.1 SC 1.3.1 / GIGW 4.2 | Accessible `<fieldset>` and `<legend>` wrapping for rating questions, unique `id` and `htmlFor` bindings, and high-visibility keyboard focus rings. | Verified across `FeedbackForm.tsx`, `CohortPicker.tsx`, and browser subagent tests |

---

## 3. OWASP Top 10 (2021) VAPT Verification Matrix

| OWASP Vulnerability | Severity | Mitigation Implemented | Automated Test Status |
|---|---|---|---|
| **A01: Broken Access Control & IDOR** | Critical | PostgreSQL Row Level Security (`ENABLE ROW LEVEL SECURITY`) and multi-tier role guards (`requireAuth`, `requireStaff`, `requireAdmin`). Coordinators cannot access sessions or reports belonging to other centres. Students cannot access coordinator dashboard or administrative APIs. | **PASSED** (7 tests in `vapt-security.test.ts`) |
| **A02: Cryptographic Failures** | High | Cryptographically secure 256-bit random session tokens. HMAC SHA-256 signed session cookies. Tampered or modified cookie signatures rejected with HTTP 401. Immediate server-side session revocation on logout. | **PASSED** (5 tests in the "1. Authentication & Session Integrity" block of `vapt-security.test.ts`, shared with A07 below — the same tests cover both) |
| **A03: Injection (SQLi & Param Injection)** | Critical | 100% parameterised SQL (`$1, $2`). Zod schema validation on all route parameters and request bodies. Non-UUID route params safely rejected with HTTP 400. Stored XSS strings in comments safely preserved as plain text. | **PASSED** (3 tests in the "3. Injection & Input Sanitization" block of `vapt-security.test.ts` — corrected from an earlier count of 4, which also double-counted the 413 payload-limit test under A05) |
| **A04: Insecure Design** | High | Structural anonymity design. Responses detached from submitter records. Aggregated reporting gated behind $k \ge 3$ threshold. | **PASSED** (4 tests in `compliance-gov-norms.test.ts`) |
| **A05: Security Misconfiguration** | Medium | Strict Helmet CSP (`default-src 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS (no preload on nginx's own headers, see §5), and suppression of `X-Powered-By`. Fastify request body limit enforced at 50 KB (`bodyLimit: 51200`). | **PASSED** (1 header test in the "4. Security Headers & Network Defense" block of `vapt-security.test.ts`, plus the 413 payload-limit test counted under A03 above — corrected from an earlier, inflated count of 3) |
| **A07: Identification & Auth Failures** | High | `HttpOnly`, `SameSite=Lax`, and `Secure` cookie flags. Localhost CORS origin bypass strictly gated to non-production. Weak default secrets eliminated. | **PASSED** (same 5 tests as A02 above — this row and A02 were previously double-counted as 5+5=10 against a file that has only 16 tests total; `vapt-security.test.ts`) |

---

## 4. Test Suites Summary & Reproduction Commands

The test suite consists of **69 automated test cases** (counted directly against the repo on 2026-10-20) split into frontend and backend harnesses. The server suite has grown since the figure below was first written (28 -> 61 tests, 3 files -> 8 files) as the RLS/role rework added dedicated tests; this section was not re-run for pass/fail in this correction pass, only re-counted.

### 4.1. Server VAPT & Compliance Test Suite (61 Tests, 8 files)
Run from root:
```bash
npm run server:test
```
**Test Breakdown:**
- `src/tests/server.test.ts` (5 tests): Health probes, base security headers, authentication gate checks.
- `src/tests/vapt-security.test.ts` (16 tests): Unauthenticated access, cookie tampering, session revocation, vertical escalation, horizontal IDOR, cross-cohort isolation, UUID SQLi parameters, 50 KB body limit, and XSS storage.
- `src/tests/compliance-gov-norms.test.ts` (7 tests): DB response table column schema, DPDP k-anonymity gate, dashboard privacy threshold, anti-ballot stuffing, CERT-In audit log creation on login/logout, audit log table immutability, and air-gap verification (package-dependency check only, see §2.1).
- `src/tests/rls-app-role.test.ts` (11 tests): `feedback_app` role grants and RLS policy enforcement, including the `audit_logs` append-only trigger.
- `src/tests/roster-api.test.ts` (6 tests), `src/tests/reference-api.test.ts` (8 tests), `src/tests/sessions-lifecycle.test.ts` (4 tests), `src/tests/production-config.test.ts` (4 tests): route-level and config-boundary coverage added during the RLS/role rework.

There is no pgTAP suite and no `schema.sql` in this repo — the migrations are `server/src/db/migrations/001-004_*.sql`, and the tests above are vitest, not pgTAP. (An older Supabase-based version of this project used pgTAP under `supabase/tests`; that directory does not exist on this branch.)

### 4.2. Frontend & GIGW Compliance Test Suite (8 Tests)
Run from root:
```bash
npm test
```
**Test Breakdown:**
- `src/reports/aggregate.test.ts` (3 tests): Question counting, noise filtering, CSV formatting.
- `src/lib/format.test.ts` (1 test): Timestamp formatting.
- `src/reports/gigw_compliance.test.ts` (4 tests): CSV formula injection escaping (`=`, `+`, `-`, `@`), metadata stripping in aggregates, and WCAG 2.1 AA palette contrast.

---

## 5. Auditor Verification Runbook (For CERT-In Auditor)

The external auditor can execute the following verification commands against the live portal:

### 1. Verify HTTP Security Headers & Clickjacking Defense
```bash
curl -I https://<portal-domain>/
```
*Expected response headers (nginx, `deploy/nginx/nginx.conf`, the `location /` block):*
```http
HTTP/1.1 200 OK
content-security-policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
strict-transport-security: max-age=63072000; includeSubDomains
x-content-type-options: nosniff
x-frame-options: DENY
```
**Correction:** `curl -I /healthz` does **not** return CSP or `X-Frame-Options` — that location intentionally returns only HSTS and `nosniff` for a lightweight container healthcheck (same for `/assets/*`, CL-8, Low/tracked separately, not fixed in this pass). None of nginx's headers carry `preload`; only Fastify's own Helmet config sets `preload: true` (`server/src/index.ts:99`), which is only visible on `/api/*`/`/auth/*` responses, behind nginx's proxy.

### 2. Verify Large Payload Rejection (DDoS Guard)
```bash
python -c "print('A'*60000)" | curl -X POST -H "Content-Type: application/json" -d @- https://<portal-domain>/api/feedback/submit
```
*Expected response:* `HTTP/1.1 413 Payload Too Large`

### 3. Verify PostgreSQL Row Level Security (RLS)
```sql
SELECT relname, relrowsecurity, relforcerowsecurity 
  FROM pg_class 
 WHERE relname IN ('feedback_sessions', 'submissions', 'responses', 'student_roster');
```
*Expected result:* `relrowsecurity = true` for all 4 sensitive tables.

### 4. Verify Student De-Identification Schema (DPDP Act)
```sql
SELECT column_name, data_type 
  FROM information_schema.columns 
 WHERE table_schema = 'public' AND table_name = 'responses';
```
*Expected result:* Exactly 3 columns (`id`, `session_id`, `answers`). No student email, IP, or timestamp exists.

### 5. Verify CERT-In Audit Logs
```sql
SELECT action, count(*), min(logged_at), max(logged_at) 
  FROM public.audit_logs 
 GROUP BY action;
```
*Expected result:* Audit trails for `LOGIN` and `LOGOUT` events recorded with UTC timestamps.
