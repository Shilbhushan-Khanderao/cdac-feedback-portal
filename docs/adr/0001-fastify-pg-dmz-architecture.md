# ADR 0001: Fastify + Node.js 22 LTS with Dedicated PostgreSQL 16 in Campus DMZ

## Status
Accepted

## Context
The C-DAC Feedback Portal currently runs on GitHub Pages (React SPA) and Supabase Cloud. For government compliance (CERT-In 180-day log retention in India, 6-hour incident reporting) and formal VAPT clearance by a CERT-In empanelled auditor, data must reside within C-DAC premises. Self-hosting the full Supabase suite exposes ~10 microservice containers (Kong, GoTrue, PostgREST, Realtime, Storage, Studio) to the auditor, widening the attack surface and increasing maintenance overhead.

## Decision
1. Deploy a streamlined architecture composed of:
   - **Nginx Reverse Proxy**: Handles TLS termination, static asset serving, and rate limits. No WAF (e.g. Coraza) is deployed — Target, not implemented.
   - **Fastify 5 (Node.js 22 LTS)**: Lightweight, high-throughput REST API with Zod validation on every route.
   - **PostgreSQL 16**: Dedicated database on an internal VLAN, with `pgcrypto` and Row-Level Security. (No `pgAudit` — it is not installed in this repo's migrations; DDL/DML traceability relies on the application's own `audit_logs` table instead.)
2. Authenticate users via server-side OAuth2 with state and PKCE (S256) — implemented, not just a target; see `apps/api/src/modules/auth/routes.ts` — issuing an `HttpOnly`, `Secure`, `SameSite=Lax` cookie linked to a database-backed session table.
3. Keep frontend changes minimal by swapping direct `supabase-js` calls with a typed API client, preserving all existing UI pages and components.

## Consequences
- **Positive**:
  - Dramatically smaller attack surface for VAPT audit.
  - Feedback data stays on-campus; identity data does not fully — Google OAuth sends email/name to Google's infrastructure during sign-in (CMP-5, undisclosed in the student notice as of this writing). "Zero external dependency" holds for the SPA bundle (no CDNs/trackers at runtime) but not for the login flow.
  - Progress toward Indian data sovereignty and CERT-In directions; NTP sync and 180-day infra log retention are still Targets, not yet implemented (see `docs/THREAT-MODEL.md`, `docs/security/simulation/05-client-privacy-compliance.md` CMP-7).
  - Retains all existing SQL logic and triggers. There is no pgTAP suite on this branch (that was specific to the retired Supabase version) — security/RLS behaviour is covered by vitest (`apps/api/tests/rls-app-role.test.ts` and others).
- **Negative**:
  - Need to maintain deployment artifacts (Docker/Podman compose, Nginx configs, backup scripts) internally.
