# VAPT Simulation 04 - Infrastructure and Configuration

Scope: local staging stack (compose project `cdac-feedback`), localhost:8443/8080 and its 4 containers only. Date 2026-10-19/20. Black-box plus white-box. No repo source modified. Rate-limit test sent ~2,000 requests in total (no flood); slowloris test used 1-2 connections.

## Summary

| ID | Sev | Title |
|---|---|---|
| INF-1 | Medium | nginx `/api` rate limit bypassed by forging any cookie value |
| INF-2 | Medium | Container images carry known HIGH/CRITICAL CVEs (stale, tag-pinned) |
| INF-3 | Medium | Backups: unauthenticated AES-CBC, key beside data, superuser creds, offsite path not wired |
| INF-4 | Low | OAuth `code`/`state` written to nginx and API logs |
| INF-5 | Low | Log retention and client-IP fidelity do not meet CERT-In expectations; audit coverage gaps |
| INF-6 | Low | Secrets passed as plain env vars (visible in `docker inspect`, `/proc`) |
| INF-7 | Low | Container hardening gaps (db, backup, nginx master as root; flat non-internal network) |
| INF-8 | Low | Header gaps and conflicts (duplicate/conflicting headers, no CSP on /auth, `unsafe-inline` styles, immutable cache on 404) |
| INF-9 | Low | No per-IP connection cap; body-timeout slow-POST not confirmed |
| INF-10 | Info | Postgres: no TLS, no connection/DDL logging |
| INF-11 | Info | CORS-denied preflight returns 500 and logs a stack trace per request |
| INF-12 | Info | Floating base image tags (`node:22-alpine`), install scripts |

---

## Findings

### INF-1 Medium - nginx rate limit bypass via forged `cdac_session` cookie
Evidence (WSL-local, 700 sequential requests each, `GET /api/sessions`):
- fixed cookie `cdac_session=fixedvalueAAAA`: `{401: 74, 429: 626}`
- random cookie per request: `{401: 700}` (zero 429s)

Root cause: `deploy/nginx/nginx.conf:37-38`. `map $cookie_cdac_session $api_key` keys the `api_limit` zone on the raw cookie string. nginx cannot verify the signature, so every new value gets a fresh 300 r/m bucket. The comment in `server/src/index.ts:105-110` ("Forged cookies cannot mint new buckets") is true only for the Fastify limiter. The remaining backstop is the app limiter, 1500/min per IP for unsigned cookies (`index.ts:120`), which is 5x the intended nginx ceiling. The nginx layer is therefore decorative for an attacker.
Secondary: large forged cookies (up to header limit) fill the 20 MB zone and evict legitimate users' buckets.
Fix: key nginx on `$binary_remote_addr` with a high burst, plus a separate low-cost per-cookie zone only as an additional limit (use `limit_req` twice). Or drop the nginx cookie zone and rely on the verified app limiter, plus an nginx per-IP ceiling (e.g. 1500r/m) so spoofed cookies cannot exceed the app's IP ceiling.

### INF-2 Medium - Vulnerable base images
`trivy image --scanners vuln --severity HIGH,CRITICAL` (OS and library layers):
- `cdac-feedback-web` (nginx:1.27.2-alpine, Oct 2024): 38 findings (3 CRITICAL, 35 HIGH): libcrypto3/libssl3 3.3.2-r1 (CVE-2026-31789 CRITICAL, CVE-2024-12797), libxml2 2.12.7-r0 (CVE-2024-56171 CRITICAL, CVE-2025-24928) and others.
- `postgres:16.4-alpine3.20` (db): 29 (3 CRITICAL, 26 HIGH), same libs; plus bundled gosu Go stdlib: 59 (4 CRITICAL, 55 HIGH, e.g. CVE-2023-24538).
- `cdac-feedback-backup` (same postgres base): 13 (1 CRITICAL, 12 HIGH) plus gosu Go stdlib 59 (4 CRITICAL).
- `cdac-feedback-api` (node:22-alpine): 11 HIGH, e.g. `brace-expansion` 2.0.2 (CVE-2026-102276, DoS).
- `npm audit` root and `server` (prod and all): 0 vulnerabilities.

Most are not remotely reachable (32-bit-only, build-time tooling), but they will fail a compliance scan.
Root cause: `deploy/Dockerfile.web:10` (`nginx:1.27.2-alpine`), `deploy/docker-compose.yml:21` and `deploy/backup/Dockerfile:1` (`postgres:16.4-alpine3.20`), `deploy/Dockerfile.server:2,11` (floating `node:22-alpine`).
Fix: bump to current patched tags (nginx 1.28+ / postgres 16.latest-alpine, rebuild API to refresh npm `brace-expansion` via lockfile update), pin by digest, add `trivy image --exit-code 1 --severity CRITICAL` to the release gate, rebuild monthly.

