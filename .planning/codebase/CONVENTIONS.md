---
last_mapped_commit: b4f4d79f15ec1cb0b0dc15d9e97406c94f6650c0
last_mapped_at: 2026-10-05
---
# Coding Conventions & Development Rules

## Ponytail "Lazy Senior Dev" Rules

1. **YAGNI First**: Does this feature or abstraction need to exist? If not, skip it.
2. **Reuse Existing**: Always check existing utils (`src/lib/format.ts`, `server/src/db/pool.ts`) before adding new helpers.
3. **Stdlib & Platform Over Dependencies**: Prefer native fetch, Web Crypto / Node crypto, and native HTML tags (`<input type="date">`) over third-party packages.
4. **Shortest Working Diff**: Make surgical, root-cause edits instead of patching multiple callers.
5. **No Slop**: When cutting a deliberate corner, mark it with `# ponytail: <reason> <upgrade-path>`.

## Security & Compliance (Non-Negotiable)

1. **Parameterized Queries**: Never concatenate SQL strings. All queries must pass parameters through `$1, $2, ...`.
2. **Validation**: All API endpoints must parse inputs through Zod schemas.
3. **Anonymity Defense**: Never add an email, student ID, or timestamp column to `responses`.
4. **Audit Trail**: Every roster change, admin configuration edit, and login must write a row to `audit_logs`.
5. **Air-Gapped Operation**: No references to Google Fonts, external CDNs, or foreign APIs.
