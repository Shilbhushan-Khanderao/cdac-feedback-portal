# Getting Started

Step-by-step: run the app locally, then deploy it to a campus server. For the condensed
pre-flight checklist used during an actual cutover, see [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md).
For day-2 operations (logs, backup, rollback, secret rotation) see
[docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md](docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md).

## Part 1 — Run it locally

### 1. Prerequisites

- Node.js 22.x and npm (match the version in `deploy/Dockerfile.server`/`Dockerfile.web`, currently `node:22-alpine`).
- PostgreSQL 16 or 17 installed, with `pg_ctl`, `initdb` and `psql` on your `PATH`.
  - Windows: add `C:\Program Files\PostgreSQL\<version>\bin` to `PATH`.
  - macOS/Linux: these ship with any standard PostgreSQL install (`brew install postgresql@16`, `apt install postgresql-16`, …).
- Git.

Docker is **not** needed for local dev — only for the production deployment in Part 2.

### 2. Clone and install

```bash
git clone <repo-url> cdac-feedback-portal
cd cdac-feedback-portal
npm ci              # installs the root (SPA) and server/ (npm workspace) in one pass
```

If `npm ci` fails with `EUSAGE ... package-lock.json ... out of sync`, see
[Troubleshooting](#npm-ci-fails-with-lockfile-out-of-sync) below before trying anything else.

### 3. Start a local Postgres instance

This project's own dev database lives in `.dev_db/` (gitignored), separate from any other
Postgres instance on your machine, on port 5433 so it won't collide with a default install on 5432.

```bash
npm run db:init     # one-time: initdb -D .dev_db -U postgres -A trust (local dev only — trust auth, no password)
npm run db:start     # pg_ctl start, logs to .dev_db/server.log
```

Check it's up: `psql -h localhost -p 5433 -U postgres -l` should list `postgres`, `template0`, `template1`.

Stop it any time with `npm run db:stop`.

### 4. Configure the server

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:
- `COOKIE_SECRET` — any 32+ character random string (`openssl rand -hex 32`).
- `DATABASE_URL=postgresql://feedback_app:devpass@localhost:5433/cdac_feedback`
- `DATABASE_ADMIN_URL=postgresql://postgres@localhost:5433/cdac_feedback` (no password needed — trust auth)
- `APP_DB_PASSWORD=devpass` (matches the password in `DATABASE_URL` above; the migration runner creates the `feedback_app` role with this password)
- Leave `NODE_ENV=development` (the example default) — this is what enables `/auth/dev-login` so you can sign in without a real Google OAuth client.
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`APP_URL`/`CORS_ORIGIN` can stay blank for local dev; they're only enforced when `NODE_ENV=production`.

Create the database itself (the migration runner doesn't do this part):

```bash
psql -h localhost -p 5433 -U postgres -c "create database cdac_feedback"
```

### 5. Apply migrations and seed data

```bash
npm run migrate      # applies server/src/db/migrations/*.sql, creates the feedback_app role
npm run seed         # DEV-ONLY fake data: refuses to run if NODE_ENV=production
```

`npm run seed` creates the dev-login accounts you'll use next — `admin@test.local`,
`cc@test.local`, `cc.atc@test.local`, and roughly 100 `*.studentNN@test.local` rows, plus
sample sessions and faculty.

### 6. Run it

Two terminals, from the **repo root**:

```bash
npm run server:dev   # Fastify API on http://localhost:3000, auto-reloads on change
```

```bash
npm run dev           # Vite dev server on http://localhost:5173, proxies /api and /auth to :3000
```

Open `http://localhost:5173`. Since `NODE_ENV=development`, the login screen shows a dev-login
dropdown instead of "Sign in with Google" — pick `admin@test.local` or any seeded student/CC
email and you're in, no OAuth setup required.

### 7. Run the tests

```bash
npx tsc -b && npm test         # frontend: typecheck + vitest (8 tests, no DB needed)
npm run server:test             # server: vitest against the DB from step 3 (71 tests)
```

Both also run in CI on every push (`.github/workflows/ci.yml`) against a fresh Postgres 16
service container — if something passes locally but fails in CI, suspect a Postgres version
difference (local 17 vs CI 16) or a config env var only set locally.

### 8. Stopping / resetting

```bash
npm run db:stop
```

To wipe and start over: stop Postgres, delete `.dev_db/`, repeat from step 3.

---

## Part 2 — Deploy to a campus server

This is the detailed walkthrough. For the same steps as a terse checklist to tick off live
during a real cutover, use [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) instead.

### 1. Server prerequisites

- A Linux host (tested on Ubuntu): 4 vCPU / 8 GB RAM / 100 GB SSD to start — confirm with a
  load test (`npm run test:load`) once staging is up, and tune from there.
- Docker Engine + the Compose plugin (`docker compose version` should work).
- A DNS name pointing at this host (e.g. `feedback.cdac.in`), with ports 80 and 443 open to
  the campus network.
- A TLS certificate and private key for that hostname.
- A Google Cloud OAuth 2.0 client (type: Web application), with an authorized redirect URI of
  `https://<your-hostname>/auth/google/callback`. The host needs outbound HTTPS access to
  `accounts.google.com`, `oauth2.googleapis.com` and `www.googleapis.com` — this is the one
  thing that keeps the deployment from being fully air-gapped.

### 2. Get the code onto the host

```bash
git clone <repo-url> /opt/cdac-feedback
cd /opt/cdac-feedback
```

### 3. Configure secrets

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Fill every blank value in `deploy/.env`. Generate each secret separately — do not reuse one
value across `COOKIE_SECRET`, `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` and `BACKUP_ENCRYPTION_KEY`:

```bash
openssl rand -hex 32
```

`docker compose config` refuses to run if any `${VAR:?...}` placeholder in `deploy/docker-compose.yml`
is left empty — that's deliberate, not a bug to work around.

### 4. Install the TLS certificate

```bash
mkdir -p deploy/nginx/certs
cp /path/to/fullchain.pem deploy/nginx/certs/
cp /path/to/privkey.pem deploy/nginx/certs/
```

(This directory is gitignored — certs never get committed.)

### 5. Build and start the stack

```bash
DC="docker compose --env-file deploy/.env -f deploy/docker-compose.yml"
$DC up -d --build
```

This builds the `api` and `web` (nginx) images, starts `db`, runs `migrate` once (it creates
the `feedback_app` role and applies every migration in `server/src/db/migrations/`), then
starts `api` only once `migrate` succeeded, then `nginx`, then `backup`.

```bash
$DC ps
```

Expect `db`, `api`, `nginx` all `healthy`, and `migrate` `Exited (0)`.

### 6. Create the first admin

No seed data loads in production (`npm run seed` refuses to run when `NODE_ENV=production`,
and the production init never mounts `seed.sql`). Create your first real admin directly:

```bash
$DC run --rm api node dist/db/bootstrap-admin.js admin@yourdomain.in "Admin Name"
```

They can now sign in with Google and will land as admin. Use Setup → Staff inside the app to
add CCs and further admins from there.

### 7. Verify

```bash
curl -I http://<host>/                 # expect 301 to https://
curl -I https://<host>/                 # expect HSTS, CSP, X-Frame-Options headers
curl -I https://<host>/favicon.svg      # expect 200, content-type image/svg+xml
curl https://<host>/api/health          # expect {"status":"healthy","database":"connected"}
curl -o /dev/null -w '%{http_code}\n' -X POST https://<host>/auth/dev-login   # expect 404
```

Then in a browser: sign in with Google as the admin you just created, as a CC, and as a
student from your real roster — confirm an email **not** on either roster is rejected.

### 8. Upload the real roster, not test data

Setup → Students (admin) or the Roster page (CC) to upload the real student CSV. Confirm no
test accounts exist:

```bash
$DC exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from student_roster"
```

should be 0 before the real upload, matching your actual cohort size after.

### 9. Backup, then go live

```bash
$DC exec backup /scripts/backup.sh
$DC exec backup ls -l /backups
$DC exec backup /scripts/restore-test.sh /backups/<the file just created>
```

The restore drill should print `PASS` with row counts for every table, including `responses`,
`submissions` and `audit_logs`. Do this before go-live and monthly after.

From here, day-2 operations (logs, TLS renewal, secret rotation, incident response) are in
[docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md](docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md), and the
current security/compliance status is tracked in `docs/vapt/` — see
[docs/vapt/simulation/00-MASTER-REGISTER.md](docs/vapt/simulation/00-MASTER-REGISTER.md) for
what's fixed and what's still open before external VAPT submission.

---

## Troubleshooting

### `npm ci` fails with lockfile "out of sync"

Happened twice during this project's hardening work, both times after `npm install <pkg>` was
run on Windows: Windows npm doesn't record the Linux-only optional native bindings some
packages ship (seen with `rolldown`'s platform binaries). The lockfile then has no entry for
the platform Docker/CI actually run on, and `npm ci` refuses to proceed anywhere that isn't
Windows. Fix: regenerate the lockfile on Linux, not Windows, after adding any dependency —
easiest via Docker even on a Windows dev machine:

```bash
docker run --rm -v "$PWD":/w -w /w node:22-alpine npm install --package-lock-only
```

Then commit the regenerated `package-lock.json`.

### `npm install`/`npm ci` prints an `EBADENGINE` warning about `react-router` wanting Node `>=22.22.0`

Non-fatal — npm installs anyway unless something has set `engine-strict`. Known, harmless with
the Node versions this project currently uses; upgrade Node if it starts mattering.

### `/auth/dev-login` returns 404 locally

`NODE_ENV` in `server/.env` isn't `development` (or `test`). It must **not** be `production`
for local dev — that's the flag that disables dev-login.

### Port already in use (5433, 3000, or 5173)

Another process is already bound to it. Either stop it, or override: Postgres port is set in
the `db:start`/`db:stop` scripts in `package.json`; the API port via `PORT` in `server/.env`;
the Vite port via `vite.config.ts`'s `server.port` (and its `/api`/`/auth` proxy target must
then match the API's actual port).

### Server tests fail with odd audit-log/count mismatches, but pass when run alone

Two test runs (or a test run and a dev server) hitting the same local database at the same
time will corrupt count-based assertions in `consent-and-audit.test.ts` — it's asserting on
`audit_logs` row counts, which another concurrent process can add to mid-test. Not a real bug;
just don't run `npm run server:test` twice in parallel against the same `.dev_db`.

### `docker compose config` / `up` fails on a missing `${VAR:?...}`

Expected — `deploy/docker-compose.yml` refuses to start with an unset secret rather than
silently falling back to an insecure default. Fill the named variable in `deploy/.env`.

### `/favicon.svg` or other `public/` files 404 or serve the wrong content in the Docker build

`deploy/Dockerfile.web` must `COPY public/ ./public/` before `RUN npm run build` — Vite's
`public/` directory isn't picked up automatically inside the build container the way it is
when building locally. This was a real bug caught by an end-to-end smoke test, not by `npm run build` alone — if you add new files under `public/` and they don't show up after a
container rebuild, check that line is still there.
