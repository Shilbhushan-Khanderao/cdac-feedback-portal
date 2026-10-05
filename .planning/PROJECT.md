# CDAC Feedback Portal: On-Campus Migration & VAPT

## What This Is
An on-campus student feedback portal for C-DAC centres and Associated Training Centres (ATCs). Students submit module evaluations anonymously, and Course Coordinators schedule sessions, monitor response counts, and generate analytical reports. This project transitions the application from third-party cloud infrastructure (GitHub Pages + Supabase Cloud) to a dedicated, self-contained deployment in the C-DAC campus DMZ.

## Core Value
Strictly anonymous, tamper-proof student feedback collection with verifiable government compliance (CERT-In 180-day logging, DPDP Act 2023) and formal VAPT clearance by a CERT-In empanelled auditor.

## Requirements

### Validated
- [x] Initial React 19 + TypeScript + Vite + Tailwind v4 UI with TanStack Query.
- [x] Baseline database schema with 47 pgTAP security and Row-Level Security checks.
- [x] Module evaluation aggregates, NLP sentiment analysis, and PDF report generation.
- [x] Multi-tenant centre model (C-DAC Mumbai + ATCs) across PGCP-AC, PGCP-BDA, and PGCP-AI courses.

### Active Scope (On-Campus Migration)
- [x] Purpose-built Fastify 5 API server replacing direct Supabase client calls.
- [x] Consolidated PostgreSQL 16 schema with `app.current_user_email` context injection for RLS.
- [x] Native fetch API client in frontend (`src/lib/api.ts`).
- [x] Digital Personal Data Protection (DPDP) Act 2023 Consent Notice modal on student first login.
- [x] Removal of third-party CDN fonts for strict air-gapped / CSP compliance.
- [x] Hardened Docker Compose deployment (PostgreSQL 16, Fastify, Nginx WAF, encrypted backup).
- [ ] Staging deployment on campus server with load testing (700+ simultaneous students).
- [ ] Formal CERT-In VAPT audit and remediation clearance.

### Out of Scope
- Self-hosting the complete 10-container Supabase suite (unnecessary attack surface for VAPT).
- Public internet exposure of the PostgreSQL database port (strictly private VLAN).
- Storing student identity or timestamps on feedback response records (breaks core anonymity pledge).

## Context
- **Target Network**: C-DAC Campus DMZ behind campus perimeter firewall.
- **Auditor**: CERT-In Empanelled Information Security Auditing Organization.
- **Compliance Standards**: CERT-In Directions (28 Apr 2022 & Jul 2025 Guidelines), DPDP Act 2023 & DPDP Rules 2025, GIGW 3.0 / WCAG 2.1 AA, OWASP ASVS v4.0.3 Level 2.
- **Scale**: 700+ students concurrently submitting within a 10-second window.

## Constraints
- **Data Sovereignty**: 100% of data, logs, and backups must reside within Indian territory.
- **Log Retention**: Proxy, application, and database audit logs must be retained for at least 180 days with NIC/NPL NTP clock synchronization.
- **Incident SLA**: Cybersecurity incidents must be reportable to CERT-In within 6 hours.
