#!/bin/sh
# Encrypted pg_dump -> /backups, 180-day retention, optional offsite copy. Logs to stdout.
set -eu
set -o pipefail
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY required}"
export BACKUP_ENCRYPTION_KEY   # openssl reads it via -pass env: (never on argv)

# INF-3 (least privilege): pg_dump only needs SELECT, not the superuser/owner role this ran
# as before. If a DBA has granted a dedicated read-only role (see deploy/.env.example +
# DEPLOYMENT-CHECKLIST.md), point at it via BACKUP_DB_ROLE/BACKUP_DB_PASSWORD. Defaults to
# the existing POSTGRES_USER/PGPASSWORD so nothing breaks before that role exists.
PGUSER="${BACKUP_DB_ROLE:-${PGUSER:?}}"
if [ -n "${BACKUP_DB_ROLE:-}" ]; then
  : "${BACKUP_DB_PASSWORD:?BACKUP_DB_PASSWORD required when BACKUP_DB_ROLE is set}"
  PGPASSWORD="$BACKUP_DB_PASSWORD"
fi
export PGUSER PGPASSWORD

# INF-3 (authenticated encryption): `openssl enc` flatly refuses AEAD ciphers -- confirmed
# directly ("AEAD ciphers not supported") on both OpenSSL 3.5.4 (host) and 3.5.9 (this
# image's alpine package), so aes-256-gcm is not reachable through this interface at all;
# it's not a version gap with a CBC fallback to keep. Instead: encrypt-then-MAC with a
# domain-separated HMAC-SHA256 key, so a tampered/truncated backup is detected and rejected
# before it's ever handed to CBC decryption (closes the padding-oracle class of INF-3
# without a new dependency -- openssl is already here).
MAC_KEY=$(printf '%s:hmac' "$BACKUP_ENCRYPTION_KEY" | openssl dgst -sha256 | sed 's/^.*= //')

DIR=/backups
OUT="${DIR}/cdac_feedback_$(date +%Y%m%d_%H%M%S).sql.gz.enc"
TMP="${OUT}.part"
mkdir -p "$DIR"
trap 'rm -f "$TMP" "$TMP.hmac"' EXIT

echo "[backup] dumping ${PGDATABASE:?} as role ${PGUSER}"
pg_dump -h "${PGHOST:-db}" -U "$PGUSER" -d "$PGDATABASE" | gzip \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -out "$TMP"
[ -s "$TMP" ] || { echo "[backup] ERROR: empty output"; exit 1; }
openssl dgst -sha256 -hmac "$MAC_KEY" "$TMP" | sed 's/^.*= //' > "$TMP.hmac"
mv "$TMP" "$OUT"
mv "$TMP.hmac" "$OUT.hmac"
echo "[backup] created $OUT ($(wc -c < "$OUT") bytes), HMAC $OUT.hmac"

find "$DIR" -type f -name 'cdac_feedback_*.enc' -mtime +180 -delete
find "$DIR" -type f -name 'cdac_feedback_*.enc.hmac' -mtime +180 -delete

if [ -n "${BACKUP_OFFSITE_TARGET:-}" ]; then
  echo "[backup] offsite copy to ${BACKUP_OFFSITE_TARGET}"
  rsync -a -e "ssh -i ${BACKUP_OFFSITE_SSH_KEY:-/run/offsite_key} -o StrictHostKeyChecking=accept-new" \
    "$OUT" "$OUT.hmac" "$BACKUP_OFFSITE_TARGET" || { echo "[backup] ERROR: offsite copy failed"; exit 1; }
else
  echo "[backup] WARNING: BACKUP_OFFSITE_TARGET unset, backup exists only on this host"
fi
echo "[backup] done"
