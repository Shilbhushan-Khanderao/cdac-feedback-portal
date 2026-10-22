# CDAC Feedback Portal

Students give module feedback, course coordinators (CCs) schedule sessions and download reports.
On-premise (branch `on-premise`). Replaces the older Supabase/GitHub Pages version.

## Stack
React 19 + TypeScript + Vite + Tailwind v4, react-router `createHashRouter`, TanStack Query.
Layout: npm workspaces `apps/web` (SPA), `apps/api` (API), one root lockfile. API tests live in `apps/api/tests/`.
Reports: recharts, sentiment + compromise, @react-pdf/renderer (lazy loaded).
Backend: Fastify + `pg` in `apps/api/`, PostgreSQL 16 with RLS, Google OAuth, session cookies.
Serving: nginx (TLS, static SPA, proxy) via Docker Compose in `deploy/`.

## Commands
- `npm run dev` (SPA :5173), `npm run server:dev` (API :3000; needs a local Postgres and `apps/api/.env`)
- `npm test` (frontend vitest), `npm run server:test` (needs Postgres, see `.github/workflows/ci.yml` for env)
- `npx tsc -b apps/web && npm run build`; `npm run lint`; Node 22 (`.nvmrc`)
- Deploy: `docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build`; secrets in `deploy/.env` (template `deploy/.env.example`)
- Migrations: `node dist/db/migrate.js` (compose `migrate` service). First admin: `node dist/db/bootstrap-admin.js <email> <name>`

## Rules
- Identity is the verified Google email looked up in `staff_roster` (cc/admin) or `student_roster` (student). There is no profiles table.
- **Anonymity:** `responses` must never get a student column or a timestamp. Only `submit_feedback()` writes `submissions` and `responses`. Nobody selects `responses` directly: staff read answers only through `session_report()` (after close, at least 3, random order). CCs see who submitted, not when. A closed session's schedule is final (`trg_lock_closed_schedule`).
- A batch (e.g. Aug 2026) is global. A cohort = batch + centre + course, stored on `student_roster` and `feedback_sessions`. Students see and submit only sessions of their own cohort.
- Faculty rows belong to a centre (NULL = shared). CCs add their own centre's faculty inline.
- RLS is the security boundary; the API must run as `feedback_app` (not superuser, not table owner). Client-side filters only trim dropdowns.
- Never delete data that holds feedback: sessions with submissions can't be deleted; courses, modules and batches in use are protected by FK. Deactivate instead.
- Schema changes go in a new versioned migration under `apps/api/src/db/`, applied by `migrate`, with a server test for any new policy. Never edit an applied migration.
- `NODE_ENV=production` must disable dev-login. No secret has a default value; add new ones to `deploy/.env.example` and `deploy/docker-compose.yml` with `${VAR:?}`.
- Seed/test data is for local development only and must never load in production.
