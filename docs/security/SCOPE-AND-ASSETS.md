# C-DAC Feedback Portal: VAPT Scope & Target Assets

**Target System**: C-DAC On-Campus Module Feedback Portal  
**Target Environment**: C-DAC Campus DMZ (Staging / Pre-Production)  
**Classification**: Government Web Application (Confidential / Internal)  
**Standard**: CERT-In Guidelines & OWASP ASVS Level 2  

---

## 1. Scope of Assessment

### In-Scope Web Applications & Endpoints
| Component | Base URL | Technology Stack | Purpose |
|---|---|---|---|
| **Web Frontend** | `https://feedback-staging.cdac.in` | React 19 + Vite (Static SPA, served via Nginx) | Student & Staff Web Interface |
| **Backend REST API** | `https://feedback-staging.cdac.in/api/*` | Node.js 22 LTS + Fastify 5 + TypeScript | Business Logic, RLS context, auth sessions |
| **Authentication** | `https://feedback-staging.cdac.in/auth/*` | Fastify session cookie + Google OAuth 2.0 | Session issuance, logout, whoami |
| **Database** | *Internal only* (PostgreSQL 16) | PostgreSQL 16 + RLS | Data persistence, anonymity isolation |

### Network Perimeter & Ports
- **Exposed Public Ports**:
  - `80/tcp` (HTTP) -> 301 Permanent Redirect to HTTPS
  - `443/tcp` (HTTPS) -> TLS 1.2/1.3, Nginx Reverse Proxy (rate limits; no WAF)
- **Internal / Non-Exposed Ports** (Blocked by firewall / internal Docker network):
  - `3000/tcp` (Fastify API backend) - internal Docker network only
  - `5432/tcp` (PostgreSQL DB) - internal Docker network only, `127.0.0.1` binding

---

## 2. Test Accounts & Role-Based Personas

Three distinct role accounts are provisioned in the staging seed dataset. **Correction:** the actual seed file is `apps/api/src/db/seed.sql` (there is no Supabase-based `seed.sql` on this branch), and it provisions `*@test.local` accounts, not the `@acts.cdac.in`/`@cdac.in` addresses below — those were placeholder examples, not what the seed actually creates:

| Role | Test Email Identifier (as actually seeded) | Permissions & Boundaries |
|---|---|---|
| **Student** | `student1@test.local` (and similar, see `apps/api/src/db/seed.sql`) | Submits feedback only for active sessions within their enrolled cohort (batch, centre, course). Cannot view other students' submissions or reports. |
| **Course Coordinator (CC)** | `cc@test.local`, `cc.atc@test.local` | Manages sessions, uploads roster, views aggregated feedback reports ONLY for their assigned centre and course scope. |
| **Portal Administrator** | `admin@test.local` | Full management access across all C-DAC centres, ATCs, courses, batches, and global configuration. |

`DEPLOYMENT-CHECKLIST.md` requires these seeded/test accounts to be absent before go-live ("Go-live" section). `npm run seed` (`apps/api/src/db/seed.ts` + `seed.sql`) refuses to run when `NODE_ENV=production`; it is local/CI test data only, never applied to a production deploy.

---

## 3. Critical Security Commitments to Verify
Auditors are specifically requested to test and verify the following architectural boundaries:
1. **Student Anonymity Invariant**:
   - `public.responses` table must never contain user email, PRN, IP address, or timestamp.
   - `session_report()` function must enforce $k \ge 3$ minimum threshold and shuffle comment order randomly to prevent timing correlation.
   - **Known residual risk, not yet closed (CMP-3):** at the raw storage layer, `responses` and `submissions` rows from the same submission share `xmin`/heap order, and `submissions.submitted_at` sits next to them — a DB superuser or decrypted-backup holder could still correlate by position/time. The application-layer guarantee above holds; the storage-layer one does not yet.
2. **Horizontal Privilege Escalation (BOLA/IDOR)**:
   - Verify CCs from one ATC cannot view or modify feedback sessions of another ATC or centre.
   - Verify students cannot submit answers to cohorts they are not rostered in.
3. **CERT-In 180-Day Audit Logging**:
   - Confirm that all administrative actions, roster uploads, and logins create entries in `public.audit_logs`. **Correction:** these entries are append-only (DB-enforced via trigger, blocking even the table owner — `apps/api/src/db/migrations/002_security.sql:88-104`), not "tamper-evident" in the cryptographic sense — there is no hash chain and no off-host copy, and a Postgres superuser could still drop the trigger. Coverage is also incomplete: authz failures and bulk PII reads/exports aren't logged (CMP-6).
4. **Age assurance (CMP-9):** the platform assumes an adult (18+) PG-diploma student cohort, with no date-of-birth field and no technical control against a minor's email being rostered. This assumption is not formally recorded elsewhere and should be confirmed by CDAC before go-live (see `docs/THREAT-MODEL.md` §1 for the fuller note).
