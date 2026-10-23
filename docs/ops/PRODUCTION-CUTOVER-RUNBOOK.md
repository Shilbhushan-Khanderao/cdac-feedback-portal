# Production Runbook

Day-2 operations. First-time setup is in [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md).

`DC="docker compose --env-file deploy/.env -f deploy/docker-compose.yml"`, run from repo root. Hostname placeholder: `feedback.example.in`.

## Services
| Service | Role | Notes |
|---|---|---|
| db | Postgres 16, volume `pgdata` | owner user = `POSTGRES_USER` |
| migrate | one-shot `node dist/db/migrate.js` | uses `DATABASE_ADMIN_URL`; creates/updates role `feedback_app` |
| api | Fastify, :3000 internal | connects as `feedback_app` via `DATABASE_URL` |
| nginx | TLS :443, redirect :80, SPA | certs from `deploy/nginx/certs/` |
| backup | cron 02:00 UTC, volume `backups_data` | off-host copy by `deploy/offsite-copy.sh` (host cron) |

Logs: `$DC logs -f api`. Containers log to the host journal (`journald` driver), so logs survive container recreation. `deploy/offsite-copy.sh` (host cron, daily 08:00) exports each finished day's logs, encrypted, plus new DB backups to `/mnt/shared/cdac-feedback/{logs,db}` and keeps 180 days there. Its output goes to `~/cdac-offsite-copy.log`; check it after go-live.

Audit log review (sign-ins, failed sign-ins, access denied, report views and downloads, admin changes):

```bash
$DC exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select logged_at, actor_email, action, entity_type, entity_id, ip_address from audit_logs where logged_at > now() - interval '"'"'7 days'"'"' order by logged_at desc"'
```

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
Replace `fullchain.pem` / `privkey.pem` in `deploy/nginx/certs/`, re-run the key ownership fix (nginx cannot read a user-owned 600 key):

```bash
docker run --rm -v "$PWD/deploy/nginx/certs:/c" --entrypoint sh nginx:1.27-alpine \
  -c "chown 0:$(id -g) /c/privkey.pem && chmod 640 /c/privkey.pem"
```

then `$DC restart nginx`. For a self-signed certificate, clients must trust the new one (guide step 10).
Changing the hostname requires `$DC up -d --build nginx` (the name is baked in at build).

## Backup and restore
- Daily encrypted dump (AES-256, key `BACKUP_ENCRYPTION_KEY`) to volume `backups_data`, 180-day retention. `deploy/offsite-copy.sh` (host cron, 08:00) copies new dumps to `/mnt/shared/cdac-feedback/db/`, also kept 180 days. The container's own `BACKUP_OFFSITE_TARGET` (rsync over ssh) stays unset; its warning is expected.
- Restoring from the share: copy the `.enc` and `.enc.hmac` pair back into the volume, e.g. `docker cp <file> cdac-feedback-backup-1:/backups/` (both files), then run the drill or the real restore below.
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
- Alternative off-host target over ssh (only if the share is unavailable): add under the `backup` service `volumes: ["./offsite_key:/run/offsite_key:ro"]` and set `BACKUP_OFFSITE_TARGET`.

## Monitoring
- Container health: `$DC ps`. Probe `https://feedback.example.in/api/health` from an external cron/uptime tool and alert the owner. No metrics stack is shipped (target).
- Disk: watch `pgdata` and `backups_data` volumes.
- Off-host copy: `tail ~/cdac-offsite-copy.log` should show a `[offsite] done` from today; `ls /mnt/shared/cdac-feedback/logs` should have yesterday's file.
- Audit review: run the audit-log query above at least weekly; look for bursts of `LOGIN_FAILED` or `AUTHZ_DENIED`.

## Capacity
Start at 4 vCPU / 8 GB. Tune API pool and Postgres `max_connections` from load-test results (`npm run test:load`). Two-layer rate limiting, both sized for a campus NAT (many students behind one IP):
- nginx is a coarse per-IP backstop only — it can't verify the signed session cookie, so it's keyed on IP: `/api` 1500 req/min (burst 100), `/auth` 1200 req/min (burst 300).
- Fastify (`apps/api/src/app.ts`) does the real fine-grained limiting: it verifies the cookie's signature first, then keys on the session (240 req/min) or falls back to IP (1500 req/min) for unsigned/missing cookies.

## Secrets rotation
Edit `deploy/.env`, `$DC up -d`. Rotating `COOKIE_SECRET` logs everyone out. Rotating `APP_DB_PASSWORD` is applied by `migrate` on the next `up`. Do not rotate `BACKUP_ENCRYPTION_KEY` without keeping the old key for existing backups.
