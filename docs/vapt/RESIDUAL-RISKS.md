# Residual risks — CMP-7 (log retention) and INF-3 (backup)

This file exists because `DEPLOYMENT-CHECKLIST.md` was already modified (uncommitted) by a parallel pass over `deploy/**` at the time this note was written, and the task asked for no overlap with that work-in-progress. It records what was true of the repo at that moment, so it doesn't contradict whatever the deploy pass lands. Re-check both items against the current `deploy/backup/backup.sh`, `deploy/nginx/nginx.conf` and `deploy/docker-compose.yml` once that pass is committed, and fold this file back into `DEPLOYMENT-CHECKLIST.md` or `docs/vapt/simulation/00-MASTER-REGISTER.md` at that point rather than keeping it as a permanent third location.

## CMP-7 — container log retention short of the CERT-In 180-day floor

At the time of writing, `deploy/docker-compose.yml` set every service's logging to:
```yaml
x-logging: &logging
  driver: json-file
  options: { max-size: "10m", max-file: "5" }
```
50 MB total per service, rotating out in hours-to-days under load — far short of the CERT-In 180-day minimum. `docs/vapt/INCIDENT-RESPONSE.md` §4 and `docs/THREAT-MODEL.md` §1 both already say this honestly (log forwarding to a campus store is "target; not configured by this repo"). Nothing in this pass changed that wording. If the parallel deploy pass changes the rotation size/count or adds a forwarder, update those two files' CMP-7 notes to match — don't leave them saying "not configured" once it is.

## INF-3 — backup role and encryption

At the time of writing:
- `deploy/backup/backup.sh` ran `pg_dump` connecting as `PGUSER=${POSTGRES_USER}` — i.e. the Postgres superuser/owner, not a restricted role — and encrypted the dump with AES-256-CBC via `openssl enc ... -pass env:BACKUP_ENCRYPTION_KEY` (key never on argv). Local retention was a 180-day `find -mtime +180 -delete`.
- The offsite copy path (`rsync` to `BACKUP_OFFSITE_TARGET`) required `BACKUP_OFFSITE_SSH_KEY` to point at a mounted key; `deploy/docker-compose.yml`'s `backup` service did not mount one by default, so offsite copy would fail closed (the script errors out) rather than silently skip, but it doesn't work "as shipped" without manual key provisioning.

If the parallel deploy pass changes the backup role (e.g. a dedicated read-only backup role instead of the superuser) or how the encryption key / offsite key are supplied, the compliance docs' "Encrypted Backups" and "Data Resiliency" rows (`docs/vapt/AUDIT-REPORT.md` §2.1, `docs/vapt/SECURITY-CONTROLS-MATRIX.md`) should be updated to cite the new mechanism instead of this note — this file is a placeholder for the gap, not the permanent record of the fix.
