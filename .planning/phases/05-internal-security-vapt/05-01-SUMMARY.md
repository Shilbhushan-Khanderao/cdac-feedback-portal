# Phase 5: Internal Security & VAPT Pre-Audit - Summary

**Status**: Completed  
**Executed**: 2026-10-05  

## Verification Results

### 1. Dependency Vulnerability Audits
- **Root Client**: `npm audit` reports **0 vulnerabilities**.
- **Fastify API Server**: Vitest upgraded to `^5.0.3` resolving `@vitest/mocker` advisory; `npm audit` reports **0 vulnerabilities**.

### 2. OWASP ASVS & Top 10 SAST Analysis
- **A01: Broken Access Control**: Enforced through PostgreSQL RLS (`public.can_manage`, `public.in_my_cohort`, `public.my_email()`) coupled with Fastify preHandlers (`requireAuth`, `requireStaff`, `requireAdmin`).
- **A02: Cryptographic Failures**: Passwords/tokens replaced with Google OAuth identity + cryptographically secure 256-bit signed session tokens via `@fastify/cookie`.
- **A03: Injection**:
  - **SQL Injection**: 100% parameterised SQL statements using `$1, $2, ...` across all route handlers.
  - **CSV Formula Injection**: Input sanitization implemented in `RosterPage.tsx` and output cell escaping (`=, +, -, @, \t, \r`) implemented in `src/reports/aggregate.ts` (`toCsv`).
- **A05: Security Misconfiguration**: `@fastify/helmet` enabled with strict CSP (`default-src 'self'`), HSTS (`max-age=31536000`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
- **A07: Identification and Authentication Failures**: Server session table with absolute expiration and revocation (`user_sessions`). Rate limiting configured at 60 req/min per IP.

### 3. CERT-In Direction Compliance
- **180-Day Audit Logging**: Database table `public.audit_logs` records actors, actions, timestamps, and client IP addresses.
- **Strict Anonymity Guarantee**: `public.responses` table contains zero student identifiers, emails, or submission timestamps. Reports require $k \ge 3$ submissions and randomize row order.
