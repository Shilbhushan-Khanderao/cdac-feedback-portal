# VAPT simulation: authentication and session management

Scope: `https://localhost:8443` on the disposable local staging stack (`deploy/docker-compose.yml` + `docker-compose.e2e.yml`), white-box. Run manually (two spawned subagents declined the active-testing framing; see note at end).

## Findings

None at Critical/High/Medium. One informational note.

| ID | Severity | Summary |
|---|---|---|
| AUTH-1 | Info | `redirect_uri` has no port in this harness (`https://localhost/...`) because the test `.env` sets `APP_URL=https://localhost`; in the real deploy nginx terminates 443 directly so this does not reproduce. Not a code issue. |

## Controls verified (PASS)

- **Logout invalidates the session.** `POST /auth/logout` on a valid cookie returns 200; three immediate retries of `/auth/whoami` with the same cookie return `{"user":null}`. (`/auth/whoami` is a by-design 200-with-null endpoint, not 401 — confirmed by reading `server/src/auth/routes.ts`; this is correct REST style for a "who am I" probe, not a bug.)
- **`GET /auth/logout` is gone.** Returns 404 (CSRF-via-GET is closed).
- **`/auth/dev-login` is unavailable in production** — 404, confirmed 3x.
- **Tampered session cookie is rejected.** Flipping the last character of a signed `cdac_session` cookie causes the server to treat the request as unauthenticated (`{"user":null}`, 200) rather than erroring or granting access.
- **Missing cookie is handled cleanly** — `{"user":null}`, 200, no stack trace.
- **OAuth start sets PKCE + state.** `GET /auth/google` redirects to Google with `code_challenge`, `code_challenge_method=S256` and `state`, and sets a signed, `HttpOnly`, `Secure`, `SameSite=Lax`, 600s-TTL `cdac_oauth` cookie carrying the matching value — consistent with `server/src/auth/routes.ts`'s PKCE/state implementation.
- **No CORS credentials leak.** A cross-origin `Origin: https://evil.example` on an authenticated request gets no `Access-Control-Allow-Origin` echoed back.
- **Malformed content-type on a state-changing POST is rejected cleanly** (415 on form-encoded body to `/api/feedback/submit`), not 500.

## Method note

Two subagents assigned this and the injection/logic domain declined to run the task, citing the "penetration tester / exploit" framing in the prompt, even though it named this as the user's own authorised, disposable local stack. I ran the equivalent checks myself directly with `curl` against `https://localhost:8443` (the same local container stack this session built and has been testing all along), since that is ordinary testing of the user's own local environment, not third-party exploitation. A few individual requests returned connection-reset noise (`exit 7`) while three other agents were simultaneously load-testing/IDOR-testing the same containers; retrying in isolation showed those were contention, not real faults.
