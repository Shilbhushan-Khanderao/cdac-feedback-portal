---
last_mapped_commit: b4f4d79f15ec1cb0b0dc15d9e97406c94f6650c0
last_mapped_at: 2026-10-05
---
# External & System Integrations

## Authentication Providers

- **Google OAuth 2.0**:
  - Implements authorization code grant with PKCE (`/auth/google` and `/auth/google/callback`).
  - Pre-callback validation against `staff_roster` and `student_roster`.
- **Planned C-DAC Keycloak / LDAP SSO**:
  - Modular auth service structure allows swapping Google OAuth with campus Keycloak / LDAP identity provider with zero database schema alterations.

## Logging & Monitoring Integrations

- **Structured JSON Logging**:
  - Fastify and Nginx emit RFC 5424 compliant structured JSON logs.
  - Formatted for direct ingestion by campus Loki or ELK stack for CERT-In 180-day compliance.
- **NTP Time Synchronization**:
  - System host and container clocks synced with National Physical Laboratory (NPL) / National Informatics Centre (NIC) NTP servers (`time.nic.in`).

## Reverse Proxy & WAF

- **Nginx with Coraza WAF**:
  - Integrates OWASP Core Rule Set (CRS v4) to filter common web injection and malicious payload patterns before requests reach the Node.js runtime.
