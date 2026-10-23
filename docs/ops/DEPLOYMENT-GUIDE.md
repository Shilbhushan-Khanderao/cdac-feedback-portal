# Deployment guide

How to deploy the portal on one on-premise Linux host with Docker Compose, from an empty
server to a working site that campus clients can sign in to. The same steps cover a LAN
staging host and production; only the hostname and the certificate source differ.

Placeholders used below: `feedback.example.in` (the site hostname), `<server-ip>` (the host's
LAN address), `/mnt/shared` (the network share the host mounts for off-host copies). Keep the
real values for your site out of this repository: it is public.

Run every command from the repository root. Define this once per shell:

```bash
DC="docker compose --env-file deploy/.env -f deploy/docker-compose.yml"
```

Contents:

1. [What gets deployed](#1-what-gets-deployed)
2. [Host prerequisites](#2-host-prerequisites)
3. [Hostname and DNS](#3-hostname-and-dns)
4. [Google sign-in (OAuth client)](#4-google-sign-in-oauth-client)
5. [TLS certificate](#5-tls-certificate)
6. [Configure `deploy/.env`](#6-configure-deployenv)
7. [Build and start](#7-build-and-start)
8. [Verify](#8-verify)
9. [First admin](#9-first-admin)
10. [Prepare client machines](#10-prepare-client-machines)
11. [Logs and off-host copies](#11-logs-and-off-host-copies)
12. [Backup drill](#12-backup-drill)
13. [Updating a running deployment](#13-updating-a-running-deployment)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What gets deployed

```
client browser --443--> nginx (TLS, SPA, rate limits) --> api (Fastify :3000) --> db (Postgres 16)
                                                          migrate (one-shot)      backup (cron, encrypted dumps)
```

| Service | What it does | Data |
|---|---|---|
| `db` | PostgreSQL 16 | volume `cdac-feedback_pgdata` |
| `migrate` | Applies schema migrations as the DB owner, creates the runtime role `feedback_app`, then exits | none |
| `api` | Fastify API, connects as `feedback_app` (row-level security enforced) | none |
| `nginx` | TLS on 443, redirect on 80, serves the built SPA, proxies `/api` and `/auth` | certs from `deploy/nginx/certs/` |
| `backup` | Encrypted `pg_dump` daily at 02:00 UTC, 180-day retention | volume `cdac-feedback_backups_data` |

Only nginx publishes ports (80 and 443). The database is reachable only on the internal
Docker network. All containers log to the host's systemd journal.

Sign-in is Google OAuth only. There is no password login in a deployed stack:
`/auth/dev-login` exists only when `NODE_ENV` is not `production`, and the compose file runs
production. Do not set `NODE_ENV=development` to get around sign-in problems: it also turns off
the Secure cookie flag and the production config checks.

## 2. Host prerequisites

- Linux host, 4 vCPU / 8 GB RAM / 100 GB disk as a starting point.
- Docker Engine with the Compose v2 plugin (`docker compose version`).
- The deploying user is in the `docker` group, and in `adm` so it can read the system journal
  (`groups` to check). The log export in step 11 needs both.
- Ports 80 and 443 free on the host. Check before starting:
  ```bash
  ss -ltn | grep -E ':(80|443)\s' || echo "80/443 free"
  ```
- Clock synced by NTP (`timedatectl` shows `System clock synchronized: yes`). CERT-In requires
  the time source to be NPL or NIC, or traceable to them. Get a written line from IT naming the
  host's NTP servers and their upstream, and keep it with the audit evidence.
- Outbound HTTPS from the host to Google: `accounts.google.com`, `oauth2.googleapis.com`,
  `www.googleapis.com`.
- Node.js is **not** needed on the host. Images build inside Docker.

**Shared hosts:** if other teams run containers on the same host, never run
`docker system prune`, `docker volume prune` or `docker image prune -a`. They delete other
teams' data too. Remove only this project's objects by name.

## 3. Hostname and DNS

Google rejects bare IP addresses as sign-in redirect targets, so the site needs a hostname.
`APP_URL` must be `https://` because production config refuses anything else. Google sends
users back to `${APP_URL}/auth/google/callback`.

Pick a name under a real public domain the organisation owns, for example
`feedback.example.in`. The name itself only needs to resolve on the LAN.

Get the name resolving to `<server-ip>`:

- **Preferred:** ask IT for an internal DNS A record `feedback.example.in -> <server-ip>`.
- **Until that exists:** add a hosts-file entry on each client (step 10). This is fine for a
  small test group, not for go-live.

Check from the server:

```bash
getent hosts feedback.example.in
```

## 4. Google sign-in (OAuth client)

In [Google Cloud Console](https://console.cloud.google.com/), in a project owned by an
organisation account (not a personal one, so access survives staff changes):

1. **APIs & Services → OAuth consent screen.**
   - User type: **External** if students sign in with personal Gmail accounts; **Internal** only
     if every user is in the organisation's Google Workspace.
   - App name, support email, developer contact: fill in.
   - Scopes: the app asks only for `openid`, `email` and `profile`. These need no Google
     verification.
   - Publishing status: while it is **Testing**, only the listed test users can sign in
     (maximum 100). Add your testers there, or click **Publish app** before students use it.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
   - Application type: **Web application**.
   - Authorised JavaScript origins: `https://feedback.example.in`
   - Authorised redirect URIs: `https://feedback.example.in/auth/google/callback`
3. Copy the **Client ID** and **Client secret** straight into `deploy/.env` (step 6). Do not
   send them by chat or email.

The redirect URI must match `APP_URL` exactly: same scheme, same host, no trailing slash.

## 5. TLS certificate

nginx reads `deploy/nginx/certs/fullchain.pem` and `deploy/nginx/certs/privkey.pem`. The folder
is git-ignored. The certificate's subject alternative name (SAN) must contain the exact
hostname.

**Option A: certificate from the organisation's CA (preferred).** Generate a key and a signing
request, give the CSR to IT, and save what they return as `fullchain.pem` (server certificate
first, then any intermediates):

```bash
openssl req -new -newkey rsa:2048 -nodes \
  -keyout deploy/nginx/certs/privkey.pem -out deploy/nginx/certs/feedback.csr \
  -subj "/CN=feedback.example.in" -addext "subjectAltName=DNS:feedback.example.in"
```

**Option B: self-signed (staging, or while waiting for IT).** Each client must then trust the
certificate (step 10):

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 90 \
  -keyout deploy/nginx/certs/privkey.pem -out deploy/nginx/certs/fullchain.pem \
  -subj "/CN=feedback.example.in" -addext "subjectAltName=DNS:feedback.example.in"
```

**Then, for either option, fix the key's ownership.** nginx runs as root inside the container
with every Linux capability dropped, so it cannot read a key owned by your user with mode 600
(the symptom is `Permission denied` on `privkey.pem` and nginx restarting in a loop). Make root
the owner and keep your group able to read it:

```bash
docker run --rm -v "$PWD/deploy/nginx/certs:/c" --entrypoint sh nginx:1.27-alpine \
  -c "chown 0:$(id -g) /c/privkey.pem && chmod 640 /c/privkey.pem"
```

Repeat this every time the key file is replaced.

Check what you installed:

```bash
openssl x509 -in deploy/nginx/certs/fullchain.pem -noout -subject -enddate -ext subjectAltName
openssl x509 -in deploy/nginx/certs/fullchain.pem -noout -fingerprint -sha256
```

Keep the SHA-256 fingerprint: clients use it to check that they got the right file.

## 6. Configure `deploy/.env`

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

| Variable | Value |
|---|---|
| `SERVER_NAME` | `feedback.example.in`, baked into the nginx image at build time |
| `APP_URL` | `https://feedback.example.in` |
| `CORS_ORIGIN` | `https://feedback.example.in`, exactly the origin of `APP_URL` |
| `POSTGRES_USER`, `POSTGRES_DB` | keep the defaults unless you have a reason |
| `POSTGRES_PASSWORD` | new secret |
| `APP_DB_PASSWORD` | new secret (runtime role `feedback_app`) |
| `COOKIE_SECRET` | new secret, at least 32 characters |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from step 4 |
| `BACKUP_ENCRYPTION_KEY` | new secret; encrypts DB backups and exported logs |
| `NODE_ENV` | `production` (never change) |

Generate each secret separately; never reuse one value for two variables:

```bash
openssl rand -hex 32
```

Every required value uses `${VAR:?}` in `deploy/docker-compose.yml`, so compose refuses to start
while any is blank. That is deliberate.

**Store `BACKUP_ENCRYPTION_KEY` somewhere off this server** (for example the organisation's
password manager). Without it, no backup or exported log can be decrypted, including after a
total loss of this host.

## 7. Build and start

```bash
$DC up -d --build
$DC ps -a
```

Order: `db` becomes healthy, `migrate` runs once and exits 0, then `api` starts and becomes
healthy, then `nginx`, then `backup`. The first build takes a few minutes.

Expected `$DC ps -a`:

```
db        Up (healthy)
migrate   Exited (0)
api       Up (healthy)
nginx     Up (healthy)
backup    Up
```

Open ports 80 and 443 in any firewall between the clients and the host.

## 8. Verify

These use `--resolve` so they work before DNS is in place. `-k` skips certificate checks for
a self-signed certificate.

```bash
H=feedback.example.in; R="--resolve $H:443:127.0.0.1 --resolve $H:80:127.0.0.1"
curl -sI $R http://$H/ | grep -i '^location'                    # https://feedback.example.in/
curl -skI $R https://$H/ | grep -iE 'strict-transport|content-security|x-frame'
curl -sk $R https://$H/api/health                                # {"status":"healthy","database":"connected"}
curl -sk $R -o /dev/null -w '%{http_code}\n' -X POST https://$H/auth/dev-login   # 404
curl -sk $R -o /dev/null -w '%{http_code} %{redirect_url}\n' https://$H/auth/google
#   302 to accounts.google.com, with redirect_uri=https%3A%2F%2Ffeedback.example.in%2Fauth%2Fgoogle%2Fcallback
```

Confirm no seed or test data is in the database:

```bash
$DC exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from student_roster"'
```

It must print `0` before the real roster is uploaded.

## 9. First admin

Nobody can sign in until someone is on the staff roster. Create the first admin with the
Google account they will sign in with. Run it through the `migrate` service: it is the only
service with the database owner's connection (`DATABASE_ADMIN_URL`).

```bash
$DC run --rm migrate node dist/db/bootstrap-admin.js admin@example.in "Admin Name"
```

It prints `[bootstrap-admin] Admin ready.` and writes an `ADMIN_BOOTSTRAP` audit row. Running
it again for the same email updates the name and keeps the admin role.

The admin then signs in and, under **Setup**, adds centres, courses, batches, modules, staff
(CCs and other admins) and student rosters. A CC with an empty course covers every course at
their centre.

## 10. Prepare client machines

Skip a part when its condition does not apply.

### Hosts-file entry (only until the DNS record exists)

Add one line, with admin rights:

```
<server-ip> feedback.example.in
```

- **Windows:** open Notepad as Administrator, edit
  `C:\Windows\System32\drivers\etc\hosts`, save, then run `ipconfig /flushdns`.
- **Linux:** `echo "<server-ip> feedback.example.in" | sudo tee -a /etc/hosts`
- **macOS:** the same command, then
  `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`

Check with `ping feedback.example.in`: the reply must show `<server-ip>`. Ping replies may time
out; only the address matters. Remove the line once IT's DNS record is live.

### Trust the certificate (only for a self-signed certificate)

Copy only `fullchain.pem` to the client. **Never copy `privkey.pem`.** Anyone holding the key
can impersonate the site to every client that trusts this certificate.

Check the fingerprint against the one from step 5:

```bash
openssl x509 -in fullchain.pem -noout -fingerprint -sha256
```

Then trust it:

- **Windows** (Edge, Chrome), in an Administrator command prompt:
  `certutil -addstore -f Root fullchain.pem`
- **macOS** (Safari, Chrome):
  `sudo security add-trusted-cert -d -r trustAsRoot -k /Library/Keychains/System.keychain fullchain.pem`
- **Linux** (Chrome uses its own NSS store), as each user who runs Chrome:
  ```bash
  sudo apt install libnss3-tools
  certutil -d sql:$HOME/.pki/nssdb -A -t "P,," -n feedback-portal -i fullchain.pem
  ```
- **Firefox** (any OS) keeps its own store and will not import this certificate as an
  authority. Open the site and choose **Advanced → Accept the Risk and Continue**; Firefox
  stores a permanent exception.

Restart the browser and open `https://feedback.example.in`. It must load with a padlock and no
warning. Remove this trust once a CA-issued certificate replaces the self-signed one.

## 11. Logs and off-host copies

Where things are kept:

| What | Where | Kept for |
|---|---|---|
| Container logs (nginx access log, API log, Postgres, backup) | host systemd journal (`journald` log driver); survives container recreation | until the host journal's size cap rotates them out |
| Same logs, one encrypted file per day | `/mnt/shared/cdac-feedback/logs/` | 180 days |
| Application audit events (sign-ins, failed sign-ins, access denied, report views and downloads, admin changes) | `audit_logs` table, append-only | 2 years by default (`retention-purge.ts`), and in every DB backup |
| Encrypted DB backups | volume `cdac-feedback_backups_data` and `/mnt/shared/cdac-feedback/db/` | 180 days |

Read live logs:

```bash
$DC logs -f api nginx
journalctl CONTAINER_NAME=cdac-feedback-nginx-1 --since today
```

### Set up the daily off-host copy

`deploy/offsite-copy.sh` runs once a day on the host. It:

1. exports each finished day's container logs from the journal, compresses them and encrypts
   them with `BACKUP_ENCRYPTION_KEY` (the same encrypt-then-MAC method as DB backups);
2. copies new DB backups from the backup volume;
3. deletes files on the share older than 180 days.

If the share was unreachable, it catches up on up to 7 missed days, as long as the journal still
holds them. Everything written to the share is encrypted, so the share may be one that other
teams can read.

Requirements: the share is mounted (normally by IT, through `/etc/fstab` or autofs) and the
deploying user can write to it. Then:

```bash
deploy/offsite-copy.sh                       # first run by hand; must end with "[offsite] done"
ls -l /mnt/shared/cdac-feedback/logs /mnt/shared/cdac-feedback/db
```

Install the daily job in the deploying user's crontab (08:00 local time, after the 02:00 UTC
backup):

```bash
line="0 8 * * * $PWD/deploy/offsite-copy.sh >> $HOME/cdac-offsite-copy.log 2>&1"
(crontab -l 2>/dev/null | grep -v 'deploy/offsite-copy.sh'; echo "$line") | crontab -
crontab -l
```

Check `~/cdac-offsite-copy.log` the next day. Each run ends with `[offsite] done <time>`.
To use a folder other than `/mnt/shared/cdac-feedback`, put `OFFSITE_DIR=/other/path` before
the script path in the crontab line.

The backup container prints `BACKUP_OFFSITE_TARGET unset`. That is expected: the host script
does the off-host copy, so the container's own rsync-over-ssh option stays unused.

**Known limit:** the host journal has a size cap shared by everything on the host. This app
writes roughly 60 MB of logs a day, so a daily export is enough, but a log flood from another
application could rotate entries out before 08:00. Sending logs in real time to a central log
server (SIEM) closes that gap if the organisation has one.

### Read an exported log file

```bash
export BACKUP_ENCRYPTION_KEY=$(sed -n 's/^BACKUP_ENCRYPTION_KEY=//p' deploy/.env)
F=/mnt/shared/cdac-feedback/logs/cdac-feedback_logs_2026-01-31.log.gz.enc
MAC_KEY=$(printf '%s:hmac' "$BACKUP_ENCRYPTION_KEY" | openssl dgst -sha256 | sed 's/^.*= //')
[ "$(openssl dgst -sha256 -hmac "$MAC_KEY" "$F" | sed 's/^.*= //')" = "$(cat "$F.hmac")" ] && echo "integrity OK"
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in "$F" | gunzip | less
```

### Review the audit log

```bash
$DC exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select logged_at, actor_email, action, entity_type, entity_id, ip_address from audit_logs where logged_at > now() - interval '"'"'7 days'"'"' order by logged_at desc"'
```

Actions you will see: `LOGIN`, `LOGOUT`, `LOGIN_FAILED` (with a reason), `AUTHZ_DENIED`,
`REPORT_VIEW`, `REPORT_DOWNLOAD`, `BULK_READ`, `SESSION_CREATE`, `SESSION_SCHEDULE_UPDATE`,
`SESSION_FACULTY_UPDATE`, `SESSION_DELETE`, `TABLE_CREATE`, `TABLE_UPDATE`, `TABLE_DELETE`,
`ROSTER_UPLOAD` (student emails masked), `FACULTY_CREATE`, `ADMIN_BOOTSTRAP`.

## 12. Backup drill

Do this before go-live and monthly after:

```bash
$DC exec backup /scripts/backup.sh
$DC exec backup ls -l /backups
$DC exec backup /scripts/restore-test.sh /backups/<file just created>.sql.gz.enc
```

The drill restores into a scratch database and must print `PASS` with row counts for every
table, including `responses`, `submissions` and `audit_logs`. A real restore is described in
[PRODUCTION-CUTOVER-RUNBOOK.md](PRODUCTION-CUTOVER-RUNBOOK.md#backup-and-restore).

## 13. Updating a running deployment

```bash
git pull
$DC up -d --build
$DC ps -a
```

`migrate` runs again and applies only new migrations. Logs are kept across the recreation
because they live in the journal.

To change the hostname: update `SERVER_NAME`, `APP_URL` and `CORS_ORIGIN`, replace the
certificate (step 5), add the new URIs to the Google OAuth client (step 4), then
`$DC up -d --build`.

Rollback: `git checkout <previous tag>` and `$DC up -d --build`. Migrations only go forward;
undoing a bad one means restoring from backup.

## 14. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `docker compose` fails with `set GOOGLE_CLIENT_ID in deploy/.env` (or another variable) | a required value is blank | fill it in `deploy/.env` |
| nginx keeps restarting; `$DC logs nginx` shows `cannot load certificate key ... Permission denied` | key owned by your user with mode 600 | run the ownership fix in step 5, then `$DC restart nginx` |
| `bootstrap-admin` prints `DATABASE_ADMIN_URL is required` | it was run through the `api` service | run it through `migrate` (step 9) |
| Browser shows `DNS_PROBE_FINISHED_NXDOMAIN` | the client cannot resolve the hostname | add the hosts entry (step 10); in Chrome also clear `chrome://net-internals/#dns` |
| Browser warns `NET::ERR_CERT_AUTHORITY_INVALID` | self-signed certificate not trusted on that client | trust it (step 10) |
| Google shows `Error 400: redirect_uri_mismatch` | redirect URI in the OAuth client differs from `APP_URL` | make it exactly `https://feedback.example.in/auth/google/callback` |
| Google shows `Access blocked: ... has not completed the Google verification process` | consent screen is in Testing and the user is not a test user | add them as a test user, or publish the app (step 4) |
| After Google, the portal says `Your email is not on the feedback roster` | the account is on neither roster | add them under Setup (staff) or in a roster upload (students) |
| `migrate` exited non-zero and `api` never starts | migration error | `$DC logs migrate` |
| `~/cdac-offsite-copy.log` shows `not writable` | share not mounted, or no write access | ask IT to remount; the next run catches up on up to 7 days |
