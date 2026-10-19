# Production Runbook

`DC="docker compose --env-file deploy/.env -f deploy/docker-compose.yml"`, run from repo root. Hostname placeholder: `feedback.example.in`.

## Services
| Service | Role | Notes |
|---|---|---|
| db | Postgres 16, volume `pgdata` | owner user = `POSTGRES_USER` |
| migrate | one-shot `node dist/db/migrate.js` | uses `DATABASE_ADMIN_URL`; creates/updates role `feedback_app` |
| api | Fastify, :3000 internal | connects as `feedback_app` via `DATABASE_URL` |
| nginx | TLS :443, redirect :80, SPA | certs from `deploy/nginx/certs/` |
| backup | cron 02:00, volume `backups_data` | logs to container stdout |

Logs: `$DC logs -f api` (all services use json-file, 10 MB x 5).

## Deploy / update
```bash
git pull
$DC up -d --build        # migrate runs first; api starts only if it succeeded
$DC ps
```
Rollback: `git checkout <previous tag>` and `$DC up -d --build`. Migrations are forward-only; for a bad migration restore from backup (below).

## First admin
`$DC run --rm api node dist/db/bootstrap-admin.js <email> "<name>"`

## TLS renewal
Replace `fullchain.pem` / `privkey.pem` in `deploy/nginx/certs/`, then `$DC restart nginx`.
Changing the hostname requires `$DC up -d --build nginx` (the name is baked in at build).

## Backup and restore
- Daily encrypted dump (AES-256, key `BACKUP_ENCRYPTION_KEY`) to volume `backups_data`, 180-day retention. Optional rsync to `BACKUP_OFFSITE_TARGET`. Without it a backup lives only on this host.
- Manual: `$DC exec backup /scripts/backup.sh`
- List: `$DC exec backup ls -l /backups`
- Drill (monthly, and before go-live): `$DC exec backup /scripts/restore-test.sh /backups/<file>.sql.gz.enc` creates a scratch DB, restores with `ON_ERROR_STOP`, prints counts for every table (must include `responses`, `submissions`, `audit_logs`), drops the scratch DB.
- Real restore: stop `api`, decrypt with `openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in <file> | gunzip | psql ...` into an empty database, start `api`.
- Keep `BACKUP_ENCRYPTION_KEY` in a separate secure location; without it backups are unreadable.
- Offsite key: add under the `backup` service `volumes: ["./offsite_key:/run/offsite_key:ro"]` and set `BACKUP_OFFSITE_TARGET`.

## Monitoring
- Container health: `$DC ps`. Probe `https://feedback.example.in/api/health` from an external cron/uptime tool and alert the owner. No metrics stack is shipped (target).
- Disk: watch `pgdata` and `backups_data` volumes.

## Capacity
Start at 4 vCPU / 8 GB. Tune API pool and Postgres `max_connections` from load-test results (`tests/load/`). nginx limits: `/api` 600 req/min per IP (burst 100), `/auth` 60 req/min (burst 30), sized for campus NAT.

## Secrets rotation
Edit `deploy/.env`, `$DC up -d`. Rotating `COOKIE_SECRET` logs everyone out. Rotating `APP_DB_PASSWORD` is applied by `migrate` on the next `up`. Do not rotate `BACKUP_ENCRYPTION_KEY` without keeping the old key for existing backups.
