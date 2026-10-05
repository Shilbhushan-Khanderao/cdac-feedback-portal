# ADR 0001: Fastify + Node.js 22 LTS with Dedicated PostgreSQL 16 in Campus DMZ

## Status
Accepted

## Context
The C-DAC Feedback Portal currently runs on GitHub Pages (React SPA) and Supabase Cloud. For government compliance (CERT-In 180-day log retention in India, 6-hour incident reporting) and formal VAPT clearance by a CERT-In empanelled auditor, data must reside within C-DAC premises. Self-hosting the full Supabase suite exposes ~10 microservice containers (Kong, GoTrue, PostgREST, Realtime, Storage, Studio) to the auditor, widening the attack surface and increasing maintenance overhead.

## Decision
1. Deploy a streamlined architecture composed of:
   - **Nginx Reverse Proxy & WAF**: Handles TLS termination, static asset serving, rate limits, and Coraza WAF (OWASP CRS v4).
   - **Fastify 5 (Node.js 22 LTS)**: Lightweight, high-throughput REST API with Zod validation on every route.
   - **PostgreSQL 16**: Dedicated database on an internal VLAN, with pgAudit, pgcrypto, and Row-Level Security.
2. Authenticate users via server-side OAuth2 PKCE, issuing an `HttpOnly`, `Secure`, `SameSite=Lax` cookie linked to a database-backed session table.
3. Keep frontend changes minimal by swapping direct `supabase-js` calls with a typed API client, preserving all existing UI pages and components.

## Consequences
- **Positive**:
  - Dramatically smaller attack surface for VAPT audit.
  - Zero external dependency or third-party cloud data transfer.
  - Full compliance with Indian data sovereignty and CERT-In directions.
  - Retains all existing SQL logic, triggers, and pgTAP security tests.
- **Negative**:
  - Need to maintain deployment artifacts (Docker/Podman compose, Nginx configs, backup scripts) internally.
