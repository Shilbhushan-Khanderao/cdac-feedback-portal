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
  - `443/tcp` (HTTPS) -> TLS 1.3 only, Nginx Reverse Proxy + WAF
- **Internal / Non-Exposed Ports** (Blocked by firewall / internal Docker network):
  - `3000/tcp` (Fastify API backend) - internal Docker network only
  - `5432/tcp` (PostgreSQL DB) - internal Docker network only, `127.0.0.1` binding

---

## 2. Test Accounts & Role-Based Personas

Three distinct role accounts are provisioned in the staging seed dataset (`server/src/db/seed.sql`):

| Role | Test Email Identifier | Permissions & Boundaries |
|---|---|---|
| **Student** | `student.ai.1@acts.cdac.in` | Submits feedback only for active sessions within their enrolled cohort (batch, centre, course). Cannot view other students' submissions or reports. |
| **Course Coordinator (CC)** | `cc.pune.ai@acts.cdac.in` | Manages sessions, uploads roster, views aggregated feedback reports ONLY for assigned centre (Pune) and assigned course (PGCP-AI). |
| **Portal Administrator** | `admin.acts@cdac.in` | Full management access across all C-DAC centres, ATCs, courses, batches, and global configuration. |

---

## 3. Critical Security Commitments to Verify
Auditors are specifically requested to test and verify the following architectural boundaries:
1. **Student Anonymity Invariant**:
   - `public.responses` table must never contain user email, PRN, IP address, or timestamp.
   - `session_report()` function must enforce $k \ge 3$ minimum threshold and shuffle comment order randomly to prevent timing correlation.
2. **Horizontal Privilege Escalation (BOLA/IDOR)**:
   - Verify CCs from one ATC cannot view or modify feedback sessions of another ATC or centre.
   - Verify students cannot submit answers to cohorts they are not rostered in.
3. **CERT-In 180-Day Audit Logging**:
   - Confirm that all administrative actions, roster uploads, and logins create tamper-evident entries in `public.audit_logs`.
