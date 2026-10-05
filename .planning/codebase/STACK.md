---
last_mapped_commit: b4f4d79f15ec1cb0b0dc15d9e97406c94f6650c0
last_mapped_at: 2026-10-05
---
# Technology Stack

## Frontend (Client Layer)

- **Framework**: React 19.3.0 with TypeScript ~5.9.3
- **Build Tool**: Vite 8.3.1 with `@vitejs/plugin-react`
- **Styling**: Tailwind CSS v4.3.3 (Zero CDN dependencies, self-hosted fonts)
- **State & Data Fetching**: TanStack React Query v5.104.0
- **Routing**: React Router v8.4.0 (`createHashRouter`)
- **Reporting & Visualizations**: Recharts v3.10.1, Sentiment v5.0.2, Compromise v14.17.0, `@react-pdf/renderer` v4.9.0 (lazy loaded)
- **UI Feedback**: Sonner v2.0.8

## Backend (API Layer)

- **Runtime**: Node.js 22 LTS
- **Server Framework**: Fastify 5.2.1
- **Validation**: Zod 3.24.2 on all request boundaries
- **Security Middleware**:
  - `@fastify/helmet` (strict CSP, HSTS, frameguard, nosniff)
  - `@fastify/cookie` (signed HttpOnly session cookies)
  - `@fastify/cors` (whitelisted origin credentials)
  - `@fastify/rate-limit` (DoS & brute-force defense)
- **Database Driver**: `pg` 8.13.3 (parameterized connection pooling)

## Database Layer

- **Engine**: PostgreSQL 16
- **Extensions**: `citext` (case-insensitive emails), `pgcrypto` (UUID generation), `pgAudit` (180-day compliance logging)
- **Access Model**: Row-Level Security (RLS) + Stored Procedures (`submit_feedback`, `session_report`, `dashboard_data`)

## Infrastructure & Edge

- **Reverse Proxy**: Nginx Alpine with rate-limiting zones
- **Web Application Firewall (WAF)**: Coraza WAF with OWASP Core Rule Set (CRS v4)
- **Containerization**: Docker Compose / Rootless Podman
- **Backup Engine**: OpenSSL AES-256-CBC encrypted `pg_dump` with automated 180-day retention pruning
