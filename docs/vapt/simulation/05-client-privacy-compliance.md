# 05 - Client-side security, privacy and compliance gap analysis

Scope: authorised internal VAPT simulation against the disposable staging stack (`https://localhost:8443`). White-box review of `src/`, `server/src/`, `deploy/`, `docs/`. No repo source was modified.

Method
- Real browser: Chrome 1xx headless driven over CDP (script kept in the session scratchpad, not in the repo). Loaded the SPA unauthenticated, as a student and as a CC. Captured every network request, console message, CSP/Log entries, localStorage and ran scripted accessibility heuristics (accessible names, labels, landmarks, heading structure, computed colour contrast, focus styles).
- `axe-core` was NOT available (no network install, not in `node_modules`), so accessibility results are heuristic, not an axe run. Treat them as a lower bound.
- curl for headers, CORS, source maps, bundle inspection (served bundle downloaded and grepped).
- psql against the staging DB (read-only queries) for anonymity and audit evidence.
- Not done: logout then Back (bfcache) test. Browser logout fails on this staging build (CL-2) and I did not want to revoke the shared `cookies.json` sessions. An attempt to mint a private session needed `COOKIE_SECRET` and was blocked by the permission classifier; I did not work around it.
- Note: the stack was restarted several times by other testers during the run; results below were re-confirmed after it was stable.

Positive results (verified)
- Zero third-party requests on load or any route. All requests were same-origin (`/assets/*`, `/auth/whoami`, `/api/*`). No CSP violations, no console errors, no uncaught exceptions on any role or route.
- No source maps (`*.js.map` returns the SPA shell/404, no `sourceMappingURL`). No API keys or secrets in the bundle. Only external URLs in the bundle: `api.whatsapp.com` and library docs links.
- `error_description` is rendered as React text: `<img src=x onerror=...>` came back as `&lt;img ...&gt;` (no XSS). No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `document.write` in `src/`.
- Clickjacking: `X-Frame-Options: DENY` plus CSP `frame-ancestors 'none'` on `/`, `/api/*`, `/auth/*`.
- `/api/*` and `/auth/*` responses carry `Cache-Control: no-store`.
- Report content: CSV and PDF are built only from `session_report()` output (answers) plus session metadata (module, centre, batch, window, `N of M`). No student identity, email, PRN or per-response timestamp is exported (`src/pages/SessionReport.tsx:112-140`, `src/reports/aggregate.ts`, `src/reports/ReportDocument.tsx`).
- CSV formula injection guarded (`src/reports/aggregate.ts` `sanitizeCsvCell`).
- No password fields; no sensitive `autocomplete` concerns. localStorage holds only drafts and consent flags, no tokens (session cookie is HttpOnly).
- `/auth/dev-login` returns 404 on staging (production build).

---

## Findings

| ID | Severity | Title |
|---|---|---|
| CL-1 | High | Feedback drafts persist in localStorage, are not user-scoped and leak to the next user of the same browser |
| CL-2 | Medium | Sign-out ignores a failed logout call; session stays alive while the UI says signed out. On staging every browser POST fails with 500 (CORS_ORIGIN mismatch) |
| CL-3 | Low | CORS rejection surfaces as HTTP 500 with a stack in logs instead of 403 |
| CL-4 | Low | `?error_description=` lets anyone display arbitrary text inside the trusted login card (content spoofing / phishing) |
| CL-5 | Low | No `no-store` on the SPA shell: authenticated page may be restored by bfcache/back after logout (not verified) |
| CL-6 | Low | WhatsApp share sends module name and feedback link to a third party outside India |
| CL-7 | Low | Accessibility defects: contrast, static page title, missing headings, no accessibility statement |
| CL-8 | Info | Security headers missing on `/assets/*` and `/healthz`; CSP allows `style-src 'unsafe-inline'`; dev-login client code ships in prod bundle |
| CMP-1 | High | No data-principal rights mechanism (access, correction, erasure), no grievance contact |
| CMP-2 | High | Retention is declared but not enforced; audit log made un-purgeable |
| CMP-3 | Medium | "Linkage impossible at DB layer" is false: submissions and responses share transaction id, heap order and a timestamp column |
| CMP-4 | Medium | DPDP consent and notice are weak: localStorage only, no record, English only, incomplete content, contradicts actual processing |
| CMP-5 | Medium | Cross-border transfer via Google OAuth and WhatsApp not disclosed; "100% in India" overstated |
| CMP-6 | Medium | Audit logging incomplete for CERT-In / ASVS V7 |
| CMP-7 | Medium | CERT-In 180-day retention of infrastructure logs and NTP not implemented in repo |
| CMP-8 | Medium | Incident response: owners unnamed, no detection or alerting, DPDP breach notification not operational |
| CMP-9 | Low | Children's data: no age assurance (assumed adult cohort, undocumented) |
| CMP-10 | Medium | docs/vapt overclaims; multiple statements are not backed by the implementation |

