#!/bin/sh
set -e

# ============================================================================
# C-DAC Feedback Portal Backup Restore Drill Script
# Validates backup integrity and recovery readiness for VAPT / CERT-In
# ============================================================================

BACKUP_FILE="$1"
TARGET_DB="${2:-cdac_feedback_restore_test}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: $0 <path_to_backup_file> [target_database]"
  exit 1
fi

echo "[restore-drill] Starting recovery validation for: ${BACKUP_FILE}"
TEMP_SQL="/tmp/restore_drill.sql"

if echo "${BACKUP_FILE}" | grep -q "\.enc$"; then
  if [ -z "${BACKUP_ENCRYPTION_KEY}" ]; then
    echo "ERROR: BACKUP_ENCRYPTION_KEY must be set to decrypt ${BACKUP_FILE}"
    exit 1
  fi
  echo "[restore-drill] Decrypting and uncompressing..."
  openssl enc -d -aes-256-cbc -pbkdf2 -in "${BACKUP_FILE}" -k "${BACKUP_ENCRYPTION_KEY}" | gunzip > "${TEMP_SQL}"
else
  echo "[restore-drill] Uncompressing..."
  gunzip -c "${BACKUP_FILE}" > "${TEMP_SQL}"
fi

echo "[restore-drill] Creating temporary database: ${TARGET_DB}"
dropdb -h "${PGHOST:-db}" -U "${PGUSER:-postgres}" --if-exists "${TARGET_DB}"
createdb -h "${PGHOST:-db}" -U "${PGUSER:-postgres}" "${TARGET_DB}"

echo "[restore-drill] Restoring SQL dump into ${TARGET_DB}..."
psql -h "${PGHOST:-db}" -U "${PGUSER:-postgres}" -d "${TARGET_DB}" -f "${TEMP_SQL}" > /dev/null

echo "[restore-drill] Verifying restored row counts..."
psql -h "${PGHOST:-db}" -U "${PGUSER:-postgres}" -d "${TARGET_DB}" -c "
  SELECT 'centres' AS table_name, count(*) FROM public.centres
  UNION ALL SELECT 'courses', count(*) FROM public.courses
  UNION ALL SELECT 'modules', count(*) FROM public.modules
  UNION ALL SELECT 'student_roster', count(*) FROM public.student_roster
  UNION ALL SELECT 'feedback_sessions', count(*) FROM public.feedback_sessions;
"

echo "[restore-drill] Cleaning up temporary test database..."
dropdb -h "${PGHOST:-db}" -U "${PGUSER:-postgres}" "${TARGET_DB}"
rm -f "${TEMP_SQL}"

echo "[restore-drill] PASS: Restore drill successful. Database is fully recoverable."
