# Restructure plan

Status: proposal. Do not start before go-live (31 Oct 2026). Every move below is mechanical (`git mv` + import fixes) with tests green after each step.

## Why

| Pain today | Evidence |
|---|---|
| Frontend lives at the repo root, `server/` is an npm workspace inside it | Root lockfile went out of sync with the workspace and broke `npm ci` in Docker and CI; `Dockerfile.web` must copy `server/package.json` to build the SPA |
| Two lockfiles (`package-lock.json`, `server/package-lock.json`) | Drift, CI uses both |
| Server routes mix HTTP, authorisation and SQL in one file (`tables.ts` 300 lines, `sessions.ts` 234) | Authorisation bugs found in the audit were all in these files |
| Frontend `src/pages` holds pages, pickers and editors together; `src/lib/api.ts` (264 lines) holds every endpoint | Hard to find code by feature |
| Tests compile into `dist/tests`; load tests, scripts and docs scattered; `.planning/` holds stale phase docs | Vitest picked up `dist/` copies |
| API types are written twice (server zod schemas, `src/lib/api.ts` interfaces) | Silent drift risk |

## Target layout

```
apps/
  web/                    # React SPA (today: src/, index.html, vite.config.ts)
    src/
      app/                # App.tsx, router, providers, auth.tsx
      features/
        student/          # StudentHome, FeedbackForm
        sessions/         # SessionsPage, CreateSessionForm, CohortPicker, FacultyPicker
        reports/          # SessionReport, ReportDocument, aggregate, CommentAnalysis
        dashboard/        # DashboardPage, KPISummary
        roster/           # RosterPage
        admin/            # ManagePage, TableEditor
      shared/             # api client, format, palette, reference hooks, UI bits
  api/                    # Fastify API (today: server/)
    src/
      app.ts              # buildApp (plugins, hooks)
      server.ts           # listen
      config.ts
      db/                 # pool.ts, migrate.ts, seed.ts, bootstrap-admin.ts, migrations/
      modules/
        auth/             # routes.ts, session.ts, oauth.ts
        sessions/         # routes.ts, service.ts, schema.ts
        feedback/
        reports/
        roster/
        reference/        # tables.ts split per table config
      shared/             # errors, audit, guards
    tests/                # moved out of src so they never reach dist
packages/
  contracts/              # OPTIONAL, step 6: zod schemas + inferred types shared by api and web
deploy/                   # unchanged: compose, Dockerfiles, nginx, backup
tests/load/               # unchanged
docs/                     # architecture, ops, vapt, adr, this file
package.json              # workspaces: apps/*, packages/*  (one lockfile)
```

Rules: a feature folder owns its components, hooks and tests. `shared/` may not import from `features/`. API `modules/*` own routes, authorisation and SQL for one resource; cross-module calls go through `service.ts`.

## Steps (each is its own PR; tests and `docker compose build` must pass after each)

1. **Single workspace root.** Root `package.json` becomes workspaces-only. One `package-lock.json`, generated on Linux so all native bindings are present. Delete `server/package-lock.json`. Update `ci.yml` and both Dockerfiles. This step alone removes the Docker/lockfile friction.
2. **Move the SPA** to `apps/web` (`git mv src index.html vite.config.ts tsconfig.json`). Fix `Dockerfile.web` paths and CI.
3. **Rename `server/` to `apps/api`.** Move `src/tests` to `tests/`, exclude from `tsc` build output, add vitest config that ignores `dist`.
4. **API modules.** Split `routes/*` into `modules/<resource>/{routes,service,schema}.ts`. Move SQL out of handlers into `service.ts`. Split `tables.ts` into one config per table plus a generic handler. No behaviour change; the 65 server tests are the safety net.
5. **Web features.** Move pages into `features/*`, split `lib/api.ts` per resource (`features/sessions/api.ts`, ...). Keep lazy-loaded routes lazy. The 8 unit tests plus a build size check are the safety net.
6. **Shared contracts (only if drift hurts).** Move request/response zod schemas to `packages/contracts`, import in both apps. Skip if steps 4-5 keep types small; YAGNI.
7. **Housekeeping.** Delete `.planning/`, fold still-valid parts of `docs/vapt` into one `docs/security/`, add ESLint + Prettier with a CI check, add `engines` and `.nvmrc` pinned to the Node 22 patch used in the Docker image, add path filters to CI so web-only changes skip API jobs.

## Order and risk

- Steps 1-3 are pure moves: low risk, about half a day each including CI.
- Steps 4-5 touch every route and page: do them one resource at a time, not as a big bang.
- Do not combine a move with a behaviour change in the same commit; `git log --follow` must stay readable.
- Rollback: each step is one revertable PR.

## Acceptance

- `npm ci && npm test && npm run build` pass from the repo root on Linux with a clean checkout.
- `docker compose build` succeeds; image sizes do not grow.
- Server suite (65+ tests incl. RLS tests) and web suite green; load test p95 unchanged.
- No file in `apps/api/src/modules` over about 200 lines; no handler contains raw authorisation SQL that is not in a service.
