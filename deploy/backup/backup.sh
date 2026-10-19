#!/bin/sh
# Encrypted pg_dump -> /backups, 180-day retention, optional offsite copy. Logs to stdout.
set -eu
set -o pipefail
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY required}"
export BACKUP_ENCRYPTION_KEY   # openssl reads it via -pass env: (never on argv)

DIR=/backups
OUT="${DIR}/cdac_feedback_$(date +%Y%m%d_%H%M%S).sql.gz.enc"
TMP="${OUT}.part"
mkdir -p "$DIR"
trap 'rm -f "$TMP"' EXIT

echo "[backup] dumping ${PGDATABASE:?}"
pg_dump -h "${PGHOST:-db}" -U "${PGUSER:?}" -d "$PGDATABASE" | gzip \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -out "$TMP"
[ -s "$TMP" ] || { echo "[backup] ERROR: empty output"; exit 1; }
mv "$TMP" "$OUT"
echo "[backup] created $OUT ($(wc -c < "$OUT") bytes)"

find "$DIR" -type f -name 'cdac_feedback_*.enc' -mtime +180 -delete

if [ -n "${BACKUP_OFFSITE_TARGET:-}" ]; then
  echo "[backup] offsite copy to ${BACKUP_OFFSITE_TARGET}"
  rsync -a -e "ssh -i ${BACKUP_OFFSITE_SSH_KEY:-/run/offsite_key} -o StrictHostKeyChecking=accept-new" \
    "$OUT" "$BACKUP_OFFSITE_TARGET" || { echo "[backup] ERROR: offsite copy failed"; exit 1; }
else
  echo "[backup] WARNING: BACKUP_OFFSITE_TARGET unset, backup exists only on this host"
fi
echo "[backup] done"
