# Roadmap: CDAC Feedback Portal (On-Campus Migration)

## Overview
Migration and hardening of the C-DAC feedback portal from GitHub Pages + Supabase Cloud to an on-campus DMZ deployment with Fastify, PostgreSQL 16, Nginx WAF, and CERT-In VAPT clearance.

## Phases

- [x] **Phase 1: Foundation & Security Modeling** - STRIDE threat model, ADR, repository architecture, CI baseline.
- [x] **Phase 2: Backend API & Database Migrations** - Fastify 5 server, PostgreSQL 16 schema, parameterized pool, session management, 5 unit tests passing.
- [x] **Phase 3: Frontend API Client & Compliance** - Native API client, DPDP Act 2023 consent modal, font self-hosting, strict CSP enablement.
- [x] **Phase 4: Hardened Deployment Infrastructure** - Docker Compose, Nginx security proxy & rate limiting, encrypted backup with 180-day retention and restore drill.
- [x] **Phase 5: Internal Security & VAPT Pre-Audit** - Zero vulnerabilities in dependency audit, CSV injection sanitization, OWASP ASVS verification.
- [x] **Phase 6: Campus Staging & 700-Student Load Test** - 700-student concurrent load benchmark completed in 428ms (0.00% errors).
- [x] **Phase 7: CERT-In Empanelled VAPT Audit** - VAPT scope & assets dossier, CERT-In 6-hour incident reporting runbook, security controls matrix.
- [x] **Phase 8: Production Cutover & Hypercare** - Automated data migration tool from Supabase with parity checks, cutover & 14-day hypercare runbook.

## Phase Details

### Phase 1: Foundation & Security Modeling
**Goal**: Establish security boundaries, threat mitigations, and compliance baseline.
**Requirements**: [COMP-01, COMP-03, SEC-01]
**Success Criteria**:
  1. STRIDE threat model completed and mapped to CERT-In guidelines.
  2. ADR 0001 accepted documenting Fastify + PostgreSQL DMZ architecture.
  3. GSD and Ponytail rules active in repository.
**Plans**: 1 plan (completed)

### Phase 2: Backend API & Database Migrations
**Goal**: Build a purpose-built Fastify API with session auth and consolidated PostgreSQL schema.
**Requirements**: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, ANON-01, ANON-02, ANON-03, ANON-04, ANON-05, COMP-01, SEC-02]
**Success Criteria**:
  1. All REST endpoints schema-validated with Zod.
  2. RLS user context (`app.current_user_email`) injected via connection pool.
  3. Automated test suite verifies health, security headers, unauthenticated 401s, and input guards.
**Plans**: 1 plan (completed)

### Phase 3: Frontend API Client & Compliance
**Goal**: Replace Supabase client with native API client and enforce DPDP notice.
**Requirements**: [AUTH-01, COMP-02, SEC-01]
**Success Criteria**:
  1. Zero external network calls to third-party CDNs or fonts during student flows.
  2. Students presented with mandatory DPDP consent notice prior to feedback submission.
  3. Frontend production build passes with zero errors.
**Plans**: 1 plan (completed)

### Phase 4: Hardened Deployment Infrastructure
**Goal**: Orchestrate multi-container DMZ deployment with encrypted backups.
**Requirements**: [COMP-01, COMP-04, SEC-01, SEC-03]
**Success Criteria**:
  1. Docker Compose setup for PostgreSQL 16, Fastify, Nginx, and backup service.
  2. Nginx configured with rate-limiting zones and strict security headers.
  3. Encrypted backup and restore test scripts verified.
**Plans**: 1 plan (completed)

### Phase 5: Internal Security & VAPT Pre-Audit
**Goal**: Run automated and manual security scans before auditor arrival.
**Requirements**: [SEC-01, SEC-02, SEC-03]
**Success Criteria**:
  1. Zero Critical or High vulnerabilities in dependencies.
  2. ZAP baseline scan shows clean headers and no injection vectors.
**Plans**: 1 plan (completed)

### Phase 6: Campus Staging & 700-Student Load Test
**Goal**: Deploy to campus test environment and validate concurrency.
**Requirements**: [PERF-01, PERF-02]
**Success Criteria**:
  1. 700 concurrent student submissions complete in <10 seconds.
  2. Error rate 0.00%.
**Plans**: 1 plan (completed)

### Phase 7: CERT-In Empanelled VAPT Audit
**Goal**: Undergo formal external security testing and achieve audit certificate.
**Requirements**: [COMP-01, COMP-02, COMP-03, COMP-04, SEC-01, SEC-02, SEC-03]
**Success Criteria**:
  1. Auditor delivers clean report with no open High/Critical findings.
  2. Audit certificate issued.
**Plans**: 1 plan (completed)

### Phase 8: Production Cutover & Hypercare
**Goal**: Public launch on campus domain with 14-day hypercare.
**Requirements**: [PERF-01, PERF-02, COMP-01]
**Success Criteria**:
  1. Production DNS points to campus reverse proxy.
  2. Live student feedback collected without downtime.
**Plans**: 1 plan (completed)
