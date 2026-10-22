# Incident Response and Log Preservation

CERT-In directions (IT Act s.70B(6)) require reporting a cyber incident within 6 hours of detection.

`DC="docker compose --env-file deploy/.env -f deploy/docker-compose.yml"`

## 1. Contacts
- CERT-In: `incident@cert-in.org.in`, toll free 1800-11-4949, https://www.cert-in.org.in
- **Security Incident Owner: `<name/email — to be filled in by CDAC before go-live>`.** This is the single person who decides containment, drives the CERT-In notification, and signs off recovery for a *security* incident (unauthorised access, DoS, breach). It is a distinct role from the DPDP grievance officer below — do not reuse that contact here, and do not reuse this one for data-principal requests.
  - *How to populate:* edit this line directly in this file and commit the change (this is a text runbook, not a database-backed record like the grievance officer contact). Name a real person with the authority to act during an incident, plus a backup if the primary is unreachable.
- C-DAC CISO: **to be named before go-live** (may be the same person as the Security Incident Owner above)
- System administrator: **to be named before go-live**
- DPDP grievance officer / data-principal requests (access, correction, erasure) — **a different role from the Security Incident Owner above**: admin-managed contact (name + email) in `public.grievance_officers`, editable from the admin UI (`apps/web/src/features/admin/ManagePage.tsx`). Not a security-incident contact.

## 2. First hour: contain and preserve
- Do not wipe or rebuild the host before evidence is copied.
- Isolate at the campus firewall/VLAN if it is a network attack. To stop traffic quickly: `$DC stop nginx`.
- Preserve evidence (run on the host; `POSTGRES_USER`/`POSTGRES_DB` come from `deploy/.env`):
```bash
$DC logs --timestamps > incident_logs_$(date +%Y%m%d_%H%M%S).log
$DC exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -t public.audit_logs "$POSTGRES_DB"' > incident_audit_$(date +%Y%m%d_%H%M%S).sql
$DC exec backup /scripts/backup.sh
```
- Credential compromise: rotate `COOKIE_SECRET` (logs everyone out), `GOOGLE_CLIENT_SECRET`, `APP_DB_PASSWORD`, `POSTGRES_PASSWORD`; `$DC up -d`.
- Remove a compromised staff account from `staff_roster`: access is revoked on their very next request — `getSession` re-checks the current role from the roster live on every call (`apps/api/src/modules/auth/session.ts`), it does not trust a cached role. Rotating `COOKIE_SECRET` is only needed as a blunt "log everyone out now" move (e.g. a shared/unknown account you can't immediately identify and remove), not a requirement for this to work.

## 3. Notification template (within 6 hours)
```text
To: incident@cert-in.org.in
Subject: Incident Report: Cyber Incident on C-DAC Feedback Portal

1. Organisation: Centre for Development of Advanced Computing (C-DAC)
2. Contact person: [name, phone, email]
3. Type of incident: [unauthorised access / DoS / injection probe / other]
4. Detection date and time (IST): [YYYY-MM-DD HH:MM]
5. Affected asset: https://feedback.example.in, host IP [ip]
6. Controls in place: campus firewall, nginx TLS and rate limits, Postgres RLS
7. Description: [anomaly, source IPs, impacted records]
8. Containment: [firewall block, secret rotation, snapshot]
9. Logs: container logs and audit_logs preserved as above
```
Personal-data breach: also follow the DPDP Act notification duties through the C-DAC data protection officer.

## 4. Logs and time
- Application and nginx logs go to container stdout (json-file, rotated 10 MB x 5 per service). Rotation means older entries are lost: forward them to the campus log server for 180-day retention (target; not configured by this repo).
- `public.audit_logs` records admin actions and logins. It is append-only **by DB enforcement** (`trg_audit_logs_no_change`/`trg_audit_logs_no_truncate`, `apps/api/src/db/migrations/002_security.sql:88-104`), blocking UPDATE/DELETE/TRUNCATE for every role including the table owner. The only sanctioned exception is `apps/api/src/db/retention-purge.ts`, run manually by an operator, which disables/re-enables the trigger inside one transaction and leaves its own `RETENTION_PURGE` row. This is not the same as cryptographic tamper-evidence (no hash chain, no off-host copy), and a Postgres superuser could still drop the trigger outright.
- Encrypted DB backups are kept 180 days in volume `backups_data` (and offsite if `BACKUP_OFFSITE_TARGET` is set).
- Host clock must sync to NPL/NIC NTP: `samay1.nplindia.org`, `samay2.nplindia.org`, `time.nic.in`.

## 5. Recovery
Follow "Backup and restore" in `docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md`; rebuild with `$DC up -d --build` after the cause is fixed.
