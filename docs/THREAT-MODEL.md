# C-DAC Feedback Portal: STRIDE Threat Model & Data Classification

**System**: C-DAC Student Feedback Portal (On-Campus DMZ Deployment)  
**Target Compliance**: CERT-In Audit Guidelines (Jul 2025), DPDP Act 2023 / Rules 2025, OWASP ASVS v4.0.3 Level 2  
**Date**: October 2026

---

## 1. Data Classification

| Asset | Classification | Storage | Retention | Anonymity Guarantee |
|---|---|---|---|---|
| **Student Responses** (`responses`) | **Confidential / Anonymized** | PostgreSQL `responses` table | 3 years (academic audit) | **Strictly anonymous**: No student ID, no email, no timestamp. Random order on export. Minimum $k=3$ responses required for aggregation. |
| **Submission Logs** (`submissions`) | **Internal** | PostgreSQL `submissions` table | Duration of batch + 90 days | Tracks *who* submitted (student email + session ID) to prevent duplicate submissions. Never joined with `responses`. |
| **Student Roster** (`student_roster`) | **PII (DPDP Protected)** | PostgreSQL `student_roster` table | Active batch lifecycle | PRN, Full Name, Email. Access restricted to Admin and cohort Course Coordinator (CC). **Age assurance (CMP-9):** the platform assumes an adult (18+) PG-diploma student cohort. There is no date-of-birth field and no technical control preventing a minor's email from being rostered. This assumption is not DPIA-recorded elsewhere in the repo and should be explicitly confirmed by CDAC before go-live; if it does not hold, DPDP s.9 (verifiable parental consent) would apply and is not implemented. |
| **Staff Roster** (`staff_roster`) | **Internal** | PostgreSQL `staff_roster` table | Active employment/duty | Full Name, Email, Role, Centre/Course scope. |
| **Session & Audit Logs** | **Compliance Audit** | Container stdout (json-file, rotated 10 MB x 5 per service — short-lived, not a 180-day store) + `public.audit_logs` table in Postgres. **No Loki, ELK, or pgAudit ships in this repo** (Target: a log forwarder to a campus store that actually holds 180 days; tracked as CMP-7). | **180 days (CERT-In mandate); not yet met for container logs (CMP-7). `audit_logs` itself is retained well past that floor — a controlled script (`server/src/db/retention-purge.ts`) only ages rows out after 2 years by default.** | System events, login attempts, roster edits, schedule locks. User IP, timestamp, action. Feedback text excluded. |

**Note on the retention column vs. the implemented purge:** `server/src/db/retention-purge.ts` is the only code that actually enforces any of the periods above, and it uses a single `--years` cutoff (default 2) applied to `submissions`, `responses`, and `audit_logs` together, keyed off each session's `closes_at`. That does not exactly match "3 years" for responses or "batch + 90 days" for submissions declared in the rows above — an operator must pass the right `--years` value (or the script needs splitting per table) to make the enforced period match what this table promises. Until then, treat the "3 years" / "batch + 90 days" figures as policy intent (Target), not a guaranteed enforced period.

---

## 2. STRIDE Threat Analysis & Mitigations

