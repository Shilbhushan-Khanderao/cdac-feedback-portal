# C-DAC Feedback Portal — Production Deployment & VAPT Clearance Guide

This document details the configuration, security controls, and step-by-step verification checklist required for deploying the C-DAC Feedback Portal on the internal C-DAC network and passing CERT-In empanelled VAPT auditing.

---

## 1. Pre-Deployment System Requirements

- **Target OS:** Ubuntu 22.04 LTS / 24.04 LTS or Rocky Linux 9 / RHEL 9 (64-bit)
- **Container Runtime:** Docker Engine 24+ and Docker Compose v2
- **Network Interfaces:**
  - Ingress: HTTPS port 443 (HTTP port 80 strictly redirects to 443)
  - Egress: No public internet egress required; system is 100% self-contained and air-gap compatible
- **Time Synchronization (CERT-In Mandatory):** NTP configured with `ntp.nic.in` or National Physical Laboratory (NPL) time servers.

---

## 2. Security Architecture & Controls Overview

| Security Requirement | Implementation | Auditor Verification Command / Evidence |
|---|---|---|
| **SQL Injection (OWASP A03)** | 100% parameterised SQL (`$1, $2`), Zod schema validation at route boundaries, JSONB schema checks | Inspect `server/src/routes/` and stored procedure `submit_feedback` |
| **Row Level Security (RLS)** | PostgreSQL native RLS enabled on `feedback_sessions`, `submissions`, `responses`, `student_roster` | `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('feedback_sessions', 'submissions', 'responses', 'student_roster');` |
| **Student Anonymity** | De-identification at DB engine layer; `responses` table has no student foreign key or timestamp; reports require k≥3 responses | Schema definition `server/src/db/schema.sql` |
| **DPDP Act 2023 Compliance** | Purpose-restricted notice presented to students before feedback entry; no third-party tracking; sovereign on-prem storage | Verified in student auth flow; zero external CDN dependencies |
| **Session Cookie Security** | Signed, `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookies; 256-bit cryptographically secure session IDs | Verified in `server/src/auth/session.ts` and Nginx headers |
| **HTTP Security Headers** | CSP (`default-src 'self'`), HSTS (2-year preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` | `curl -I https://<portal-domain>/` |
| **Rate Limiting** | Nginx: 120 req/min general, 20 req/min auth endpoints; Fastify in-process body limit 50 KB | Check `deploy/nginx/nginx.conf` and `server/src/index.ts` |
| **CERT-In 180-Day Audit Logs** | Append-only `audit_logs` table recording all authentication, session creation, and administrative access | `SELECT COUNT(*), action FROM public.audit_logs GROUP BY action;` |
| **Encrypted Backups** | Daily automated `pg_dump` encrypted with AES-256-CBC, with 180-day automated retention | Container `backup` in `deploy/docker-compose.yml` |

---

## 3. Step-by-Step Deployment Procedure

### Step 3.1: Host Time Synchronization (CERT-In Direction 2a)
Ensure system clock is synchronized to Indian Standard Time via authorized NTP:
```bash
sudo timedatectl set-ntp true
sudo timedatectl set-timezone Asia/Kolkata
timedatectl status
```

### Step 3.2: TLS Certificate Installation
Obtain an internal PKI certificate from C-DAC CA or server certificate:
1. Place the full-chain certificate at:
   `/opt/cdac-feedback/deploy/nginx/certs/feedback.cdac.in.crt`
2. Place the private key (permission `600`) at:
   `/opt/cdac-feedback/deploy/nginx/certs/feedback.cdac.in.key`
3. In `deploy/nginx/nginx.conf`, verify that `server_name` reflects the assigned FQDN (e.g. `feedback.acts.cdac.in`).

### Step 3.3: Configure Production Secrets
Copy `server/.env.example` to production `.env`:
```bash
cp server/.env.example server/.env
chmod 600 server/.env
```
Generate high-entropy secrets (min 64 hex characters):
```bash
openssl rand -hex 32 # For COOKIE_SECRET
openssl rand -hex 32 # For BACKUP_ENCRYPTION_KEY
openssl rand -hex 24 # For POSTGRES_PASSWORD
```
Fill in `server/.env`:
- `COOKIE_SECRET`: generated secret
- `DATABASE_URL`: `postgresql://postgres:<generated-password>@db:5432/cdac_feedback`
- `NODE_ENV`: `production`
- `CORS_ORIGIN`: `https://feedback.acts.cdac.in`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: production Google OAuth credentials registered for C-DAC ACTS domain

### Step 3.4: Launch Containers
From the `deploy/` directory:
```bash
docker compose build
docker compose up -d
```

### Step 3.5: Initialize Database & Verify RLS
Run schema migrations and initialize admin users:
```bash
docker compose exec db psql -U postgres -d cdac_feedback -f /docker-entrypoint-initdb.d/01-schema.sql
```
Verify RLS status:
```bash
docker compose exec db psql -U postgres -d cdac_feedback -c "
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
"
```
Ensure `feedback_sessions`, `submissions`, `responses`, and `student_roster` show `rowsecurity = true`.

---

## 4. VAPT Audit Verification Checklist

Before submitting to the CERT-In auditor, run these verification tests:

- [ ] **HTTPS Redirection:** `curl -I http://<host>/` returns `301 Moved Permanently` to `https://...`
- [ ] **Strict-Transport-Security:** Header `max-age=63072000; includeSubDomains; preload` is present.
- [ ] **Cookie Security Flags:** Cookie `cdac_session` has `HttpOnly`, `Secure`, and `SameSite=Lax`.
- [ ] **Large Payload Rejection:** `curl -X POST -d @5MB_file.bin https://<host>/api/...` returns `413 Payload Too Large` from Fastify/Nginx.
- [ ] **Localhost CORS Rejection:** `curl -H "Origin: http://localhost:9999" -I https://<host>/api/reference/batches` returns no `Access-Control-Allow-Origin` in production mode.
- [ ] **Student Anonymity Check:** Query `SELECT * FROM public.responses;` confirms zero student ID or IP address columns exist.
- [ ] **Audit Trail Retention:** Run a test dev-login or admin login and confirm event is captured in `public.audit_logs`.
