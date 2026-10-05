---
last_mapped_commit: b4f4d79f15ec1cb0b0dc15d9e97406c94f6650c0
last_mapped_at: 2026-10-05
---
# Testing Strategy & Test Suites

## Automated Test Suites

### 1. Database Security & RLS Tests (`supabase/tests/rls_and_submit.test.sql`)

- **Framework**: pgTAP
- **Command**: `npm run test:db`
- **Scope**: 47 automated tests verifying:
  - Anonymity guarantees (no email or timestamp in responses)
  - Cohort isolation (student only submits to own centre's session)
  - Direct SELECT on responses blocked for authenticated users
  - Double submission prevention
  - Closed session lock trigger

### 2. Fastify API Server Suite (`server/src/tests/server.test.ts`)

- **Framework**: Vitest
- **Command**: `npm run server:test`
- **Scope**:
  - `/healthz` health and uptime check
  - OWASP / CERT-In security headers (nosniff, DENY, strict CSP, HSTS)
  - Unauthenticated 401 Unauthorized access control across all protected endpoints
  - Dev login email validation and input constraints

### 3. Frontend Unit & Format Tests (`src/lib/*.test.ts`, `src/reports/*.test.ts`)

- **Framework**: Vitest
- **Command**: `npm test`
- **Scope**:
  - Report calculations and sentiment score distributions
  - Error and date formatting routines

### 4. Build Verifications

- **Frontend**: `npm run build` (tsc -b && vite build)
- **Server**: `npm run server:build` (tsc)
