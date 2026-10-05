---
last_mapped_commit: b4f4d79f15ec1cb0b0dc15d9e97406c94f6650c0
last_mapped_at: 2026-10-05
---
# Technical Concerns & Future Risks

## 1. Google OAuth Approval & Enterprise Network Restrictions

- **Risk**: The campus network or security policy may block external Google authentication endpoints.
- **Mitigation**: The auth module in `server/src/auth/` is isolated behind standard interfaces. If required, C-DAC LDAP / Keycloak or email OTP can replace Google OAuth without modifying frontend session handling.

## 2. CERT-In 180-Day Log Storage Sizing

- **Risk**: Uncompressed debug logs could exhaust DMZ disk partitions over 180 days.
- **Mitigation**: Log levels in production default to `info`. Fastify redacts authorization tokens and cookie contents. Automated logrotate compresses logs daily, requiring an estimated 20–50 GB partition.

## 3. High-Concurrency Submission Spikes

- **Risk**: 700+ students submitting simultaneously at the conclusion of a session.
- **Mitigation**: Stored procedure `submit_feedback` performs a fast, single-transaction insert into `submissions` and `responses`. Connection pool sized to 20 connections; Nginx rate limits set to 120 req/min with burst buffer of 30.
