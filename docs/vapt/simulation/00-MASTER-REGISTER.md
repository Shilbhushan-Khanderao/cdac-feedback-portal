# VAPT simulation: master findings register

Run: 2026-10-19/20, disposable local staging stack (WSL2 Docker, `deploy/docker-compose.yml` + a local-only port/TLS override, never committed). White-box, five domains. Source reports: `01-authn-session.md`, `02-authz-idor.md`, `03-injection-logic-anonymity.md`, `04-infra-config.md`, `05-client-privacy-compliance.md`.

Three of eight domain-assignments were declined by the subagent running them, citing the active-testing framing, even though this was the user's own authorised disposable stack. I ran those checks myself directly against `localhost`. See the "Method note" in each affected report.

## Fixed after this run, round 2 (parallel domain agents: server, infra, frontend, docs)

| ID | Fix |
|---|---|
| CMP-6 | Audit coverage: `AUTHZ_DENIED` on every 403 (shared error handler), `BULK_READ` on `student_roster`/`staff_roster` list reads, roster-upsert audit now logs the email list. Reference-table reads left unaudited on purpose (noise). |
| INF-4 | OAuth `code`/`state` stripped from both the Fastify request log and nginx's own access log for `/auth/` paths. |
| CMP-4 | `POST /api/consent` (any authenticated role), server-side record backing the existing localStorage flag. Staff now get a one-time dismissible notice too (previously only students had any notice at all). |
| INF-3 | Backup can run as a least-privilege `BACKUP_DB_ROLE` instead of the superuser (documented GRANT, including `BYPASSRLS` which a plain SELECT grant alone doesn't cover). Added encrypt-then-MAC (HMAC-SHA256) since AES-256-GCM isn't reachable through `openssl enc` on this stack; a tampered backup now fails restore closed before decryption. |
| CL-5, INF-8, INF-9 | `no-store` on the HTML shell; security headers deduplicated into one included nginx snippet (closes the `/assets`/`/healthz` missing-header gap); `limit_conn` added as a connection-exhaustion backstop. |
| CMP-7 | Log rotation sized up with the math shown in a compose comment; durable 180-day retention still needs off-host log shipping (not yet scheduled, documented as such). |
| INF-6, INF-10 | Documented as accepted risk for a single-host Compose deployment (plain env-var secrets, no inter-container TLS) rather than built — would need a secrets manager or a non-colocated DB to change that calculus. |
| CL-4 | Login error text now allowlists the 4 exact strings the server can send; any other `error_description` (a crafted link) falls back to a generic message. |
| CL-6, CMP-5 | Consent notice no longer claims zero external dependency; now names Google OAuth's scope and WhatsApp sharing explicitly. |
| CL-7 | Both named contrast failures fixed, Sessions page heading added, per-route `document.title`, footer line added. |
| CMP-10 | `docs/vapt/*` corrected against the actual current repo (not the pre-fix snapshot): verdict flipped to "NOT YET CLEARED"; PKCE/state, the live roster role re-check, and the audit log's controlled retention exception confirmed and marked done; fictional claims (pgAudit, 47 pgTAP tests, `@fontsource/inter`, wrong rate-limit numbers, a stale Supabase instruction) removed; test counts recounted directly from each file's `describe`/`it` blocks; anonymity claim rewritten as app-layer-true/storage-layer-target. |
| CMP-8 | Named Security Incident Owner placeholder added to `INCIDENT-RESPONSE.md`, explicitly distinct from the DPDP grievance officer. |
| CMP-9 | Adult-cohort (18+) assumption documented; no age assurance implemented, flagged for CDAC to confirm. |

Verified end to end on the full local stack after all four agents landed: `POST /api/consent` round-trips 200→200 (upsert)→401 through nginx; `no-store` and deduplicated headers confirmed on 4 location types; OAuth `code` absent from nginx's access log; `limit_conn` present and `nginx -t` clean; a real backup→HMAC-tamper→fail-closed→restore→pass cycle; `/auth/dev-login` still 404 under `NODE_ENV=production` (one false alarm during testing traced to a test-script shell-env leak, not an app bug — see commit `8bc3772`'s verification notes). Server suite 71/71, frontend 8/8, both clean builds.