### CL-1 High - Draft answers leak across users on a shared browser
- Evidence (PoC, executed): student A (`load0001@loadtest.local`) typed `SECRET-DRAFT-COMMENT` into the comment box. localStorage then held `cdac_draft_<sessionId>={"theory_comments":"SECRET-DRAFT-COMMENT"}`. Cookies were swapped to student B (no logout, which is what happens on session expiry, tab close, or a lab PC reboot with a persistent profile) and the same feedback link opened: B's textarea was pre-filled with `SECRET-DRAFT-COMMENT` and a "Restored your previously saved draft" toast fired.
- Impact: free-text comments can contain names or identifying detail (the anonymity promise is the product). B can submit A's text as their own; a later user can read A's text. Drafts also stay on disk in plaintext indefinitely if the user never submits or signs out.
- Code: `src/pages/FeedbackForm.tsx:21-29` (key `cdac_draft_${id}`, no user component), `:35-45`, `:47-57` (write on every keystroke), `src/auth.tsx:30-37` (cleared only on a deliberate `signOut`).
- Fix: use `sessionStorage` (dies with the tab), or key by a hash of the email and store a timestamp; drop drafts older than a few hours on load; clear all `cdac_draft_*` in `AuthGate` whenever `whoami` returns a different email than the one that wrote them; consider not persisting free-text at all.

### CL-2 Medium (High in a lab context) - Failed logout is swallowed
- Evidence: in the browser, `POST /auth/logout` returned `500` (nginx log, `referer https://localhost:8443/`). Cause: `deploy/.env` has `CORS_ORIGIN=https://localhost`, the browser Origin is `https://localhost:8443`. `@fastify/cors` throws `CORS disallowed` before the CSRF hook. `signOut()` uses `try { await logout } finally { clear drafts; location.assign }`, so the page reloads; the cookie is never cleared by the failed response. After "Sign out" the CC dashboard re-appeared with the same session (confirmed: still authenticated after reload).
- Same root cause breaks every other browser POST/PUT/DELETE on this staging build (submit feedback, create session, roster upload). Same-origin fetches still send `Origin`. GET works. This is why the earlier curl-based tests (no Origin header) passed while the real UI would not.
- Code: `src/auth.tsx:29-39`; `server/src/index.ts:79-93` (`originAllowed` is an exact string compare to `CORS_ORIGIN`).
- Fix: (a) `signOut` must surface failure (toast, keep the user on the page, retry) and only reload on `res.ok`; ideally also have the server expire the cookie on any outcome; (b) derive the allowed origin from `APP_URL` and fail startup if `CORS_ORIGIN` host or port differs from `SERVER_NAME`; since the SPA is same-origin, CORS can be disabled entirely and only the Origin/Host CSRF check kept; (c) add a deploy smoke test that logs out through a browser-like request with an `Origin` header.

