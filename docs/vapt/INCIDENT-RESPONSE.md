# Incident Response and Log Preservation

CERT-In directions (IT Act s.70B(6)) require reporting a cyber incident within 6 hours of detection.

`DC="docker compose --env-file deploy/.env -f deploy/docker-compose.yml"`

## 1. Contacts
- CERT-In: `incident@cert-in.org.in`, toll free 1800-11-4949, https://www.cert-in.org.in
- C-DAC CISO / incident owner: **to be named before go-live**
- System administrator: **to be named before go-live**

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
- Remove a compromised staff account from `staff_roster` (access is revoked at the next request once role re-check is implemented; until then rotate `COOKIE_SECRET`).

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
- `public.audit_logs` records admin actions and logins. It is append-only by convention; database-enforced immutability is a target, not yet verified.
- Encrypted DB backups are kept 180 days in volume `backups_data` (and offsite if `BACKUP_OFFSITE_TARGET` is set).
- Host clock must sync to NPL/NIC NTP: `samay1.nplindia.org`, `samay2.nplindia.org`, `time.nic.in`.

## 5. Recovery
Follow "Backup and restore" in `docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md`; rebuild with `$DC up -d --build` after the cause is fixed.
