# CDAC Feedback Portal

Students give module feedback; course coordinators (CCs) schedule sessions and download reports; admins manage reference data and staff.
On-premise deployment: React SPA, Fastify API, PostgreSQL 16, nginx (TLS), Google OAuth sign-in.

## Architecture

```
browser --443--> nginx (TLS, static SPA, rate limits) --> api (Fastify, :3000) --> db (Postgres 16)
                                                          ^ migrate (one-shot)       ^ backup (cron, encrypted dumps)
```

- `apps/web/` React 19 + Vite + Tailwind; `apps/api/` Fastify API; `deploy/` Docker, nginx, backup; `docs/` runbooks.
- The API connects as the non-superuser role `feedback_app`; Postgres RLS is the authorisation boundary.
- Anonymity rules are in [CLAUDE.md](CLAUDE.md).

## Local development & deployment

Full step-by-step guide, including local Postgres setup, running the dev servers, and the
campus deployment walkthrough: **[GETTING-STARTED.md](GETTING-STARTED.md)**.

Quick reference, once set up:

```bash
npm run server:dev     # API on :3000
npm run dev            # SPA on :5173
npx tsc -b apps/web && npm test && npm run server:test
```

```bash
DC="docker compose --env-file deploy/.env -f deploy/docker-compose.yml"
$DC up -d --build
$DC run --rm migrate node dist/db/bootstrap-admin.js admin@example.in "Admin Name"
```

`migrate` runs automatically before `api`. Checklist form for a live cutover:
[DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md); LAN test host:
[docs/ops/LAN-TEST-DEPLOY.md](docs/ops/LAN-TEST-DEPLOY.md); day-2 operations:
[docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md](docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md).

## CI

`.github/workflows/ci.yml`: a `changes` job skips web, api or docker jobs when their paths are untouched. Web: `npm run lint`, `format:check`, `tsc`, vitest, build, `npm audit`. API: `tsc` and tests against a Postgres 16 service. Docker builds of both images.

## Status

Security posture, test results and VAPT status are tracked in `docs/security/`. Items marked "target" there are not yet implemented.
