# Deployment Checklist

Hostname placeholder: `feedback.example.in`. Compose file: `deploy/docker-compose.yml`. All commands from repo root; define once:
`DC="docker compose --env-file deploy/.env -f deploy/docker-compose.yml"`

## Before first deploy
- [ ] Host: 4 vCPU / 8 GB RAM / 100 GB SSD (confirm with load test), Docker + compose plugin, NTP synced.
- [ ] DNS for the hostname points to the host; ports 80/443 open to campus.
- [ ] TLS cert + key placed as `deploy/nginx/certs/fullchain.pem` and `deploy/nginx/certs/privkey.pem` (gitignored).
- [ ] Google OAuth client created; redirect URI = `${APP_URL}/auth/google/callback` (confirm exact path in `server/src/auth/routes.ts`); host can reach Google endpoints.
- [ ] `cp deploy/.env.example deploy/.env`; fill every value (`openssl rand -hex 32` for secrets). `docker compose config` fails if any is missing.
- [ ] Offsite backup target decided (`BACKUP_OFFSITE_TARGET`) and ssh key mounted into the backup service.

## Deploy
- [ ] `$DC up -d --build` (builds API + SPA/nginx; `migrate` runs once before `api`).
- [ ] `$DC ps`: db, api, nginx healthy; `migrate` exited 0.
- [ ] Bootstrap first admin: `$DC run --rm api node dist/db/bootstrap-admin.js <email> "<name>"`.
- [ ] No seed data loaded: `$DC exec db psql -U $POSTGRES_USER $POSTGRES_DB -c "select count(*) from student_roster"` is 0 before real roster upload.

## Verify
- [ ] `curl -I http://HOST/` returns 301 to `https://feedback.example.in/`.
- [ ] `curl -I https://HOST/` shows HSTS, CSP, X-Frame-Options; `/assets/*.js` is `immutable`; `index.html` is `no-cache`.
- [ ] `https://HOST/api/health` returns `{"status":"healthy"}`.
- [ ] `/auth/dev-login` returns 404.
- [ ] Google sign-in works for admin, a CC and a student; an unlisted email is rejected.
- [ ] A CC from centre A cannot see centre B sessions or students.
- [ ] Staff cannot read raw `responses`; reports need a closed session with at least 3 submissions.
- [ ] Backup: `$DC exec backup /scripts/backup.sh`, then `$DC exec backup /scripts/restore-test.sh /backups/<file>` prints PASS with counts for all tables.
- [ ] Load test through nginx (`tests/load/`) meets target (p95 under 1s, 0 errors at 1500 virtual users).

## Go-live
- [ ] Real roster uploaded; test accounts absent.
- [ ] VAPT findings High/Critical closed, or residual risk signed off in writing.
- [ ] Incident contact and backup owner named in `docs/vapt/INCIDENT-RESPONSE.md`.
