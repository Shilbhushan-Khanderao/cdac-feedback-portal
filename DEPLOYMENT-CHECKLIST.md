# Deployment Checklist

Tick-list for a live cutover. Each item is explained step by step in
[docs/ops/DEPLOYMENT-GUIDE.md](docs/ops/DEPLOYMENT-GUIDE.md).

Hostname placeholder: `feedback.example.in`. Compose file: `deploy/docker-compose.yml`. All commands from repo root; define once:
`DC="docker compose --env-file deploy/.env -f deploy/docker-compose.yml"`

## Before first deploy
- [ ] Host: 4 vCPU / 8 GB RAM / 100 GB SSD (confirm with load test), Docker + compose plugin, NTP synced. Deploying user in the `docker` and `adm` groups.
- [ ] Ports 80/443 free on the host (`ss -ltn`) and open to campus.
- [ ] DNS A record for the hostname points to the host (hosts-file entries on clients are for testing only).
- [ ] TLS cert + key placed as `deploy/nginx/certs/fullchain.pem` and `deploy/nginx/certs/privkey.pem` (gitignored); SAN contains the hostname; key chowned to root with group read (guide step 5).
- [ ] Google OAuth client created: JavaScript origin `${APP_URL}`, redirect URI `${APP_URL}/auth/google/callback`. Consent screen published, or every tester listed as a test user. Host can reach Google endpoints.
- [ ] `cp deploy/.env.example deploy/.env`; `chmod 600`; fill every value (`openssl rand -hex 32` for secrets). `docker compose config` fails if any is missing.
- [ ] `BACKUP_ENCRYPTION_KEY` stored somewhere off this host.
- [ ] Network share mounted and writable by the deploying user for `deploy/offsite-copy.sh`.
- [ ] (Recommended, not required) DBA grants a least-privilege backup role so `pg_dump` stops running as the superuser: see the `BACKUP_DB_ROLE` comment in `deploy/.env.example` for the exact `GRANT`. Until this is done, backups keep running as `POSTGRES_USER` — nothing breaks either way.

## Deploy
- [ ] `$DC up -d --build` (builds API + SPA/nginx; `migrate` runs once before `api`).
- [ ] `$DC ps`: db, api, nginx healthy; `migrate` exited 0.
- [ ] Bootstrap first admin: `$DC run --rm migrate node dist/db/bootstrap-admin.js <email> "<name>"`.
- [ ] No seed data loaded: `$DC exec db psql -U $POSTGRES_USER $POSTGRES_DB -c "select count(*) from student_roster"` is 0 before real roster upload.

## Verify
- [ ] `curl -I http://HOST/` returns 301 to `https://feedback.example.in/`.
- [ ] `curl -I https://HOST/` shows HSTS, CSP, X-Frame-Options; `/assets/*.js` is `immutable`; `index.html` is `no-store` (not `no-cache` — a Back after logout must not replay an authenticated page).
- [ ] `curl -I https://HOST/favicon.svg` returns `200 image/svg+xml` (confirms `deploy/Dockerfile.web` copied `public/` into the build — it silently served the SPA shell here until that was fixed).
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
- [ ] Incident contact and backup owner named in `docs/security/INCIDENT-RESPONSE.md`.

## Accepted risk (single-host Compose, no secrets manager)
This deployment is one Docker Compose stack on one host. Two VAPT findings are
architecturally out of scope for that shape and are accepted as-is rather than solved with
machinery nobody asked for:

- **INF-6 (secrets as plain env vars)** — `COOKIE_SECRET`, `DATABASE_URL`, `POSTGRES_PASSWORD`,
  `BACKUP_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` are visible via `docker inspect` and
  `/proc/1/environ` to anyone who already has host root or `docker` group membership. Docker
  Compose has no secrets store of its own (`secrets:` in the plain `docker-compose.yml` file
  format still writes to a tmpfs file readable the same way, not an actual vault) — real secret
  isolation needs Swarm or Kubernetes secrets, or an external vault (HashiCorp Vault, cloud KMS),
  none of which this single-host setup has a reason to run otherwise. Mitigation already in
  place: `deploy/.env` is git-ignored and should be `chmod 600`; keep the `docker` group tight on
  the host; `migrate` only receives the env vars it needs.
- **INF-10 (Postgres: no TLS, open `pg_hba` on the compose subnet)** — `db` is reachable only
  from containers on `internal_net` (not published to the host or LAN), so this is encryption
  *within* one physical/VM host's loopback-equivalent bridge network, not over a real wire. Adding
  TLS between `api` and `db` here is cert/rotation machinery to protect a hop that never leaves
  the host. Revisit if the shape changes: multi-host (db not co-located with api/nginx) or
  orchestrated (Swarm/K8s, where secrets and mTLS come close to free) both change this calculus.

## Logging and retention
Containers log to the host journal (`journald` driver in `docker-compose.yml`), so a redeploy no
longer deletes logs. `deploy/offsite-copy.sh`, run daily from the operator's crontab, exports each
finished day's container logs (encrypt-then-MAC, same key as DB backups) and copies new DB backups
to the shared drive, keeping 180 days there (CERT-In). It catches up to 7 missed days if the share
was down, as long as the host journal still holds them. The journal itself is capped by the host's
journald config, so a log flood from another app on this shared host could rotate entries out
before the daily export; real-time shipping to a SIEM would close that if one becomes available.
Application audit events live in `audit_logs` (append-only, in every DB backup).
- [ ] Crontab has the `offsite-copy.sh` entry; `~/cdac-offsite-copy.log` shows a recent `[offsite] done`.
- [ ] Written confirmation from IT that the host's NTP sources trace to NPL or NIC (CERT-In).
