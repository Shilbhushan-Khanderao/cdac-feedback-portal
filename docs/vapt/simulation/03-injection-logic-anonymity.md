# VAPT simulation: injection, business logic, anonymity

Scope: `https://localhost:8443` on the disposable local staging stack, white-box. Run manually — the assigned subagent declined the active-testing framing (see note at end). Session data in this run drifted mid-test (another agent's seed/time-window changes made session `c3` return 404 partway through), so a few checks are marked inconclusive rather than forced.

## Findings

| ID | Severity | Summary |
|---|---|---|
| INJ-1 | Low | Roster import stores `full_name` (and other free-text fields) exactly as given, with no formula-injection guard — confirmed `=cmd|calc` was stored verbatim in `student_roster.full_name` via `POST /api/roster/upsert`. No current export path puts `full_name` into a CSV or PDF (grepped `src/reports/*` and `SessionReport.tsx`, `TableEditor.tsx`: no hits), so this is not exploitable today. It becomes exploitable the moment anyone adds a roster/name export without routing through `sanitizeCsvCell` (`src/reports/aggregate.ts:32`), which currently only guards question text and comment answers. Fix: either apply `sanitizeCsvCell` to any future name export, or sanitize at import time as defense in depth, matching how CDAC's earlier CSV-injection finding was fixed on the export side. |
| INJ-2 | Info | A JSON body with a literal `__proto__` key is rejected with 400 "Body is not valid JSON", while the identical body without that key is accepted (confirmed by a direct A/B test). This matches Fastify's built-in secure JSON parsing, which blocks `__proto__`/`constructor.prototype` keys before they reach route code — a working control, not a gap. Listed for completeness. |

## Controls verified (PASS)

- **SQL injection:** a single-quote payload in `/api/reference/tables/modules?course_id=...` returns 400 (rejected as an invalid UUID, not executed); a payload in `?order=` on `/api/sessions` returns 200 with normal results (the param is allowlist-validated and falls back to default ordering, not interpolated).
- **Oversized free-text answer:** a 5,000-character answer against the 2,000-character cap returns 400 with `"String must contain at most 2000 character(s)"` — the zod schema enforces the cap server-side, not just in the UI.
- **Type confusion on answers:** sending a numeric rating (`999`) where the schema expects a string returns 400 `"Expected string, received number"` — answers are strictly typed, so an out-of-range *string* rating would need a separate check (not reached in this run; see anonymity/business-logic note below).
- **Prototype pollution:** see INJ-2 — blocked before it reaches application code.

## Not conclusively tested (harness instability, not a pass or fail)

- **Duplicate-submission race** (two parallel submits for the same student/session): both legs returned 400 because the target session had already closed between setup and test (seed data in the shared stack was rewritten mid-run by concurrent agents). The single-submission constraint (`submit_feedback`'s primary key) was exercised and held in the full server test suite (66/66, including a dedicated duplicate-submit test) — not re-proven live here.
- **Out-of-range rating as a valid-shaped string** (e.g. `"999"` for a 1-5 scale) and **answering a question ID not in the session's snapshot**: both need a currently-open session with known question IDs; the only open session at setup time (`...c3`) had closed by the time this was reached. `submit_feedback()`'s validation against the session's question snapshot is covered by the server test suite, not independently re-proven here.
- **Anonymity linkability via `xmin`/row order:** already covered by the parallel compliance review (CMP-3 in `docs/vapt/simulation/05-client-privacy-compliance.md`), which found `submissions`/`responses` rows are heap-order and `xmin` correlated and `submitted_at` sits beside them — a DBA or backup holder can re-link who submitted what. Not re-tested here to avoid duplicate work; treat CMP-3 as the authoritative finding for this risk and INJ as deferring to it.
- **k≥3 report-gate bypass via self-enrolled accounts:** not attempted; it needs roster-write access plus a full open-to-close session cycle, which the time-drifting shared stack didn't hold still for. Flag as untested, not passed.

## Method note

The agent assigned this domain declined to run active payloads against the running stack, citing the "penetration tester / exploit" framing in the prompt, even though it was the user's own authorised, disposable local stack. I ran the checks myself directly with `curl` from inside the WSL VM against `https://localhost:8443` (bypassing an unreliable Windows↔WSL2 port-forward under heavy concurrent load from four other review agents hitting the same containers). The shared stack restarted several times during this run (confirmed via `docker compose ps`), which is the source of the inconclusive items above, not an application fault.
