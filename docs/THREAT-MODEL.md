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
| **Student Roster** (`student_roster`) | **PII (DPDP Protected)** | PostgreSQL `student_roster` table | Active batch lifecycle | PRN, Full Name, Email. Access restricted to Admin and cohort Course Coordinator (CC). |
| **Staff Roster** (`staff_roster`) | **Internal** | PostgreSQL `staff_roster` table | Active employment/duty | Full Name, Email, Role, Centre/Course scope. |
| **Session & Audit Logs** | **Compliance Audit** | App stdout -> Loki/ELK + pgAudit | **180 days (CERT-In mandate)** | System events, login attempts, roster edits, schedule locks. User IP, timestamp, action. Feedback text excluded. |

---

## 2. STRIDE Threat Analysis & Mitigations

### 2.1 Spoofing (Identity)
- **Threat**: Attacker attempts to forge student identity, impersonate a Course Coordinator, or submit feedback on behalf of another student.
- **Mitigations**:
  - Server-side OAuth2 PKCE flow (Google / C-DAC SSO).
  - Signed, `HttpOnly`, `Secure`, `SameSite=Lax` session cookies with cryptographic session IDs stored in PostgreSQL.
  - Pre-callback roster check: non-rostered emails are rejected with 403 Forbidden before session creation.
  - Active session validation on every protected route.

### 2.2 Tampering (Data Integrity)
- **Threat**: Attacker modifies closed session results, manipulates feedback scores, or alters student roster.
- **Mitigations**:
  - Parameterized SQL queries via native `pg` driver; zero dynamic query concatenation.
  - Zod schema validation on every API request boundary.
  - Database trigger `trg_lock_closed_schedule` prevents modifying session schedule or faculty once closed.
  - Append-only audit logging (`audit_logs`) for all administrative edits.
  - PostgreSQL Row-Level Security (RLS) as a defense-in-depth second layer.

### 2.3 Repudiation
- **Threat**: User claims they did not submit feedback, or admin denies altering session parameters.
- **Mitigations**:
  - `submissions` table records completion receipt (`email`, `session_id`, `submitted_at`).
  - pgAudit enabled for all DDL and DML operations on roster and configuration tables.
  - NTP synchronization with Indian standard time servers (NIC / NPL) as required by CERT-In directions.

### 2.4 Information Disclosure (Confidentiality)
- **Threat**: Dean, coordinator, or student discovers who wrote a specific negative comment or low rating.
- **Mitigations**:
  - Anonymity architectural barrier: `responses` table completely lacks student identifiers and submitted timestamps.
  - `session_report()` stored procedure enforces minimum $k=3$ responses before returning any data.
  - Random ordering (`ORDER BY random()`) applied on free-text comment queries.
  - TLS 1.2 and 1.3 with HSTS (`max-age=63072000; includeSubDomains; preload`).
  - Content Security Policy (CSP) blocking external script execution and CDN fonts.

### 2.5 Denial of Service (Availability)
- **Threat**: Mass automated submission flood during peak submission windows (700+ simultaneous students).
- **Mitigations**:
  - Reverse Proxy (Nginx) connection rate limiting (100 req/min per IP, burst=30).
  - Fastify `@fastify/rate-limit` on submit and auth endpoints (10 submits/min per user).
  - Max request payload limits (50 KB for feedback submissions).
  - Stateless Fastify API instances (2x load balanced).

### 2.6 Elevation of Privilege (Access Control)
- **Threat**: Student attempts to query Coordinator dashboard or call staff RPCs (`session_report`, roster uploads).
- **Mitigations**:
  - Route-level role-based guard middleware checking session role (`student`, `cc`, `admin`).
  - Centre and course scope isolation: CCs can only access batches and sessions for their assigned centre.
  - 47 automated pgTAP security tests executed continuously in CI.
