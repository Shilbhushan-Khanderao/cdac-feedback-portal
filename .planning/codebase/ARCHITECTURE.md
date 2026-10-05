---
last_mapped_commit: b4f4d79f15ec1cb0b0dc15d9e97406c94f6650c0
last_mapped_at: 2026-10-05
---
# System Architecture

## Architecture Overview

The system follows a three-tier on-campus DMZ architecture designed for minimal VAPT attack surface and data sovereignty:

```
[ Public HTTPS Client ]
        │
        ▼ (Port 443)
[ Campus Perimeter Firewall ]
        │
        ▼
[ Nginx Reverse Proxy + WAF ] ── Serves static React build (dist/)
  │                            ── Terminates TLS 1.2/1.3
  │                            ── Enforces rate limits (120 req/min general, 20 req/min auth)
  │                            ── Adds strict security headers (CSP, HSTS, frame-ancestors none)
  │
  ├──────► /api/*, /auth/* (HTTP 3000)
  │
[ Fastify 5 API Server ] ────── Stateless Node.js 22 LTS service
  │                            ── Zod request validation
  │                            ── Server-side OAuth2 PKCE / Dev Login
  │                            ── Sets/validates signed HttpOnly cookies (cdac_session)
  │                            ── Injects app.current_user_email into connection pool
  │
  ├──────► TCP 5432 (Internal Bridge / Private VLAN)
  │
[ PostgreSQL 16 ] ───────────── Relational store with RLS defense-in-depth
                               ── Zero student id or timestamps in responses table
                               ── Stored procedures for atomic submits and sanitized reports
                               ── pgAudit + user_sessions + audit_logs tables
```

## Security & Anonymity Barrier

1. **Student Anonymity**:
   - `submissions` stores `(session_id, email, submitted_at)` to guarantee exactly one submission per student per session.
   - `responses` stores `(session_id, answers)` with NO foreign key to `submissions`, NO student ID, and NO timestamp.
   - CCs never select `responses` directly. They invoke `session_report()` which only outputs data when `now() > closes_at` AND total responses $\ge 3$. Free-text comments are returned in random order.
2. **Access Control**:
   - Course Coordinators are bounded by `centre_id` and optional `course_id`.
   - Students are bounded by `(batch_id, centre_id, course_id)`.