### INF-3 Medium - Backup design weaknesses
Root cause: `deploy/backup/backup.sh:17-18`, `deploy/docker-compose.yml:105-125`, `deploy/backup/entrypoint.sh`.
1. Encryption is `openssl enc -aes-256-cbc -pbkdf2` with a passphrase: no authentication (ciphertext can be tampered or truncated without detection, padding-oracle class), and no integrity check in `restore-test.sh` beyond gunzip success. Use `age` or `gpg --symmetric --cipher-algo AES256` (AEAD/MDC), or add an HMAC / sha256sum manifest signed separately.
2. The decryption key (`BACKUP_ENCRYPTION_KEY`) lives in the same container env, `/etc/backup.env` (root 0600) and the `deploy/.env` on the same host as the `backups_data` volume. Anyone with the Docker socket or host root gets both. Keep the key off-host (HSM/Vault/escrow printed copy) and use a public-key scheme (`age -r`) so the host holds only the encryption half.
3. Backups run as the DB owner/superuser (`PGUSER=cdac_owner`, `rolsuper=t`). Use a dedicated `pg_read_all_data`-style role (`pg_dump` needs only SELECT).
4. Offsite is optional and, as shipped, cannot work: `BACKUP_OFFSITE_SSH_KEY=/run/offsite_key` but compose has no volume/secret mounting it; `backup.sh` then prints a WARNING and keeps the only copy in a local Docker volume on the same disk. rsync uses `StrictHostKeyChecking=accept-new` (trust-on-first-use, MITM on first connect). Pin `known_hosts`.
5. `/backups` is `drwxr-xr-x` root; files inherit umask from cron (entrypoint sets `umask 077` only for the env file). Verified directory mode 755; add `umask 077` to `backup.sh`.
6. Retention (`-mtime +180`) is fine for CERT-In, but nothing alerts on failure or a stale last backup.

### INF-4 Low - OAuth authorization code and state logged
Evidence: `GET /auth/google/callback?code=4/0AFAKECODE123&state=abc` appears verbatim in both:
- nginx access log: `"request":"GET /auth/google/callback?code=4/0AFAKECODE123&state=abc HTTP/1.1"` (`nginx.conf:13-17`, `$request`)
- API pino log: `"req":{"url":"/auth/google/callback?code=...&state=..."}` (`server/src/index.ts:21-26` redacts only headers).

The code is single-use, short-lived and PKCE-bound, so impact is low, but codes and state values in logs are a reportable finding and a replay aid within the window.
Fix: log `$uri` instead of `$request` (or `map` the callback to a stripped value) in nginx; add a pino `serializers.req` that strips the query string for `/auth/*`.

### INF-5 Low - Logging/retention/audit vs CERT-In
- App and nginx logs use Docker `json-file` with `max-size 10m x 5 files` per container (`docker-compose.yml:6-8`) = ~50 MB, which rotates away in hours/days under load. CERT-In (28 Apr 2022 directions) expects ICT logs retained 180 days within India. Ship to a central, append-only store (syslog/Loki/SIEM) with NTP-synced time.
- In this staging stack the client IP is `172.19.0.1` (Docker gateway) in both nginx `remote_addr` and API `remoteAddress` (userland proxy/WSL NAT). On the production host verify `docker run` publishes through iptables DNAT (not docker-proxy, and IPv6 disabled or `ip6tables` on), otherwise `audit_logs.ip_address` and per-IP rate limiting collapse to one address.
- Pino request logs do not include `req.ip`, only the proxy address (`remoteAddress`); the real client IP exists only in nginx logs and `audit_logs`.
- `audit_logs` coverage: logins (success/failure), logout, session create/edit/delete, report view, roster upload, faculty create, generic table CRUD. Good: append-only triggers (`002_security.sql:90-104`), `feedback_app` has INSERT only on `audit_logs`. Gaps: no record of authorization denials (403/IDOR probes), rate-limit trips (429), session revocation, CSV roster export, or admin role changes beyond generic TABLE_UPDATE; no tamper-evidence (hash chain) and the table owner can drop the triggers; no off-host copy of the audit table other than the daily pg_dump.

### INF-6 Low - Secrets in environment variables
`docker inspect` (any user in the `docker` group) shows `COOKIE_SECRET`, `DATABASE_URL` (app DB password), `POSTGRES_PASSWORD`, `PGPASSWORD`, `BACKUP_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` in plaintext. They are also visible in `/proc/1/environ` to anything that gains RCE in the container, and `GOOGLE_CLIENT_SECRET`, `COOKIE_SECRET` are passed to the one-shot `migrate` service which does not need them (`docker-compose.yml:11-17, 48-49`).
No secrets found in git history (`git log -p -G` over all refs: only `.env.example` templates, the dev-login password `password` in the v1 Supabase commit, and Supabase config template placeholders); `deploy/.env` and `*.pem` are ignored and not tracked.
Fix: Docker/Compose `secrets:` with `_FILE` reads, `chmod 600 deploy/.env`, limit docker group membership; give `migrate` only what it needs.

