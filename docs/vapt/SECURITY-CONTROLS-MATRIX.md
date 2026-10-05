# C-DAC Feedback Portal: Security Controls & Compliance Matrix

| Requirement / Standard | Category | Implemented Mechanism | Verification Evidence |
|---|---|---|---|
| **CERT-In Direction 2(a)** | NTP Synchronization | System clock synchronized with Indian Standard Time via NPL / NIC NTP servers (`samay1.nplindia.org`). | Documented in `docs/vapt/INCIDENT-RESPONSE.md`. |
| **CERT-In Direction 2(b)** | 6-Hour Incident Notification | Formal incident notification procedure to `incident@cert-in.org.in` with emergency contact workflow. | Documented in `docs/vapt/INCIDENT-RESPONSE.md`. |
| **CERT-In Direction 2(e)** | 180-Day Audit Logging | Immutable `public.audit_logs` table storing actor, action, timestamp, and client IP inside Indian jurisdiction. | Verified in `server/src/db/schema.sql` and `server/src/routes/roster.ts`. |
| **DPDP Act 2023** | Notice & Consent | Explicit bilingual/English consent notice modal on first student login detailing purpose limitation and non-identifiable feedback storage. | Implemented in `src/auth.tsx`. |
| **Core Privacy Invariant** | Student Anonymity | `public.responses` table contains only `session_id` and `answers` (JSONB). No user email, PRN, or timestamp. $k \ge 3$ response threshold + randomized ordering. | Enforced in `submit_feedback` & `session_report` stored procedures in `schema.sql`. |
| **OWASP ASVS 2.1** | Session Management | Fastify signed cookies (`HttpOnly`, `SameSite=Lax`, `Secure`), 256-bit cryptographically random tokens, server-side revocation in `user_sessions`. | Verified in `server/src/auth/session.ts` and `server/src/tests/server.test.ts`. |
| **OWASP ASVS 4.1** | Access Control (BOLA/IDOR) | PostgreSQL Row Level Security (RLS) policies using `app.current_user_email` preventing horizontal cross-centre/cross-course data leakage. | Verified across all tables in `schema.sql` and 47 pgTAP tests. |
| **OWASP ASVS 5.1** | Injection Defenses | 100% parameterised SQL queries (`$1, $2, ...`), Zod schema validation on all inputs, CSV formula sanitization (`=, +, -, @`). | Verified in route handlers and `aggregate.ts`. |
| **OWASP ASVS 14.4** | HTTP Security Headers | Strict CSP (`default-src 'self'`), HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`. | Verified in `server/src/tests/server.test.ts` and `deploy/nginx/nginx.conf`. |
| **Zero CDN Policy** | Supply Chain Security | Fonts self-hosted locally via `@fontsource/inter`; zero external runtime CDN dependencies (`unpkg`, `google fonts`, `cdnjs`). | Verified in `index.html` and `vite.config.ts`. |
| **Data Resiliency** | Encrypted Disaster Recovery | Daily automated `pg_dump` with AES-256-CBC encryption, 180-day retention pruning, and recovery drill scripts. | Implemented in `deploy/backup/backup.sh` and `deploy/backup/restore-test.sh`. |