### CL-3 Low - CORS denial returns 500
- Evidence: `curl -H 'Origin: https://evil.example' https://localhost:8443/auth/whoami` returned `500` (earlier the same call showed a 200 with `access-control-allow-credentials: true` and `vary: Origin` while another tester's restarts were in progress). API log: `Error: CORS disallowed` at `index.js:82`. The error handler turns it into `Internal Server Error`.
- Impact: noisy 5xx alarms, an attacker can generate log spam, misleading status codes. Not an authz bypass (no ACAO header for foreign origins).
- Code: `server/src/index.ts:79-93` (callback with `new Error`).
- Fix: `cb(null, false)` so the plugin omits CORS headers, and return 403 in the existing hook.

### CL-4 Low - Content spoofing through `?error_description=`
- Evidence: `https://localhost:8443/?error_description=Your account is locked. Call 9999999999 or visit http://evil.example/reset` rendered that sentence verbatim inside the `role="alert"` of the sign-in card. HTML is escaped (no XSS), and URLs are not linkified.
- Impact: phishing text on a trusted government hostname, especially with the Google button directly below.
- Code: `src/auth.tsx:149-153` (`friendlyError(fromUrl)` passes unknown strings through); server side producer `server/src/auth/routes.ts:20`.
- Fix: use a short error code (`?e=not_on_roster`) mapped client-side to fixed messages; ignore unknown values.

### CL-5 Low (not verified) - Back button after logout
- Reasoning: `/` is served `Cache-Control: no-cache` (not `no-store`) so the document is bfcache-eligible; after `signOut` (`location.assign`) pressing Back can restore the previous authenticated page, including a closed-session report with comments, from memory on a shared PC. API calls are `no-store` but that does not block bfcache for the document in Chrome.
- Fix: add `Cache-Control: no-store` for the HTML shell (`deploy/nginx/nginx.conf` `location /`), and a `pageshow` handler that calls `whoami` when `event.persisted`.

### CL-6 Low - WhatsApp share
- Evidence: `src/lib/format.ts:44-50` opens `https://api.whatsapp.com/send?text=<module name + feedback URL>` (`noopener` used, user initiated, falls back from `navigator.share`). The link contains only the session UUID, and the page needs an authenticated cohort member, so no capability leak. But it discloses internal module/course schedule to a foreign processor and contradicts the consent text ("no third-party analytics or external CDNs"). Under CSP this is a navigation, not blocked.
- Fix: keep, but disclose in the notice, or remove for the government deployment (copy link only). Do not put the cohort or faculty name in the message.

### CL-7 Low - Accessibility (WCAG 2.1 AA / GIGW 3.0), heuristic scan
Passed: `lang="en"`, skip link, `main`/`nav`/`header` landmarks, all inputs labelled, zero unnamed buttons, zero images without alt, rating questions in `fieldset/legend`, `role=progressbar` with label, `role=alert`/`status` regions, decorative emoji `aria-hidden`, `prefers-reduced-motion` honoured, custom focus ring.
Failed or weak:
1. 1.4.3 contrast: `(optional)` label 2.59:1 (stone-400, `FeedbackForm.tsx`); white on emerald-600 "Share to WhatsApp" button 3.65:1 (`SessionReport.tsx` button, needs 4.5:1).
2. 2.4.2 page title: `document.title` is "C-DAC Module Feedback" on every route (hash router never updates it).
3. 1.3.1/2.4.6 headings: `/#/sessions` has no heading at all; roster and manage pages have one `h1` only. Dashboard cards use h2 correctly.
4. GIGW 3.0 site-level: no footer, no privacy policy, terms, accessibility statement, contact/help, last-updated, or Hindi/bilingual toggle. Outline suppression: 29 controls have no default outline but use `peer-focus-visible:ring`, the ring colour `brand-300` on white is low contrast (<3:1, 1.4.11).
5. 26 sr-only radio inputs measured below 24 px (not a 2.1 AA criterion; fails WCAG 2.2 2.5.8 only if the label were small, labels are large pills so effectively met).
- Fix: raise those colours (text-stone-600, emerald-700), set `document.title` per route, add `h1` to Sessions, add a footer with policy and accessibility links, run `axe-core` in CI.

### CL-8 Info
- `location /assets/` and `location = /healthz` set only HSTS and nosniff (nginx `add_header` is not inherited), so JS/CSS and health responses lack X-Frame-Options, CSP, Referrer-Policy. No practical impact for static JS, but the docs claim `/healthz` returns CSP and XFO (see CMP-10). HSTS from nginx has no `preload` (Fastify sends it, nginx does not).
- CSP `style-src 'unsafe-inline'` is required by inline styles (recharts, react-pdf preview); acceptable, note for ASVS V14.4.
- `api.auth.devLogin` and the string `/auth/dev-login` are in the production bundle (UI is behind `import.meta.env.DEV`). Server route is not registered in production (404 verified). Harmless but trivially tree-shakeable.

### CMP-1 High - No data-principal rights tooling
- Evidence: there is no route or UI to delete, export, or correct a student's data. `server/src/routes/roster.ts` offers only list and upsert (no delete). `submissions` rows (email, `submitted_at`) have no deletion path; `student_roster` rows can be removed only by SQL. No grievance officer, DPO, or Board-complaint route appears anywhere in the UI.
- DPDP: s.11 (access), s.12 (correction and erasure), s.13 (grievance redressal), s.8(7) (erase when purpose served).
- Fix: admin-only endpoints `GET /api/roster/:email/export` and `DELETE /api/roster/:email` (deletes `student_roster`, anonymises `submissions.email` via a one-way tombstone after batch close, purges `user_sessions`), audited. Add a grievance contact to the notice and a footer.

### CMP-2 High - Retention declared, not enforced; audit log un-purgeable
- THREAT-MODEL says responses 3 years, submissions batch + 90 days, roster "active batch lifecycle". No job, migration or script implements any of these. Only expired `user_sessions` are purged (`server/src/index.ts:136-147`).
- `audit_logs` is protected by triggers that raise on UPDATE, DELETE and TRUNCATE for everyone including the owner (`002_security.sql:88-104`). It keeps actor email and IP forever; deleting after 180 days (or on erasure) requires dropping the trigger in a migration, as the comment itself admits. CERT-In requires at least 180 days; DPDP requires erasure when no longer needed. Both need a controlled, partitioned retention path (e.g. monthly partitions, `DROP PARTITION` by a dedicated role, with an audit entry).
- Backups keep deleted personal data for up to 180 days (`deploy/backup/backup.sh:23`); this must be stated in the notice.
- Fix: add `retention.ts` scheduled task plus migration, document periods in the notice, partition `audit_logs`.

### CMP-3 Medium - Anonymity is weaker at rest than documented
- Docs claim "Linkage is impossible at the database engine layer" (AUDIT-REPORT 2.2).
- Evidence: `submit_feedback()` inserts the `submissions` row (with `submitted_at DEFAULT now()`, `001_init.sql:105-111`) and the `responses` row in the same transaction. Staging query: `submissions` and `responses` rows from the same call share the same `xmin` (e.g. 771 = 771); a join on `(session_id, xmin)` matched 795 pairs (many-to-many on seeded bulk inserts; a real one-student-per-transaction submit gives a 1:1 pair). Heap insertion order also matches `submitted_at` order, so a plain `pg_dump` (COPY emits heap order) of both tables lets a holder of a backup or DBA pair emails to answer rows by position, and the exact timestamp column sits next to them. `responses.id` is a random uuid (good) and `session_report()` shuffles for CC output, but that does not protect the storage layer.
- The in-app guarantees (RLS, no grant on `responses`, `submitted_at` ungranted) hold; the residual risk is a privileged insider or a stolen decrypted backup. Reduce the claim or fix it.
- Fix: write `responses` in a separate transaction after a random delay (or queue and batch-insert shuffled per session at close), drop `submitted_at` or round it to the day, dump with `ORDER BY random()` or `CLUSTER` the tables after close, and restate the claim as "not linkable through the application".

### CMP-4 Medium - Consent and notice quality
- Consent is a `localStorage` flag per browser/email (`src/auth.tsx:43-48,98-107`, already marked `ponytail:` "server-side record is still to do"). No server record, timestamp, notice version, or withdrawal. Clearing storage re-prompts; there is no evidence a given student consented. Staff (CC, admin) get no notice at all although their email, IP and activity are logged.
- Notice content gaps against DPDP s.5: fiduciary identity and contact, itemised data (email, PRN, name, IP, user agent, submission time), retention periods, how to exercise rights, grievance route and Data Protection Board route, language options (Eighth Schedule; the matrix claims "bilingual", the UI is English only).
- Contradictions: says "No third-party analytics or external CDNs" while Google sign-in and WhatsApp share exist; says "no timestamps" while `submissions.submitted_at` exists; "100% anonymous" while submission status is visible to CCs by name.
- Consent is a gate (cannot use the service otherwise), acceptable under legitimate use (s.7(b)-style, employment/education) arguments, but then say so; do not call it "consent" if it is a notice.
- Fix: server `consents(email, notice_version, accepted_at)` table (this is not part of anonymous data), notice versioning, Hindi/English text, rights and grievance paragraph.

### CMP-5 Medium - Cross-border processing
- `server/src/auth/routes.ts:101-139` redirects to `accounts.google.com` with scope `openid email profile` and then calls `oauth2.googleapis.com` and `googleapis.com/oauth2/v3/userinfo` from the server. Student email/name/profile are processed by Google (US infrastructure); the app only needs `email` and `email_verified`. DPDP s.16 allows transfer except to notified countries, but the notice must say it. The AUDIT-REPORT statement "100% of feedback data resides strictly on C-DAC campus" is about feedback data only; identity data transits Google.
- Also runs against `compliance-gov-norms.test.ts:174` "zero public internet egress", which only checks package dependencies.
- Fix: drop `profile` scope, disclose in notice, plan C-DAC/NIC SSO for the government deployment; note egress needs allow-listing on the DMZ firewall.

### CMP-6 Medium - Audit logging completeness
What is logged: LOGIN, LOGIN_FAILED (oauth/dev), LOGOUT, ROSTER_UPLOAD, SESSION_CREATE/FACULTY_UPDATE/SCHEDULE_UPDATE/DELETE, TABLE_CREATE/UPDATE/DELETE, FACULTY_CREATE, REPORT_VIEW. Rows carry actor, action, entity, details, IP, server timestamp.
Missing:
1. `ROSTER_UPLOAD` records only `{count}`; the upsert silently overwrites `prn`, `full_name`, `batch_id`, `centre_id`, `course_id` of existing students (`routes/roster.ts:84-99`). A cohort move or PII change cannot be reconstructed. Log emails (or hashes) and changed fields.
2. Authorization failures (401/403/404 on staff routes), cross-tenant attempts, CSRF/CORS blocks and rate-limit 429s are not audited, only in container stdout.
3. Report export (PDF/CSV is client-side; only `REPORT_VIEW` at fetch) and roster listing (bulk PII read) are not audited.
4. Session expiry and the role-revocation path in `getSession` (session deleted when roster row vanishes) emit no event; no user-agent in audit rows.
5. No integrity chain: the trigger stops the app role and owner statements but a superuser can disable it; there is no hash chain or off-host copy.
6. `req.ip` correctness depends on `TRUST_PROXY` (defaults to loopback/private ranges) - acceptable behind this nginx.
- Fix: extend `audit()` calls above, ship `audit_logs` rows nightly to the campus log server, and add a hash chain column if "tamper-evident" is to remain in the docs.

### CMP-7 Medium - Infra logs and time sync
- CERT-In direction (28 Apr 2022) requires logs of all ICT systems for 180 days within India, and NTP sync to NIC/NPL. Container logs are json-file 10 MB x 5 per service (`deploy/docker-compose.yml:6-9`), i.e. hours to days of nginx access logs under load. INCIDENT-RESPONSE admits forwarding is "not configured by this repo". nginx access logs carry client IP, path and UA, which is what CERT-In wants kept.
- NTP: `DEPLOYMENT-CHECKLIST.md:7` is an unchecked line "NTP synced". No chrony/timesyncd config in the repo. AUDIT-REPORT says it is documented in "DEPLOYMENT-CHECKLIST.md section 3.1"; there is no such section. Two different server names are cited (`ntp.nic.in` vs `samay1.nplindia.org`).
- Fix: add a log forwarder (rsyslog/Vector/Fluent Bit) to a retained store, host `chrony` config with NIC/NPL servers, and a monthly check.

### CMP-8 Medium - Incident response
- `docs/vapt/INCIDENT-RESPONSE.md` has a sensible 6-hour template and evidence steps, but CISO and system administrator are "to be named before go-live", there is no detection (alerts on LOGIN_FAILED bursts, 5xx, rate-limit), no log of who decided, and DPDP breach notification to the Board and affected principals is one sentence. Its note about role re-check "not yet implemented" is stale: `getSession` re-checks the roster each request (`server/src/auth/session.ts:46-57`).
- Fix: name owners, add alert rules, DPDP breach template, run a tabletop drill.

### CMP-9 Low - Children's data
- No DOB or age field; the programmes are post-graduate diploma courses so students are expected to be adults, but this assumption is not recorded and nothing prevents a minor email being rostered. DPDP s.9 (verifiable parental consent) would apply. Document the assumption in the DPIA and the roster upload guide.

### CMP-10 Medium - docs/vapt claims not backed by the implementation
| Document | Claim | Reality |
|---|---|---|
| AUDIT-REPORT header | "CLEARED FOR VAPT & PRODUCTION HOSTING", "ready for VAPT submission" | Same page says automated test status "Not current"; findings above (CL-2, CMP-1..3) contradict "all controls in place". |
| CONTROLS-MATRIX (DPDP) | "bilingual/English consent notice... detailing purpose limitation" | English only (`src/auth.tsx:111-141`), no retention or rights text. |
| CONTROLS-MATRIX (ASVS 4.1) | "`schema.sql` and 47 pgTAP tests" | No `schema.sql` and no pgTAP in the repo (migrations 001-003; vitest `rls-app-role.test.ts` has 11 tests). The 47 figure is left over from the Supabase version. |
| CONTROLS-MATRIX (Zero CDN) | fonts via `@fontsource/inter` | Not a dependency. CSS names "Fira Sans" with no font files, so the browser uses `system-ui`. (Zero external requests is true; verified.) |
| CONTROLS-MATRIX / AUDIT-REPORT | HSTS `max-age=63072000; includeSubDomains; preload`, `curl -I /healthz` returns CSP and `X-Frame-Options` | nginx sends HSTS without `preload`; `/healthz` and `/assets/*` blocks send only HSTS + nosniff (`deploy/nginx/nginx.conf`). Only the Fastify responses include preload. |
| CONTROLS-MATRIX (CERT-In 2(e)) | "180-Day Audit Logging... DB-enforced immutable" | Trigger exists and blocks owner, but no retention job, owner can drop trigger, infra logs not retained (CMP-2, CMP-7). Direction numbering labels (2(a), 2(b), 2(e)) are not verifiable against the 2022 text. |
| AUDIT-REPORT 2.1 | NTP "Documented systemd-timesyncd... DEPLOYMENT-CHECKLIST 3.1" | No section 3.1, no timesyncd config. |
| AUDIT-REPORT 2.2 | s.4/s.7 "Data Minimization", s.6 "Purpose Limitation", s.16 "Cross-border restrictions" | Section labels are inaccurate (s.4 grounds, s.6 consent, s.7 legitimate uses, s.8 duties, s.16 transfer outside India). "Linkage is impossible at the database engine layer" is not true (CMP-3). "100% on campus" ignores Google OAuth (CMP-5). |
| AUDIT-REPORT 2.1 | "Air-gap... zero external CDNs" tested by `compliance-gov-norms.test.ts` | Test only inspects package dependencies; Google OAuth egress exists in `server/src/auth/routes.ts`. |
| AUDIT-REPORT 4 | "36 automated test cases" (28 server + 8 front) | Repo now has 60 server and 8 frontend cases; not re-run. |
| SCOPE-AND-ASSETS | test accounts `student.ai.1@acts.cdac.in`, `cc.pune.ai@...`, `admin.acts@cdac.in` "provisioned in `server/src/db/seed.sql`" | Seed uses `student1@test.local`, `cc@test.local`, `cc.atc@test.local`, `admin@test.local`. |
| SCOPE-AND-ASSETS | "tamper-evident entries" | Append-only trigger only; no chain, no off-host copy. |
| THREAT-MODEL 1 | audit logs "App stdout -> Loki/ELK + pgAudit", retention 3 y / batch + 90 d | No Loki, ELK or pgAudit in repo; retention not implemented. |
| THREAT-MODEL 2.1 | "State/PKCE: target, being added"; "Non-rostered emails rejected with 403" | PKCE and state are implemented; the OAuth failure path redirects with a message (no 403). Update to avoid under-claiming. |
| THREAT-MODEL 2.x | "10 submits/min per user" rate limit | Actual: 240 req/min per session on all `/api`, 1500 per IP-less (`server/src/index.ts:112-114`); nginx 300 r/min. |
| INCIDENT-RESPONSE 2 | role re-check "not yet implemented" | It is implemented (`getSession`). |

---

## Compliance checklist

Legend: Met = implemented and evidenced; Partial = implemented but incomplete or unverified; Gap = missing.

### DPDP Act 2023
| Control | Status | Evidence |
|---|---|---|
| Notice before collection (s.5) | Partial | Students only, English only, incomplete: `src/auth.tsx:111-141`; CMP-4 |
| Consent record (s.6) | Gap | localStorage flag only, no server record/version/withdrawal: `src/auth.tsx:43-48`; CMP-4 |
| Purpose limitation | Partial | Stated in notice; RLS and report gating enforce it (`002_security.sql`, `session_report`); no technical block on secondary use of audit/roster data |
| Data minimisation | Partial | Roster holds email, PRN, name; auth requests `profile` scope unnecessarily (`auth/routes.ts:112`); `submitted_at` kept (CMP-3) |
| Anonymity of feedback | Partial | RLS, no grants on `responses`, k>=3, random order (compliance tests); weak at storage layer (CMP-3) |
| Security safeguards (s.8(5)) | Met | RLS forced, least-privilege app role, signed HttpOnly sessions, TLS 1.2+, encrypted backups, rate limits (`002_security.sql`, `nginx.conf`, `backup.sh`) |
| Breach notification to Board and principals (s.8(6)) | Gap | One sentence in `INCIDENT-RESPONSE.md:39`; no owner, template or process; CMP-8 |
| Retention and erasure when purpose served (s.8(7)) | Gap | Declared in THREAT-MODEL only; no job; audit log un-purgeable; CMP-2 |
| Right of access (s.11) | Gap | No export; CMP-1 |
| Correction and erasure (s.12) | Gap | No delete/correct path besides SQL and roster re-upload; CMP-1 |
| Grievance redressal (s.13) | Gap | No contact in UI or docs; CMP-1 |
| Children (s.9) | Partial | Adult cohort assumed, undocumented; CMP-9 |
| Cross-border (s.16) | Partial | Data at rest in India; Google OAuth and WhatsApp processing undisclosed; CMP-5 |
| Significant Data Fiduciary / DPO (s.10) | Partial | Probably not SDF; INCIDENT doc refers to a DPO that is not named |
| Processor agreements (hosting, Google) | Gap | None in repo |

### CERT-In directions (28 Apr 2022)
| Control | Status | Evidence |
|---|---|---|
| NTP sync to NIC/NPL | Gap | Checklist checkbox only; no config; CMP-7 |
| Report incidents within 6 hours | Partial | Template and CERT-In contacts in `INCIDENT-RESPONSE.md`; owners unnamed; no detection; CMP-8 |
| Retain ICT logs 180 days within India | Gap | nginx and API logs rotate at 10 MB x 5; forwarding not configured; CMP-7 |
| Application audit trail (180 days) | Partial | `audit_logs` append-only trigger (`002_security.sql:88-104`), tested in `rls-app-role.test.ts:150`; gaps in coverage and retention path; CMP-2, CMP-6 |
| Log fields: actor, action, source IP, time | Met | `lib/audit.ts` |
| Encrypted backup, restore drill | Met | `deploy/backup/backup.sh`, `restore-test.sh` |
| Vulnerability disclosure contact / security.txt | Gap | Not present |

### GIGW 3.0 / WCAG 2.1 AA
| Control | Status | Evidence |
|---|---|---|
| Language attribute (3.1.1) | Met | `<html lang="en">` |
| Skip link, landmarks, keyboard operation | Met | `src/App.tsx` skip link, `main`, scan shows no unnamed controls |
| Form labels, fieldset/legend (1.3.1, 3.3.2) | Met | `FeedbackForm.tsx:154-160`, scan found zero unlabeled controls |
| Colour contrast (1.4.3) | Partial | Two failures measured (CL-7) |
| Non-text contrast, focus ring (1.4.11, 2.4.7) | Partial | Focus ring brand-300 weak (CL-7) |
| Page titles (2.4.2) | Partial | Static title (CL-7) |
| Headings and structure (2.4.6) | Partial | Sessions page has no heading |
| Error identification (3.3.1) | Met | `role=alert` messages, toasts |
| Reduced motion | Met | `src/index.css` |
| Bilingual content (GIGW) | Gap | English only |
| Privacy policy, terms, accessibility statement, contact, footer | Gap | No footer |
| Third-party / external resources | Met | Zero external requests in browser capture |
| Automated axe run | Partial | Not executed (tool unavailable); heuristic scan only |

### OWASP Top 10 (2021)
| Item | Status | Evidence |
|---|---|---|
| A01 Broken access control | Met | Forced RLS, role guards, `vapt-security.test.ts`, `rls-app-role.test.ts`, see 02-authz-idor.md |
| A02 Cryptographic failures | Met | TLS 1.2/1.3, HSTS, signed cookies, SHA-256 token hashes at rest, AES backups |
| A03 Injection | Met | Parameterised SQL, zod, React escaping verified in browser (`<img onerror>` inert), CSV guard |
| A04 Insecure design | Partial | Strong anonymity design; storage linkage (CMP-3), no erasure (CMP-1) |
| A05 Security misconfiguration | Partial | Headers good; staging CORS/Origin mismatch (CL-2); missing headers on static blocks (CL-8) |
| A06 Vulnerable components | Gap | Not assessed here (no `npm audit` / SBOM evidence in repo) |
| A07 Identification and auth failures | Partial | Google OAuth with state and PKCE, roster re-check per request, server-side revocation; no idle timeout, logout failure mode (CL-2) |
| A08 Software and data integrity | Partial | Lockfile and CI; no SRI needed (same origin); no signed images |
| A09 Logging and monitoring | Partial | CMP-6, CMP-7 |
| A10 SSRF | Met | Server fetches only fixed Google URLs |

### OWASP ASVS 4.0 Level 2 (selected)
| Area | Status | Evidence |
|---|---|---|
| V1 Architecture, threat model | Partial | `docs/THREAT-MODEL.md` exists but is partly stale |
| V2 Authentication | Partial | Delegated to Google; no MFA enforcement controlled by app; V2.10 service creds in env |
| V3 Session management | Partial | HttpOnly, SameSite=Lax, Secure in prod, hashed ids, TTL; no idle timeout; logout not verified end-to-end (CL-2) |
| V4 Access control | Met | RLS plus guards |
| V5 Validation, sanitisation | Met | zod, UUID checks, body limits, CSV guard |
| V7 Error handling and logging | Partial | Generic 5xx; log coverage (CMP-6); CORS 500 (CL-3) |
| V8 Data protection (client) | Partial | Plaintext drafts in localStorage (CL-1); `no-store` on APIs but not on shell (CL-5) |
| V9 Communications | Met | TLS 1.2+ only, HTTP redirects to HTTPS |
| V10 Malicious code / V12 files | Met | No dynamic code; CSV upload parsed client-side, JSON posted |
| V13 API | Met | JSON only, limits, rate limits |
| V14 Configuration | Partial | Headers (CL-8), CORS mismatch (CL-2), no dependency audit evidence |