### INF-7 Low - Container hardening
`docker inspect` results:
| Container | User | read_only | cap_drop | no-new-priv | notes |
|---|---|---|---|---|---|
| api | node | yes | ALL | yes | good |
| nginx | root master, workers `nginx`, adds CHOWN/SETUID/SETGID/NET_BIND_SERVICE | yes | ALL | yes | acceptable; consider `nginxinc/nginx-unprivileged` and 8080/8443 |
| db | root entrypoint then postgres | **no** | **none** | yes | add `cap_drop: [ALL]` + `cap_add: [CHOWN,DAC_OVERRIDE,FOWNER,SETGID,SETUID]`, `read_only` with tmpfs `/run/postgresql`, `/tmp` |
| backup | **root** | **no** | **none** | yes | runs cron + pg_dump as root with rw rootfs; run as `postgres` user |
| migrate | node | yes | ALL | yes | good |
No container is privileged, no host mounts except the read-only cert directory, no Docker socket, no `pids_limit`/`cpus`. Network `cdac-feedback_internal_net` is a plain bridge (`Internal=false`), so db/api/backup have outbound internet (egress for exfil or C2 after compromise). Only nginx publishes ports (80, 443); the DB is **not** reachable from the host or LAN (no 5432 mapping; the Windows host's own 5432/3000 listeners are not from this stack). The shell-mounted cert files in staging are mode 777 (NTFS bind-mount artefact): in production set `privkey.pem` to 0600/root-or-nginx owner.
Fix: add `internal: true` on a backend network for db/api/backup plus a separate frontend network for nginx; add `pids_limit`, `cpus`.

### INF-8 Low - HTTP header issues
Verified (curl, all location types):
| Location | HSTS | XCTO | XFO | CSP | Referrer | PermPol | COOP/CORP | Cache |
|---|---|---|---|---|---|---|---|---|
| `/` + SPA fallback | yes | yes | yes | yes | yes | yes | **no** | no-cache |
| `/assets/` | yes | yes | no | no | no | no | no | immutable 1y |
| `/api/*`, `/auth/*` | yes (x2) | yes (x2) | yes | helmet CSP | **conflicting x2** | no | yes (helmet) | no-store |
| `/healthz`, `/api/health` | yes | yes | no | n/a | no | no | n/a | n/a / no-store |
| nginx-generated 400/404/405 | yes (404 in `/`) | partially | | | | | | |
Issues:
1. Duplicate/conflicting headers on `/api` and `/auth`: HSTS twice (helmet `max-age=63072000; includeSubDomains; preload` vs nginx without `preload`), `X-Content-Type-Options` twice, `Referrer-Policy: no-referrer` (helmet) and `strict-origin-when-cross-origin` (nginx). Browsers take the most restrictive/first, but scanners flag it. Let helmet own `/api` and `/auth` and drop the nginx duplicates (`nginx.conf:105-122`), or `proxy_hide_header` them.
2. `/` CSP: `style-src 'unsafe-inline'` (also in helmet CSP, `index.ts:~55`) because of React inline styles/recharts; `script-src` falls back to `default-src 'self'` (good, no inline/eval). Add `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin` to the SPA document, `upgrade-insecure-requests`, and `form-action 'self'` is present (good).
3. `/assets/` 404 responses carry `Cache-Control: public, max-age=31536000, immutable` (`add_header ... always`, `nginx.conf:124-129`): a missing chunk during a deploy gets cached for a year by browsers/proxies. Use `always` only for 200, or set `try_files` then a `map $status`.
4. `/assets/`, `/healthz` carry no `Content-Security-Policy`/framing headers (low value).
5. Per-location `add_header` blocks are duplicated by copy (comment at `nginx.conf:47`); one omission already exists (`/assets`: no XFO/Referrer), so drift is a real risk. Use `include /etc/nginx/snippets/security-headers.conf;` baked into the image.
Controls OK: `Server: nginx` only (server_tokens off, no version); no `X-Powered-By`; no `.map` files in `dist`; `/api` and `/auth` are `no-store`, so no authenticated-response caching/leak.

### INF-9 Low - Connection limits
No `limit_conn` is configured, so a single IP can hold up to `worker_connections` (4096 x workers) sockets. `client_header_timeout 15s` verified: a partial-header connection was closed by the server after exactly 15.0 s. A partial-body POST (`client_body_timeout 15s`) could not be confirmed (second handshake attempt dropped); retest. `client_max_body_size 2m` verified for nginx (3 MB POST => 413), and Fastify's own 50 KB `bodyLimit` applies (roster upload raised to 1 MB, `roster.ts:57`).
Fix: `limit_conn_zone $binary_remote_addr zone=conn:10m; limit_conn conn 100;` (campus NAT: size generously) and `reset_timedout_connection on`.

### INF-10 Info - Postgres hardening
Verified in container: `listen_addresses='*'` (only reachable on the compose network), `ssl=off` (plaintext API-to-DB inside the bridge), `password_encryption=scram-sha-256`, `pg_hba`: `trust` only for `local`/127.0.0.1/::1 (inside the container) and `host all all all scram-sha-256` (any container on the network can try to authenticate; no CIDR restriction). Roles: `cdac_owner` is superuser (+bypassrls); `feedback_app` is not super/createrole/createdb/bypassrls, cannot CREATE in db or `public`, and has no grants on `responses`/`submissions` (accessible only via SECURITY DEFINER functions). `log_connections=off`, `log_statement=none`, no `log_min_duration_statement`, no pgaudit.
Fix: mount a `pg_hba.conf` limiting to the compose subnet; enable `log_connections`, `log_disconnections`, `log_statement=ddl`; optional TLS between api and db.

### INF-11 Info - CORS denial returns 500 with stack trace in log
`OPTIONS /api/sessions` with `Origin: https://evil.com` => `500 {"error":"Internal Server Error"}`; also `GET /api/sessions` with the foreign Origin => 500. Each request writes a pino error with a stack (disclosed only in logs, not to the client), allowing log-volume amplification. Handle origin rejection in the `@fastify/cors` origin callback with `cb(null, false)` (no ACAO header, normal status) instead of `cb(new Error(...))`. Same-origin requests correctly get `access-control-allow-origin: https://localhost` with credentials, no wildcard.

### INF-12 Info - Supply chain
Lockfiles present and complete (`package-lock.json` 318 resolved entries, `server/package-lock.json` 163, all https with integrity); Dockerfiles use `npm ci`; `npm audit` clean. Base images pinned by tag only, `node:22-alpine` floats; packages with `hasInstallScript` (e.g. esbuild-class) run scripts at build only. Pin digests and run `npm ci --ignore-scripts` where possible.

---

## Controls verified (no finding)
- TLS: only TLS 1.2/1.3 (`-tls1`, `-tls1_1` rejected); ECDHE+AEAD ciphers only (negotiated TLS_AES_256_GCM_SHA384 / ECDHE-RSA-AES256-GCM-SHA384); session tickets off; HTTP/2; RSA 2048. Staging cert is self-signed (CN=localhost, 2-day validity, CA:TRUE) which is expected here; production needs a CA-issued leaf with SAN.
- HSTS `max-age=63072000; includeSubDomains` on all 443 responses.
- HTTP :8080 -> 301 to the fixed `__SERVER_NAME__` with path and query preserved; the `Host` header is ignored (`Host: evil.com` and `Host: x"><script>` yield the same fixed Location, no host-header injection or reflection).
- `X-Forwarded-For` / `X-Real-IP` supplied by the client are overwritten by nginx (`proxy_set_header X-Forwarded-For $remote_addr`, `nginx.conf:~75`); the API is not published, and its `trustProxy` is limited to loopback/private ranges.
- No directory listing (`/assets/` => 404), no `.map`, `.env`, `.git`, `package.json` exposed (all requests fall through to the SPA `index.html` as a 200 soft-404 of 576 bytes, so scanners may false-positive; encoded and `..` traversal return 400). Only `dist` ships in the web image.
- Methods: TRACE/PUT/DELETE/OPTIONS on static => 405; API unknown routes => JSON 404; no stack traces or version strings in any response body; malformed JSON => clean 400; oversize body => 413; `/auth/dev-login` => 404 in production mode.
- `/api/health` returns only `{"status":"healthy","database":"connected"}` with `no-store`; `/healthz` is answered by nginx itself (Fastify's uptime variant is not exposed).
- Session/API responses `Cache-Control: no-store`; `Vary: Origin`; CORS pinned to the single configured origin.
- API container: non-root, read-only rootfs, `cap_drop: ALL`, `no-new-privileges`, memory limit; DB not published to the host.
- App DB role is least-privilege and RLS-subject; `audit_logs` is append-only for the app role.
- Dependencies: `npm audit` 0 for root and server; lockfiles with integrity hashes; no real secrets in git history; `.env`, certs, dumps are git-ignored.
