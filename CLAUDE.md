# CDAC Feedback Portal

Students give module feedback, course coordinators (CCs) schedule sessions and download reports.
v2 of `../pie-generator-app` (CSV to PDF). Static SPA on GitHub Pages, Supabase for DB + auth. No server.

## Stack
React 19 + TypeScript + Vite + Tailwind v4, react-router `createHashRouter` (GitHub Pages has no SPA fallback),
TanStack Query, supabase-js. Reports: recharts, sentiment + compromise, @react-pdf/renderer (lazy loaded).

## Commands
- `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api`: local stack on ports 544xx (TechX uses 543xx)
- `npm run dev`: app on http://localhost:5173. The dev login uses seeded users (`*@test.local`, password `password`)
- `npm test`: vitest. `npm run test:db`: resets the local DB, then runs the pgTAP security suite (`supabase/tests`)
- `npx supabase db reset`: reapply migrations + seed. `npm run types`: regenerate `src/lib/database.types.ts` after schema changes
- `npx tsc -b && npm run build`

## Rules
- Identity is the JWT email looked up in `staff_roster` (cc/admin) or `student_roster` (student). There is no profiles table.
- **Anonymity:** `responses` must never get a student column or a timestamp. Only `submit_feedback()` writes `submissions` and `responses`.
- A batch (e.g. Aug 2026) is global, shared by every centre and course. A cohort = batch + centre + course, stored as three columns on `student_roster` and `feedback_sessions`. Students see and submit only sessions of their own cohort (`in_my_cohort`).
- Faculty rows belong to a centre (NULL = shared). CCs add their own centre's faculty inline (`FacultyPicker`).
- RLS is the security boundary. Client-side filters (e.g. `useMyBatches`) only trim dropdowns.
- Never delete data that holds feedback: sessions with submissions can't be deleted; courses, modules and batches in use are protected by FK. Deactivate instead.
- Schema changes go in a new file under `supabase/migrations/`, plus a pgTAP test for any new policy. Apply to prod with `npx supabase db push`, never through the MCP (it is read-only).
- `supabase/seed.sql` is local test data only.
