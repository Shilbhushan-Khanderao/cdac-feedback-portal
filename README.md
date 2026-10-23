# CDAC Feedback Portal

Students give module feedback; course coordinators (CCs) schedule sessions and download reports; admins manage reference data and staff.
On-premise deployment: React SPA, Fastify API, PostgreSQL 16, nginx (TLS), Google OAuth sign-in.

## Architecture

```
browser --443--> nginx (TLS, static SPA, rate limits) --> api (Fastify, :3000) --> db (Postgres 16)
                                                          ^ migrate (one-shot)       ^ backup (cron, encrypted dumps)
```

Container logs go to the host journal; a daily host job (`deploy/offsite-copy.sh`) copies them,
encrypted, with the DB backups to a network share and keeps 180 days.

- `apps/web/` React 19 + Vite + Tailwind; `apps/api/` Fastify API; `deploy/` Docker, nginx, backup; `docs/` runbooks.
- The API connects as the non-superuser role `feedback_app`; Postgres RLS is the authorisation boundary.
- Anonymity rules are in [CLAUDE.md](CLAUDE.md).

## Local development & deployment

Local development (Postgres setup, dev servers, tests): **[GETTING-STARTED.md](GETTING-STARTED.md)**.
Server deployment, step by step: **[docs/ops/DEPLOYMENT-GUIDE.md](docs/ops/DEPLOYMENT-GUIDE.md)**.

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
[DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md); day-2 operations (logs, backup, restore, TLS
renewal, rotation): [docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md](docs/ops/PRODUCTION-CUTOVER-RUNBOOK.md).

## CI

`.github/workflows/ci.yml`: a `changes` job skips web, api or docker jobs when their paths are untouched. Web: `npm run lint`, `format:check`, `tsc`, vitest, build, `npm audit`. API: `tsc` and tests against a Postgres 16 service. Docker builds of both images.

## Status

Security posture, test results and VAPT status are tracked in `docs/security/`. Items marked "target" there are not yet implemented.

Planned next version (comment themes, abuse filter, personal-detail masking, on-server AI summaries): [docs/roadmap/NEXT-VERSION-COMMENT-INSIGHTS.md](docs/roadmap/NEXT-VERSION-COMMENT-INSIGHTS.md).