Open from the original five-domain run, not yet touched: the DPDP section-number mapping in `AUDIT-REPORT.md` (flagged as unverified against the Act text, not asserted); folding `docs/vapt/RESIDUAL-RISKS.md` back into the main checklist once it stops being a moving target.

## Fixed after this run (same conversation, follow-up work)

| ID | Fix |
|---|---|
| AZ-1 | `staff_roster` writes now blocked by a second, independent admin-only check inside `assertCanWrite`, not just by its absence from `STAFF_WRITABLE`. |
| CMP-1 | Admin-managed `grievance_officers` contact (name + email only — no login, no new role; adding one is deferred until/unless this person needs to work inside the portal). |
| CMP-2 | `node dist/db/retention-purge.js [--years 2] [--confirm]`: dry-run by default, deletes expired submissions/responses and aged-out `audit_logs` rows inside one transaction that disables/re-enables the append-only trigger around the delete. Verified live against a real Postgres. Not run from `migrate.ts`. |
| INF-2 | All three images rebuilt on current patched base images, pinned by tag+digest (`node:22-alpine`, `nginx:1.31.7-alpine`, `postgres:16.15-alpine`). Rescanned with Trivy: web image dropped from 3 critical/35 high to 0/2 high (both already have upstream Alpine fixes pending); backup image's OS layer dropped to 0 (was 3 critical/26 high); its remaining 1 critical/24 high all sit in `gosu`, a Go binary baked into the official upstream `postgres` image by its own build process — not controllable from this Dockerfile, and it's a startup-only privilege-drop helper, never network-reachable. API image's 11 high are npm package CVEs (`server/package.json`), unaffected by an OS base image bump; track those via `npm audit`/Dependabot separately. |

## Fixed during this run

| ID | Fix | Commit status |
|---|---|---|
| INF-11 / CL-3 | CORS-mismatch requests returned 500 with an uncaught-error shape; now return a clean 403. `server/src/index.ts` | Not committed |
| INF-1 | nginx's own `/api` rate-limit zone keyed on the raw (unverifiable) session cookie, so a client sending a fresh random cookie per request got a fresh bucket every time — confirmed 0/700 requests throttled that way vs 626/700 with a fixed cookie. Re-keyed on client IP as a coarse NAT-safe backstop; the real per-session limit already lives in Fastify (`server/src/index.ts`), which verifies the cookie's signature before using it as a key. `deploy/nginx/nginx.conf` | Not committed |

Both fixes were rebuilt and reverified live: CORS mismatch now returns 403; the duplicate `Cache-Control` header on `/assets/` from an earlier session is also gone (confirmed, no separate fix needed — already correct in the current nginx.conf).

## Open findings by severity

### High (4)

