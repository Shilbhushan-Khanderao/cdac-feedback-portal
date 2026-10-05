# Requirements: C-DAC Feedback Portal

## Functional Requirements

### Authentication & Authorization
- **AUTH-01**: The system shall authenticate users via OAuth2 PKCE and issue an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie.
- **AUTH-02**: The system shall reject any user not registered on `staff_roster` or `student_roster` before creating a session (pre-callback roster gate).
- **AUTH-03**: The system shall enforce role-based access control across `student`, `cc` (Course Coordinator), and `admin`.
- **AUTH-04**: Course Coordinators shall only view or schedule sessions belonging to their assigned centre and course.

### Feedback Collection & Anonymity
- **ANON-01**: The `responses` table shall never contain a student identifier, email, or submission timestamp.
- **ANON-02**: The `submissions` table shall record student completion receipts solely to prevent duplicate submissions per session.
- **ANON-03**: The system shall reject feedback submission attempts outside the session's active `[opens_at, closes_at]` window.
- **ANON-04**: Free-text feedback comments shall be returned in randomized order (`ORDER BY random()`) on reporting.
- **ANON-05**: Feedback reports shall suppress rating aggregations and comments if the session has fewer than 3 responses ($k \ge 3$).

### Compliance & Auditability
- **COMP-01**: The system shall maintain an append-only audit log (`audit_logs`) tracking administrative changes, roster uploads, and logins for at least 180 days per CERT-In requirements.
- **COMP-02**: The system shall display a DPDP Act 2023 consent notice explaining purpose, retention, and rights before students submit feedback.
- **COMP-03**: Server and database clocks shall be synchronized with standard Indian NTP servers (NIC/NPL).
- **COMP-04**: Database backups shall be encrypted using AES-256-CBC and rotated with automated 180-day retention policies.

## Non-Functional Requirements

### Performance & Scalability
- **PERF-01**: The system shall sustain 700+ simultaneous student submissions within a 10-second window with zero errors.
- **PERF-02**: API response time for submission RPC shall not exceed 100ms under normal load.

### Security (OWASP ASVS Level 2)
- **SEC-01**: Content Security Policy shall prohibit external inline scripts and foreign fonts (`default-src 'self'`).
- **SEC-02**: All database interactions shall use parameterized SQL queries with zero string interpolation.
- **SEC-03**: Reverse proxy and API shall enforce rate limits to protect against brute-force and DoS attacks.
