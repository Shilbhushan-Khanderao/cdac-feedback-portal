# LAN test deployment

Run the full Docker stack on one LAN host for testing. Same stack as production; only the hostname and certificate differ. Run every command from the repo root.

`DC="docker compose --env-file deploy/.env -f deploy/docker-compose.yml"`

## 1. Hostname (decide first)

Sign-in is Google OAuth only. The compose stack runs with `NODE_ENV=production`, which requires `APP_URL` to start with `https://` (`apps/api/src/config.ts`). The redirect URI sent to Google is `${APP_URL}/auth/google/callback` (`apps/api/src/modules/auth/oauth.ts`).

Pick one:

- **A real domain name that resolves to the LAN host** (split DNS or hosts-file entries on the test clients). Register `https://<name>/auth/google/callback` in the Google OAuth client. Google generally rejects bare IPs and private suffixes such as `.local` as redirect URIs; confirm in the Google console before relying on one.
- **`localhost` on the server machine only.** `APP_URL` must still be `https://localhost` with a self-signed certificate. Google documents `localhost` redirects as allowed, but check that it accepts the `https://localhost` form in your OAuth client (unverified here). Other LAN machines cannot sign in this way.

There is no working password login in this stack. `/auth/dev-login` exists only when `NODE_ENV` is not `production`, and the SPA shows its form only in a Vite dev build (`import.meta.env.DEV` in `apps/web/src/app/auth.tsx`), never in the Docker image. Setting `NODE_ENV=development` in `deploy/.env` therefore does not give a login screen. It also turns off the Secure cookie flag and the production config checks. Do not use it.

## 2. TLS certificate

nginx needs `deploy/nginx/certs/fullchain.pem` and `deploy/nginx/certs/privkey.pem` (mounted read-only; the folder only holds `.gitkeep` and is git-ignored). Use an internal-CA or self-signed certificate whose subject alternative name (SAN) contains the exact hostname from step 1. Import the CA (or the certificate) into each test client's trust store, otherwise browsers warn and the Secure session cookie flow is unreliable.

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 90 \
  -keyout deploy/nginx/certs/privkey.pem -out deploy/nginx/certs/fullchain.pem \
  -subj "/CN=feedback.lan.example" -addext "subjectAltName=DNS:feedback.lan.example"
```

nginx runs as root with every capability dropped, so it cannot read a key owned by your user with mode 600 (`Permission denied` on `privkey.pem`). Give root ownership, keeping your group able to read it:

```bash
docker run --rm -v "$PWD/deploy/nginx/certs:/c" --entrypoint sh nginx:1.27-alpine \
  -c "chown 0:$(id -g) /c/privkey.pem && chmod 640 /c/privkey.pem"
```

## 3. Configure `deploy/.env`

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Every secret is mandatory (`${VAR:?}` in `deploy/docker-compose.yml`); compose refuses to start with a blank one:
`POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `COOKIE_SECRET` (32+ chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BACKUP_ENCRYPTION_KEY`. Generate each separately with `openssl rand -hex 32`.

Set the three hostname values consistently:

```
SERVER_NAME=feedback.lan.example
APP_URL=https://feedback.lan.example
CORS_ORIGIN=https://feedback.lan.example
```

- `CORS_ORIGIN` must equal the origin of `APP_URL` exactly (exact string compare in `apps/api/src/app.ts`).
- `SERVER_NAME` is baked into the nginx image at build time (port-80 redirect target). Changing it needs `$DC up -d --build nginx`.

## 4. Start

```bash
$DC up -d --build
$DC ps
curl -k https://<hostname>/healthz
```

`migrate` runs first and `api` starts only after it succeeds. Open ports 80 and 443 on the host firewall for the LAN.

## 5. First admin

Nobody can sign in until someone is on `staff_roster`. The Google account must be the one used to sign in:

```bash
$DC run --rm migrate node dist/db/bootstrap-admin.js admin@example.in "Admin Name"
```

The admin then adds centres, courses, batches, CCs and student rosters in the UI.

## Test data

Do not load `seed.sql` or run `seed` against this stack's database. It is dev-only fake data and the seed script refuses `NODE_ENV=production`. Create test students through the roster upload instead.

## Also see

[PRODUCTION-CUTOVER-RUNBOOK.md](PRODUCTION-CUTOVER-RUNBOOK.md) for logs, backups, restore and TLS renewal; [../../DEPLOYMENT-CHECKLIST.md](../../DEPLOYMENT-CHECKLIST.md).
