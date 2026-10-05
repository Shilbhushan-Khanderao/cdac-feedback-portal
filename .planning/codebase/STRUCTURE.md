---
last_mapped_commit: b4f4d79f15ec1cb0b0dc15d9e97406c94f6650c0
last_mapped_at: 2026-10-05
---
# Directory & Codebase Structure

```
cdac-feedback-portal/
├── .agents/                    # GSD Core, Ponytail, and Caveman agent skills & MCP config
├── .planning/                  # GSD spec-driven development memory (PROJECT, ROADMAP, STATE, codebase maps)
├── deploy/                     # On-campus production deployment assets
│   ├── docker-compose.yml      # Multi-container orchestration (db, api, nginx, backup)
│   ├── Dockerfile.server       # Hardened Node.js 22 LTS Alpine multi-stage Dockerfile
│   ├── nginx/
│   │   └── nginx.conf          # Hardened Nginx configuration with rate limits and CSP
│   └── backup/
│       ├── backup.sh           # AES-256 encrypted pg_dump with 180-day retention
│       └── restore-test.sh     # Automated backup restore drill script
├── docs/                       # Compliance & architecture documentation
│   ├── THREAT-MODEL.md         # STRIDE threat model & data classification
│   └── adr/
│       └── 0001-fastify-pg-dmz-architecture.md
├── server/                     # Fastify 5 API backend
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts            # Fastify application entry point & middleware
│       ├── config.ts           # Zod-validated environment config
│       ├── auth/
│       │   ├── guard.ts        # requireAuth, requireStaff, requireAdmin hooks
│       │   ├── routes.ts       # /auth/whoami, /auth/logout, /auth/dev-login, /auth/google
│       │   └── session.ts      # Database-backed session generator & cleanup
│       ├── db/
│       │   ├── pool.ts         # pg.Pool with withUser context injection
│       │   ├── migrate.ts      # Schema migration runner
│       │   ├── schema.sql      # Consolidated PostgreSQL 16 schema + pgAudit + RLS
│       │   └── seed.sql        # Reference master data & test rosters
│       ├── routes/
│       │   ├── reference.ts    # Centres, courses, modules, batches, faculty, tables
│       │   ├── sessions.ts     # Feedback sessions CRUD & cohort filtering
│       │   ├── feedback.ts     # Submissions tracking & submit RPC
│       │   ├── reports.ts      # Dashboard metrics & anonymized session report
│       │   └── roster.ts       # Student roster management & CSV upload
│       └── tests/
│           └── server.test.ts  # Vitest test suite for API endpoints
├── src/                        # React 19 Frontend
│   ├── App.tsx                 # Route definitions and layout shell
│   ├── auth.tsx                # AuthGate, login screens, and DPDP Consent Modal
│   ├── index.css               # Tailwind CSS v4 design tokens and base styles
│   ├── lib/
│   │   ├── api.ts              # Native typed fetch client replacing supabase-js
│   │   ├── format.ts           # Date, time, and text formatting utilities
│   │   ├── palette.ts          # Color-blind safe report charts palette
│   │   └── reference.ts        # TanStack query hooks for master reference data
│   ├── pages/
│   │   ├── DashboardPage.tsx   # Coordinator/Admin feedback overview
│   │   ├── FeedbackForm.tsx    # Student submission questionnaire
│   │   ├── ManagePage.tsx      # Admin setup for centres, batches, courses, modules
│   │   ├── RosterPage.tsx      # Coordinator student roster CSV uploader
│   │   ├── SessionReport.tsx   # Detailed chart and NLP comment analysis report
│   │   ├── SessionsPage.tsx    # Session scheduling table
│   │   └── StudentHome.tsx     # Student pending & completed sessions list
│   └── reports/                # Report generation, NLP sentiment, and PDF renderer
├── index.html                  # HTML entry point (Zero external font/CDN links)
├── package.json                # Root package configuration with server scripts
└── AGENTS.md                   # Ponytail + GSD rules for AI pair programming
```
