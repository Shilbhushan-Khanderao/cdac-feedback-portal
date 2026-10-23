# Next version: comment insights and AI

Status: planned for the phase after go-live (written 2026-10-23). Shared copy for review:
[Claude Docs](https://claude.ai/artifact/XTwcbYhSUpufVPXMz3gTwj). This file is the reference for
development; update it when decisions in [Open decisions](#open-decisions) are made.

## Summary

The next version turns student comments from a list to read into signals a coordinator can act on:
recurring themes, flagged problems, filtered abuse and protected identities, plus an optional
on-server AI summary. It needs about 4 to 6 working days of build, plus testing and review time from
C-DAC staff.

Every feature keeps today's anonymity rules: results only for closed sessions with at least 3
answers, and nothing linked to a student.

## Where things stand today

| Area | What the current version does |
| --- | --- |
| Session report | Pie charts per question, all comments in random order, PDF and CSV download |
| Dashboard actions | Low-turnout and closing-soon sessions, ratings below 3.0, hidden results, modules with no session yet |
| Dashboard insights | Score per question with the weakest area, module, faculty and centre tables, rating trend |
| Comment insights | Positive / neutral / negative share, most mentioned phrases, sample comments with repeats counted |
| Export | Dashboard summary PDF of the filtered view |

The comment tone is word-based (AFINN via `sentiment`), so it misreads some sentences: "syntax error
analysis was done very well" counts as negative because of "error". Themes and, optionally, AI address
this.

## Planned features

Built in this order: the two that protect people first, then the three that add insight.

| # | Feature | What the user gets | How it works |
| --- | --- | --- | --- |
| 1 | Strip personal details | Phone numbers, emails and PRNs typed into a comment never reach staff | Masked on the server when an answer is submitted, and when older answers are read |
| 2 | Abuse filter | Abusive comments and personal attacks on faculty are hidden; staff see "1 comment hidden" | A word list (English, Hinglish, Hindi, Marathi) checked on the server, so hidden text never reaches the browser |
| 3 | Theme tagging | "Lab and practicals: 18 mentions, mostly negative" on the dashboard and session report | Each comment is matched to themes such as Pace, Explanation, Lab, Doubt solving, Assignments, Infrastructure, Material, Punctuality; admins edit the keyword lists in Setup |
| 4 | Problem flags | "3 comments raise a lab issue in DBT, Mumbai" in What to do next, linking to the session | A negative comment that matches a theme becomes an action item |
| 5 | Compare with previous batch | "Pace complaints: 12 to 4" per module and theme | Theme counts for the current batch next to the previous batch of the same course and centre |

The keyword and word lists matter more than the code. They start as an English and Hinglish draft and
need about an hour of review by a coordinator who knows how students write.

## AI integration

Recommendation: run a small open model on a C-DAC server, not an external AI service, so no student
comment leaves C-DAC infrastructure.

What AI adds:

- A written summary per session and per module, for example: "Students liked the hands-on labs;
  several found the pace fast; many asked for more practice problems."
- Better tone and theme detection than word lists.
- Suggested actions for a coordinator, which stay suggestions to review, never automatic changes.
- A batch-end narrative for the management PDF.

| Option | Data leaves C-DAC | Hardware | Running cost | Fit |
| --- | --- | --- | --- | --- |
| On-server open model (for example Llama or Qwen, 7 to 8 billion parameters, through Ollama) | No | 16 GB RAM on CPU (slow, about 30 to 60 s per summary), or a GPU with 8 GB or more | None beyond the server | Recommended |
| C-DAC's own AI platform, if one exists internally | No | Provided by that platform | Internal | Worth asking IT |
| External API (OpenAI, Google, Anthropic) | Yes | None | Pay per use | Not recommended: DPDP and VAPT concern |

How it would run:

- Only on closed sessions with at least 3 answers, after personal details are stripped and abuse is
  filtered.
- As a background job after a session closes, so pages stay fast; the summary is stored and shown on
  the report and dashboard.
- Labelled "AI-generated summary" with the comments beside it, so staff can check it.

Risks:

- A model can state things the comments do not say. Mitigation: short summaries, the source comments
  always next to them, and a "Report a wrong summary" link.
- Hindi and Marathi comments are handled less well by small models.
- A CPU-only server makes summaries slow; acceptable for a background job, not for on-demand use.

## Privacy and compliance rules

Every feature in this phase must pass these rules; a server test checks each one before release.

1. **No link to a student.** Answers and comments are never stored or shown with a student's name,
   email, PRN or submission time.
2. **Minimum of 3.** Nothing from a session is shown or processed, by code or AI, until it is closed
   and has at least 3 answers.
3. **Server-side only.** Masking, filtering and AI run on the server; hidden text never reaches the
   browser.
4. **Data stays at C-DAC.** No comment is sent to a service outside C-DAC infrastructure (DPDP Act
   2023).
5. **Audited.** Bulk reads, AI runs and changes to word lists are recorded in the audit log, kept 180
   days or more (CERT-In).
6. **Consent notice kept true.** If AI summaries go live, the student consent notice gets one line
   saying comments may be summarised automatically on C-DAC servers.
7. **Not used for individual decisions.** Themes and AI summaries support teaching review; they are
   never the sole basis for a decision about a named faculty member.

## Effort and timeline

About 4 to 6 working days of build in total, plus 2 to 3 days of testing and word-list review; each
part goes to staging as soon as it is done.

| Order | Work | Build effort | Depends on |
| --- | --- | --- | --- |
| 1 | Strip personal details | 0.5 day | None |
| 2 | Abuse filter | 1 day | Word list review |
| 3 | Theme tagging, with editable keyword lists in Setup | 1 day | Keyword review |
| 4 | Problem flags | 0.5 day | Theme tagging |
| 5 | Compare with previous batch | 0.5 day | Theme tagging |
| 6 | Review, phone checks, docs, deploy | 0.5 day | All of the above |
| 7 | AI summaries (on-server model, background job, labels) | 1.5 to 2 days | Hosting decision and hardware |

What can stretch this: waiting on word-list review, and for AI, getting a server with enough memory
or a GPU. Themes and flags are best judged after a real batch has submitted comments, since seed data
repeats the same few lines.

## Implementation notes (for developers)

Follow `CLAUDE.md`: schema changes in a new migration under `apps/api/src/db/migrations/` (next is
`007_…`), a server test for every new policy or function, `responses` never gets a student column or
timestamp, and nobody selects `responses` directly.

- **Read paths that return comments:** `session_report()` (001) and `dashboard_insights()` (006).
  Masking (1) and the abuse filter (2) must apply in both, so neither path can leak what the other
  hides. A shared SQL function such as `clean_comment(text)` called from both keeps them in step.
- **Write path:** `submit_feedback()` (001) is the only writer of `responses`; mask personal details
  there for new answers. Keep the read-time mask too, for answers stored before the change.
- **Word lists and themes:** new tables (`comment_themes`, `theme_keywords`, `blocked_terms`) with
  admin-only RLS, edited through the existing Setup table editor (`apps/web/src/shared/TableEditor.tsx`,
  `apps/web/src/features/admin/ManagePage.tsx`); changes are audited like other table edits.
- **Hidden-comment count:** return it as a number per question (for "1 comment hidden"), never the
  hidden text.
- **Theme counts and flags:** compute in SQL alongside `dashboard_insights()` so the k >= 3 gate is the
  same; the front end adds `Action` kinds in `apps/web/src/features/dashboard/insights.ts` and renders
  them in `Attention.tsx`.
- **Existing comment analysis:** `apps/web/src/features/reports/CommentAnalysis.tsx` (`analyze()`) is
  reused by the dashboard; extend it rather than add a second analyser.
- **AI:** a separate worker service in `deploy/docker-compose.yml` on `internal_net` only, no published
  port, no outbound internet. It reads eligible sessions through a SECURITY DEFINER function with the
  same gate, writes summaries to a new table, and audits each run. Any new secret goes in
  `deploy/.env.example` and compose with `${VAR:?}`.

## Open decisions

- [ ] Who at C-DAC reviews the theme keywords and the abuse word list (about 1 hour)?
- [ ] Which languages to cover besides English and Hinglish: Hindi, Marathi, others?
- [ ] AI hosting: an on-server model, or an internal C-DAC AI platform if one exists?
- [ ] Hardware for AI: can IT provide 16 GB RAM, or a GPU with 8 GB or more, on this host or another?
- [ ] Who sees AI summaries: coordinators and admins only, or faculty too (faculty have no login today)?
- [ ] Is the consent notice update for AI approved by the data protection officer?