### 2.1 Spoofing (Identity)
- **Threat**: Attacker attempts to forge student identity, impersonate a Course Coordinator, or submit feedback on behalf of another student.
- **Mitigations**:
  - Server-side OAuth2 authorization-code flow with **state and PKCE (S256), now implemented** — `server/src/auth/routes.ts:96-160` (state compared with `crypto.timingSafeEqual`, `code_challenge_method: 'S256'`). This was previously listed as a target; it is done.
  - Signed, `HttpOnly`, `Secure`, `SameSite=Lax` session cookies with cryptographic session IDs stored in PostgreSQL.
  - Roster check on the OAuth callback: a non-rostered email is **not** rejected with 403 — it redirects back to the login page with a message ("Your email is not on the feedback roster...", `server/src/auth/routes.ts:182`) before any session is created. (403 is only used on the dev-only `/auth/dev-login` path, which doesn't exist in a production build.)
  - Active session validation on every protected route, including a live per-request roster re-check (`getSession`, `server/src/auth/session.ts:45-59`).

### 2.2 Tampering (Data Integrity)
- **Threat**: Attacker modifies closed session results, manipulates feedback scores, or alters student roster.
- **Mitigations**:
  - Parameterized SQL queries via native `pg` driver; zero dynamic query concatenation.
  - Zod schema validation on every API request boundary.
  - Database trigger `trg_lock_closed_schedule` prevents modifying session schedule or faculty once closed.
  - Append-only audit logging (`audit_logs`) for all administrative edits (coverage gaps: CMP-6 — authz failures and bulk reads aren't logged yet).
  - PostgreSQL Row-Level Security (RLS) as a defense-in-depth second layer.

### 2.3 Repudiation
- **Threat**: User claims they did not submit feedback, or admin denies altering session parameters.
- **Mitigations**:
  - `submissions` table records completion receipt (`email`, `session_id`, `submitted_at`).
  - **Correction:** there is no pgAudit extension in this repo (confirmed: only `citext` and `pgcrypto` are created, `server/src/db/migrations/001_init.sql:6-7`). DDL/DML traceability instead relies on the application's own `audit_logs` table (`lib/audit.ts`), which does not cover raw SQL run outside the app.
  - NTP synchronization with Indian standard time servers (NIC / NPL) as required by CERT-In directions — **Target**: server names are documented (`docs/vapt/INCIDENT-RESPONSE.md` §4) but no timesyncd/chrony config ships in this repo yet.

### 2.4 Information Disclosure (Confidentiality)
- **Threat**: Dean, coordinator, or student discovers who wrote a specific negative comment or low rating.
- **Mitigations**:
  - Anonymity architectural barrier: `responses` table completely lacks student identifiers and submitted timestamps, and the app role has no grant to read it directly. **Residual risk** (CMP-3): `responses` and `submissions` rows from the same submission share `xmin`/heap order, and `submissions.submitted_at` sits next to them — not linkage-proof against a DB superuser or a decrypted backup. Target: write `responses` in a separate, randomly-delayed transaction.
  - `session_report()` stored procedure enforces minimum $k=3$ responses before returning any data.
  - Random ordering (`ORDER BY random()`) applied on free-text comment queries.
  - TLS 1.2 and 1.3 with HSTS. **Correction:** nginx itself sends `max-age=63072000; includeSubDomains` with no `preload` on every location (`deploy/nginx/nginx.conf`); only Fastify's Helmet config sets `preload: true` (`server/src/index.ts:99`), visible on proxied `/api/*`/`/auth/*` responses.
  - Content Security Policy (CSP) blocking external script execution; no font files are bundled at all (no CDN fonts to block — `src/index.css` falls back to the OS `system-ui` stack).

### 2.5 Denial of Service (Availability)
- **Threat**: Mass automated submission flood during peak submission windows (700+ simultaneous students).
- **Mitigations**:
  - Reverse Proxy (Nginx) rate limiting keyed on client IP (`deploy/nginx/nginx.conf`): `1500 r/min` on `/api/*` (burst 100), `1200 r/min` on `/auth/*` (burst 300) — a coarse, NAT-safe backstop; this was previously keyed on the raw session cookie (spoofable, fixed this session, INF-1).
  - Fastify `@fastify/rate-limit` (`server/src/index.ts:114-123`): `240 req/min` per verified session, falling back to `1500 req/min` for unauthenticated/IP-keyed requests — not "10 submits/min per user" as earlier drafts of this document said.
  - Max request payload limits (50 KB for feedback submissions).
  - A single stateless Fastify API container (`deploy/docker-compose.yml`) — **not** "2x load balanced"; there is one `api` service and nginx's upstream has one backend entry. Target if horizontal scaling is needed.

### 2.6 Elevation of Privilege (Access Control)
- **Threat**: Student attempts to query Coordinator dashboard or call staff RPCs (`session_report`, roster uploads).
- **Mitigations**:
  - Route-level role-based guard middleware checking session role (`student`, `cc`, `admin`).
  - Centre and course scope isolation: CCs can only access batches and sessions for their assigned centre.
  - **Correction:** there is no pgTAP suite in this repo (left over from a retired Supabase-based version). RLS/role security is covered by 11 vitest tests in `server/src/tests/rls-app-role.test.ts`, part of a 71-test server suite (9 files) that runs on every push in CI (`.github/workflows/ci.yml`).
