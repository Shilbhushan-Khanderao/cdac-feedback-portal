# CDAC Feedback Portal

Students give module feedback; course coordinators (CCs) schedule sessions and download reports; admins manage reference data and staff.
On-premise deployment: React SPA, Fastify API, PostgreSQL 16, nginx (TLS), Google OAuth sign-in.

## Architecture

```
browser --443--> nginx (TLS, static SPA, rate limits) --> api (Fastify, :3000) --> db (Postgres 16)
                                                          ^ migrate (one-shot)       ^ backup (cron, encrypted dumps)
```

- `src/` React 19 + Vite + Tailwind; `server/` Fastify API; `deploy/` Docker, nginx, backup; `docs/` runbooks.
- The API connects as the non-superuser role `feedback_app`; Postgres RLS is the authorisation boundary.
- Anonymity rules are in [CLAUDE.md](CLAUDE.md).

## Local development

```bash
npm ci
# start a local Postgres 16, create a database, then in server/.env set DATABASE_URL, COOKIE_SECRET (see deploy/.env.example)
npm run server:dev     # API on :3000
npm run dev            # SPA on :5173
npx tsc -b && npm test && npm run server:test
```

## Deploy (campus host)

```bash
cp deploy/.env.example deploy/.env      # fill every value
cp fullchain.pem privkey.pem deploy/nginx/certs/
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.yml run --rm api node dist/db/bootstrap-admin.js admin@example.in "Admin Name"
```

`migrate` runs automatically before `api`. Full procedure: [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) and [docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md](docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md).

## CI

`.github/workflows/ci.yml`: frontend `tsc`, vitest, build, `npm audit`; server `tsc` and tests against a Postgres 16 service; Docker builds of both images.

## Status

Security posture, test results and VAPT status are tracked in `docs/vapt/`. Items marked "target" there are not yet implemented.
