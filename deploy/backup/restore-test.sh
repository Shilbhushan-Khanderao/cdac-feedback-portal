#!/bin/sh
# Restore drill: decrypt a backup into a scratch DB, list row counts of ALL tables, drop it.
# Usage (from repo root):
#   docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec backup \
#     /scripts/restore-test.sh /backups/<file>.sql.gz.enc
set -eu
set -o pipefail
FILE="${1:?usage: restore-test.sh <backup.sql.gz.enc> [scratch_db]}"
SCRATCH="${2:-cdac_restore_drill}"
: "${BACKUP_ENCRYPTION_KEY:?required}"
export BACKUP_ENCRYPTION_KEY
TMP=$(mktemp)
COUNTS=$(mktemp)
cleanup() {
  rm -f "$TMP" "$COUNTS"
  dropdb -h "${PGHOST:-db}" -U "$PGUSER" --if-exists "$SCRATCH" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Verify the encrypt-then-MAC tag (see backup.sh) before this ciphertext is ever handed to
# CBC decryption -- a tampered/truncated backup fails here instead of hitting the decoder.
[ -f "$FILE.hmac" ] || { echo "[restore-drill] FAIL: $FILE.hmac missing, cannot verify integrity"; exit 1; }
MAC_KEY=$(printf '%s:hmac' "$BACKUP_ENCRYPTION_KEY" | openssl dgst -sha256 | sed 's/^.*= //')
ACTUAL_HMAC=$(openssl dgst -sha256 -hmac "$MAC_KEY" "$FILE" | sed 's/^.*= //')
EXPECTED_HMAC=$(cat "$FILE.hmac")
[ "$ACTUAL_HMAC" = "$EXPECTED_HMAC" ] || { echo "[restore-drill] FAIL: HMAC mismatch -- backup is tampered or truncated"; exit 1; }
echo "[restore-drill] HMAC verified"

openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in "$FILE" | gunzip > "$TMP"
dropdb -h "${PGHOST:-db}" -U "${PGUSER:?}" --if-exists "$SCRATCH"
createdb -h "${PGHOST:-db}" -U "$PGUSER" "$SCRATCH"
psql -h "${PGHOST:-db}" -U "$PGUSER" -d "$SCRATCH" -v ON_ERROR_STOP=1 -q -f "$TMP" >/dev/null

# Count every user table (schema-qualified), not a hardcoded subset.
psql -h "${PGHOST:-db}" -U "$PGUSER" -d "$SCRATCH" -v ON_ERROR_STOP=1 -At -c "
  SELECT table_schema || '.' || table_name || '=' ||
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  FROM information_schema.tables
  WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')
  ORDER BY 1" | tee "$COUNTS"

for t in responses submissions audit_logs; do
  grep -q "\.$t=" "$COUNTS" || { echo "[restore-drill] FAIL: table $t missing from restore"; exit 1; }
done
echo "[restore-drill] PASS (compare counts with live DB; they differ only by rows written since the backup)"
