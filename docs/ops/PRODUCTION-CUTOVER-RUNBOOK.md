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

Logs: `$DC logs -f api` (all services use json-file, 50 MB x 100 files = 5 GB/container; still local-host rotation, not durable 180-day retention — see `DEPLOYMENT-CHECKLIST.md`'s Logging section).

## Deploy / update
```bash
git pull
$DC up -d --build        # migrate runs first; api starts only if it succeeded
$DC ps
```
Rollback: `git checkout <previous tag>` and `$DC up -d --build`. Migrations are forward-only; for a bad migration restore from backup (below).

## First admin
`$DC run --rm migrate node dist/db/bootstrap-admin.js <email> "<name>"`

## TLS renewal
Replace `fullchain.pem` / `privkey.pem` in `deploy/nginx/certs/`, then `$DC restart nginx`.
Changing the hostname requires `$DC up -d --build nginx` (the name is baked in at build).

## Backup and restore
- Daily encrypted dump (AES-256, key `BACKUP_ENCRYPTION_KEY`) to volume `backups_data`, 180-day retention. Optional rsync to `BACKUP_OFFSITE_TARGET`. Without it a backup lives only on this host.
- Manual: `$DC exec backup /scripts/backup.sh`
- List: `$DC exec backup ls -l /backups`
- Drill (monthly, and before go-live): `$DC exec backup /scripts/restore-test.sh /backups/<file>.sql.gz.enc` creates a scratch DB, restores with `ON_ERROR_STOP`, prints counts for every table (must include `responses`, `submissions`, `audit_logs`), drops the scratch DB.
- Real restore: stop `api`. Each dump is encrypt-then-MAC'd — verify the `.hmac` sidecar file **before** decrypting (a tampered/truncated file must fail here, not partway through `openssl enc -d`):
  ```bash
  MAC_KEY=$(printf '%s:hmac' "$BACKUP_ENCRYPTION_KEY" | openssl dgst -sha256 | sed 's/^.*= //')
  openssl dgst -sha256 -hmac "$MAC_KEY" <file>.sql.gz.enc   # compare against <file>.sql.gz.enc.hmac
  openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in <file>.sql.gz.enc | gunzip | psql ...
  ```
  into an empty database, start `api`. (`restore-test.sh` does both steps correctly already — prefer it over the manual pipe when the scratch-DB drill, not a real restore, is all that's needed.)
- Backup role: by default `pg_dump` connects as the superuser (`POSTGRES_USER`). An optional least-privilege `BACKUP_DB_ROLE` is documented in `deploy/.env.example` (needs `BYPASSRLS` — a plain `SELECT` grant alone gives an incomplete dump under RLS) and `DEPLOYMENT-CHECKLIST.md`.
- Keep `BACKUP_ENCRYPTION_KEY` in a separate secure location; without it backups are unreadable.
- Offsite key: add under the `backup` service `volumes: ["./offsite_key:/run/offsite_key:ro"]` and set `BACKUP_OFFSITE_TARGET`.

## Monitoring
- Container health: `$DC ps`. Probe `https://feedback.example.in/api/health` from an external cron/uptime tool and alert the owner. No metrics stack is shipped (target).
- Disk: watch `pgdata` and `backups_data` volumes.

## Capacity
Start at 4 vCPU / 8 GB. Tune API pool and Postgres `max_connections` from load-test results (`npm run test:load`). Two-layer rate limiting, both sized for a campus NAT (many students behind one IP):
- nginx is a coarse per-IP backstop only — it can't verify the signed session cookie, so it's keyed on IP: `/api` 1500 req/min (burst 100), `/auth` 1200 req/min (burst 300).
- Fastify (`apps/api/src/app.ts`) does the real fine-grained limiting: it verifies the cookie's signature first, then keys on the session (240 req/min) or falls back to IP (1500 req/min) for unsigned/missing cookies.

## Secrets rotation
Edit `deploy/.env`, `$DC up -d`. Rotating `COOKIE_SECRET` logs everyone out. Rotating `APP_DB_PASSWORD` is applied by `migrate` on the next `up`. Do not rotate `BACKUP_ENCRYPTION_KEY` without keeping the old key for existing backups.
