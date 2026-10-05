#!/bin/sh
set -e

# ============================================================================
# C-DAC Feedback Portal Encrypted Backup Script
# CERT-In Compliant 180-Day Automated Retention
# ============================================================================

BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/cdac_feedback_${TIMESTAMP}.sql.gz"
ENCRYPTED_FILE="${BACKUP_FILE}.enc"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Starting database backup at ${TIMESTAMP}..."

# Export database dump compressed
pg_dump -h "${PGHOST:-db}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-cdac_feedback}" | gzip > "${BACKUP_FILE}"

# Encrypt backup using AES-256-CBC with encryption key from env
if [ -n "${BACKUP_ENCRYPTION_KEY}" ]; then
  echo "[backup] Encrypting backup file..."
  openssl enc -aes-256-cbc -salt -pbkdf2 -in "${BACKUP_FILE}" -out "${ENCRYPTED_FILE}" -k "${BACKUP_ENCRYPTION_KEY}"
  rm -f "${BACKUP_FILE}"
  echo "[backup] Encrypted backup created: ${ENCRYPTED_FILE}"
else
  echo "[backup] Unencrypted backup created (WARNING: set BACKUP_ENCRYPTION_KEY for production): ${BACKUP_FILE}"
fi

# Rotate backups: enforce 180-day retention per CERT-In guidelines
echo "[backup] Pruning backups older than 180 days..."
find "${BACKUP_DIR}" -type f -name "cdac_feedback_*.enc" -mtime +180 -exec rm {} +
find "${BACKUP_DIR}" -type f -name "cdac_feedback_*.sql.gz" -mtime +180 -exec rm {} +

echo "[backup] Backup completed successfully."
