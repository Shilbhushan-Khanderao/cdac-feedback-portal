# CERT-In Mandatory Incident Response & Log Preservation Runbook

**Compliance Mandate**: CERT-In Cyber Security Directions (Section 70B(6) Information Technology Act 2000)  
**Reporting Window**: Mandatory reporting within **6 hours** of detecting a cybersecurity incident.  
**Jurisdiction**: Strictly within the territory of India.  

---

## 1. Incident Reporting Channel & Contacts

- **CERT-In Reporting Email**: `incident@cert-in.org.in`
- **Help Desk (Toll Free)**: `1800-11-4949`
- **Online Portal**: `https://www.cert-in.org.in`
- **C-DAC Chief Information Security Officer (CISO)**: To be populated with designated campus CISO details.

---

## 2. Immediate 6-Hour Triage & Notification Procedure

Upon identification of an incident (unauthorized data access, denial of service, database compromise, integrity alteration, or credential compromise):

### Step 1: Containment (0 - 1 Hour)
- Do NOT delete or reboot host machine immediately; preserve RAM and disk state if forensic analysis is required.
- If network-level attack, isolate host at campus firewall / switch VLAN.
- Take immediate snapshot of PostgreSQL volume and Docker container logs:
  ```bash
  # Snapshot current audit logs
  docker compose -f deploy/docker-compose.yml exec -T db pg_dump -U feedback -t public.audit_logs cdac_feedback > incident_audit_$(date +%Y%m%d_%H%M%S).sql
  
  # Archive Docker container logs
  docker compose -f deploy/docker-compose.yml logs --timestamps > incident_docker_logs_$(date +%Y%m%d_%H%M%S).log
  ```

### Step 2: CERT-In Notification Email Template (Within 6 Hours)
Send to `incident@cert-in.org.in` with CC to internal C-DAC security team:

```text
To: incident@cert-in.org.in
Subject: Incident Report: Cyber Incident on C-DAC Feedback Portal (C-DAC Campus)

1. Name of Organisation: Centre for Development of Advanced Computing (C-DAC)
2. Contact Person & Details: [C-DAC System Administrator / CISO Name, Phone, Email]
3. Type of Incident: [e.g., Unauthorized Access Attempt / Denial of Service / SQL Injection Probe]
4. Date and Time of Incident Detection (IST): [YYYY-MM-DD HH:MM:SS IST]
5. Affected Asset / URL: https://feedback-portal.cdac.in / IP: [Campus Public IP]
6. Perimeter Controls in Place: Campus Firewall, Nginx WAF, RLS Database
7. Brief Description of Incident: [Summary of observed anomaly, attacking IPs, impacted records]
8. Containment Measures Taken: [Firewall IP block, session revocation, database snapshot]
9. Log Availability: 180-day audit log preserved in compliance with CERT-In directions.
```

---

## 3. Log Retention & NTP Clock Synchronization

1. **180-Day Retention**:
   - `public.audit_logs` records all administrative operations, roster uploads, and logins with actor email, IP address, and timestamp.
   - Database backups are scheduled nightly and retained for 180 days in encrypted form (`deploy/backup/backup.sh`).
2. **NTP Clock Sync**:
   - The campus host server must sync via chrony / systemd-timesyncd to National Physical Laboratory (NPL) or NIC NTP servers:
     - `samay1.nplindia.org`
     - `samay2.nplindia.org`
     - `time.nic.in`
