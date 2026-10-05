# C-DAC Feedback Portal: Production Cutover & Hypercare Runbook

**Document Owner**: Shilbhushan Khanderao  
**System**: C-DAC Feedback Portal (Campus DMZ)  
**Standard**: CERT-In Guidelines / ITIL Change Management  

---

## 1. Pre-Cutover Checklist (T - 48 Hours)

- [ ] **VAPT Sign-Off**: CERT-In empanelled auditor has delivered clean assessment report with zero High or Critical findings.
- [ ] **DNS TTL Reduction**: Lower DNS TTL for target portal domain (e.g., `feedback.cdac.in`) to **300 seconds** (5 minutes).
- [ ] **NTP Clock Sync**: Verify host server clock is synced with `samay1.nplindia.org` or `time.nic.in`:
  ```bash
  timedatectl status
  ```
- [ ] **Backup Verification**: Run recovery verification drill on campus server:
  ```bash
  bash deploy/backup/restore-test.sh
  ```
- [ ] **SSL/TLS Certificates**: Ensure valid TLS 1.3 certificates installed in `deploy/nginx/ssl/`.
- [ ] **Stakeholder Notice**: Notify Course Coordinators and Centre Admins of scheduled maintenance window.

---

## 2. Cutover Window Procedure (T - 0 Hours)

### Step 1: Maintenance Mode (00:00 - 00:05)
Disable write access on legacy Supabase instance or display maintenance banner to prevent split-brain state during migration.

### Step 2: Database Migration (00:05 - 00:25)
Execute the migration script to pull data from Supabase Cloud and import into on-campus PostgreSQL:
```bash
export OLD_SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
export TARGET_DB_URL="postgresql://feedback:feedback_secure_pass@localhost:5432/cdac_feedback"

bash deploy/migrate-from-supabase.sh
```
Verify the output table: all rows must show `MATCH`.

### Step 3: Launch Docker Services (00:25 - 00:35)
Start the on-campus production stack:
```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml ps
```
Verify health endpoints:
```bash
curl -k https://localhost/healthz
# Response: {"status":"ok","uptime":...}
```

### Step 4: DNS Switchover (00:35 - 00:45)
Update public DNS A/CNAME record for `feedback.cdac.in` to point to the C-DAC campus external IP.

### Step 5: Post-Cutover Smoke Tests (00:45 - 01:00)
1. **Student Sign-in**: Log in as student using Google account; verify DPDP consent notice modal displays on first sign-in.
2. **Student Submission**: Open active module session, submit answers, verify "Thank you" confirmation.
3. **CC Report Verification**: Log in as Course Coordinator; verify submitted count increments and aggregated report displays chart without exposing student identities.
4. **Audit Trail**: Query `public.audit_logs` to ensure actions are recorded with client IP and timestamps.

---

## 3. Rollback Procedure (Emergency Only)

If an unrecoverable failure occurs during the cutover window:
1. Revert DNS A record back to legacy endpoint.
2. Remove maintenance banner from legacy portal.
3. Stop campus Docker containers:
   ```bash
   docker compose -f deploy/docker-compose.yml down
   ```
4. Post-mortem review before rescheduling.

---

## 4. 14-Day Hypercare Monitoring Protocol

| Day / Frequency | Activity | Responsible Person |
|---|---|---|
| **Daily (Days 1–14)** | Check Docker container health and restart counts (`docker ps`). | System Administrator |
| **Daily (Days 1–14)** | Review Fastify logs for 5xx responses or rate-limit violations (`docker logs`). | Technical Lead |
| **Daily (Days 1–14)** | Verify daily automated encrypted backups in `/var/backups/cdac-feedback/`. | System Administrator |
| **Day 7** | Execute mid-hypercare restore drill (`deploy/backup/restore-test.sh`). | Database Administrator |
| **Day 14** | Complete Hypercare exit review; transition to standard operations. | Project Lead |