| ID | Domain | Summary |
|---|---|---|
| CL-1 | Client | Feedback drafts in `localStorage` are not scoped per user — a second student on the same browser saw the first student's draft comment pre-filled. |
| CMP-1 | Compliance | No access, correction or erasure path for data principals, and no grievance contact — a core DPDP requirement. |
| CMP-2 | Compliance | Retention is declared in docs but unenforceable: the audit-log append-only trigger blocks every purge, even by the table owner. |
| (see INF-2) | Infra | Base images carry known CVEs: nginx image 3 critical/35 high, Postgres image 3 critical/26 high (plus 4 critical in bundled Go tooling), API image 11 high, via Trivy. `npm audit` itself is clean. Listed here because of volume/severity even though the source report marks it Medium (no demonstrated exploit path in this app's usage). |

### Medium (10)

| ID | Domain | Summary |
|---|---|---|
| AZ-1 | Authz | `staff_roster`'s writable-column allowlist still names `role`/`centre_id`/`course_id`; currently blocked by a second check, but a latent privilege-escalation trap if that check is ever loosened. |
| INF-1 | Infra | **Fixed this run** — see above. |
| INF-2 | Infra | Base-image CVEs (also listed under High for severity). |
| INF-3 | Infra | Backup uses unauthenticated AES-256-CBC with the key on the same host as the data, connects as the DB superuser, and the documented offsite copy can't run as shipped (SSH key not mounted). |
| CL-2 | Client | Sign-out can silently fail client-side when `CORS_ORIGIN` doesn't exactly match the browser origin, leaving the session live after "Sign out" appears to succeed. |
| CMP-3 | Compliance | `submissions`/`responses` rows are heap-order and `xmin`-correlated, and `submitted_at` sits next to them — a DBA or backup holder can re-link who submitted what, contradicting the "impossible to link" design claim. |
| CMP-4 | Compliance | Consent is an unrecorded `localStorage` flag; the notice is English-only and staff receive none. |
| CMP-5 | Compliance | Google OAuth scope and the WhatsApp share aren't disclosed; "100% in India" is overstated. |
| CMP-6 | Compliance | Roster-upsert audit entries log only a row count while silently overwriting cohort/PII; authz failures, exports and bulk reads aren't audited at all. |
| CMP-7 | Compliance | Container logs rotate out (10 MB × 5) well before the CERT-In 180-day floor, with no central store. |
| CMP-8 | Compliance | Incident owners are unnamed, there's no detection capability, and DPDP breach notification isn't operational. |
| CMP-10 | Compliance | The existing `docs/vapt/*` documents overclaim in ~15 places (status, test counts, tools, a rate limit that isn't implemented) — these need correcting before any external auditor reads them. |

### Low / Info (remainder)

See the five source reports for the full list (AUTH-1 info-only; INJ-1/INJ-2; CL-4–CL-8; CMP-9; INF-4–INF-10, INF-12). None change the go/no-go call on their own, but several (INF-4 OAuth code in logs, INF-6 secrets as plain env vars, CL-6 WhatsApp third-party leak) are cheap to fix and worth bundling into the same pass as the Mediums.

## Controls that held (do not re-litigate these)

- RLS/authorisation: every student-to-staff and cross-centre vector tested failed closed (403/401/404); the generic table endpoint's allowlist blocks `responses`/`submissions`/`audit_logs`/`user_sessions` entirely; `feedback_app` has no grant on `responses` and no UPDATE/DELETE on `audit_logs` even at the raw DB level.
- Session/auth: logout invalidates server-side, `GET /auth/logout` and `/auth/dev-login` are both gone in production, tampered cookies are rejected cleanly, OAuth uses PKCE+state, no CORS-credentials leak.
- Injection: SQL injection attempts are rejected or neutralised everywhere tried; the 2000-character answer cap and answer type schema are enforced server-side, not just in the UI; a literal `__proto__` key in a JSON body is rejected before reaching route code.
- TLS: 1.2/1.3 only, AEAD ciphers, HSTS on every HTTPS response, no stack traces or server versions leaked, no exposed `.env`/`.git`/source maps, TRACE/PUT/DELETE blocked at the edge, DB not published to the host.
- CSV/PDF exports carry no student identity or per-response timestamp; the SPA bundle has no secrets, no third-party calls on any authenticated route, and is XSS-safe against the one tested injection point (`error_description`).

## Recommended order of work

1. **CL-1, CMP-1, CMP-2** — the three High findings. CL-1 is a one-line localStorage key fix (already the pattern used for consent, per the frontend agent's earlier work — apply the same per-email scoping to drafts). CMP-1/CMP-2 are policy-plus-code: need a data-subject-request process and a controlled, logged exception to the append-only trigger for lawful retention expiry.
2. **CMP-10** — correct the existing VAPT docs before they go anywhere near an external auditor; shipping overclaims to a CERT-In empanelled auditor is worse than shipping no claim.
3. **AZ-1, INF-3, CL-2, CMP-3–CMP-8** — bundle into the same remediation pass as the restructure work already planned (`docs/RESTRUCTURE-PLAN.md`), since several (AZ-1, CMP-6) touch the same route files that plan already schedules for splitting.
4. **INF-2 (image CVEs)** — rebuild on updated base images as a routine patching task, not urgent architecture work; re-scan with Trivy after.
5. Everything else Low/Info — fold into the next normal patch cycle.

None of these are new go-live blockers beyond what the earlier engineering pass already found and fixed (RLS, TLS, seed data, rate limits). They are what a real external VAPT auditor would most likely write up given the same access — worth clearing before that audit, not necessarily before this stack is usable for a controlled pilot.
