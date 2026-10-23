#!/usr/bin/env bash
# Daily copy to the shared drive (CERT-In 180-day logs, backups off the docker volume):
#   - each finished day's container logs from the host journal -> logs/, encrypted
#   - new encrypted pg_dumps from the backups_data volume       -> db/
#   - deletes files older than 180 days on the share
# Logs use the same encrypt-then-MAC scheme as backup/backup.sh, keyed by BACKUP_ENCRYPTION_KEY.
# Days missed while the share was down are caught up (up to 7 days back, if the journal still has them).
#
# Cron (host user in the adm + docker groups):
#   0 8 * * * /path/to/repo/deploy/offsite-copy.sh >> $HOME/cdac-offsite-copy.log 2>&1
# Read an exported log file:
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in FILE | gunzip | less
set -euo pipefail
cd "$(dirname "$0")"

DEST=${OFFSITE_DIR:-/mnt/shared/cdac-feedback}
PROJECT=cdac-feedback
BACKUP_ENCRYPTION_KEY=$(sed -n 's/^BACKUP_ENCRYPTION_KEY=//p' .env)
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY missing in deploy/.env}"
export BACKUP_ENCRYPTION_KEY
MAC_KEY=$(printf '%s:hmac' "$BACKUP_ENCRYPTION_KEY" | openssl dgst -sha256 | sed 's/^.*= //')

mkdir -p "$DEST/logs" "$DEST/db"   # also triggers the autofs mount
touch "$DEST/.write-test" && rm -f "$DEST/.write-test" || { echo "[offsite] ERROR: $DEST not writable"; exit 1; }

# ---- logs
filters=()
for s in $(docker compose --env-file .env -f docker-compose.yml config --services); do
  filters+=("CONTAINER_NAME=${PROJECT}-${s}-1")
done
for n in 1 2 3 4 5 6 7; do
  day=$(date -d "-$n day" +%F)
  out="$DEST/logs/${PROJECT}_logs_${day}.log.gz.enc"
  [ -e "$out" ] && continue
  tmp=$(mktemp)
  journalctl -q --no-pager -o short-iso-precise --since "$day 00:00:00" --until "$(date -d "$day +1 day" +%F) 00:00:00" "${filters[@]}" > "$tmp"
  if [ -s "$tmp" ]; then
    gzip -c "$tmp" | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -out "$out.part"
    openssl dgst -sha256 -hmac "$MAC_KEY" "$out.part" | sed 's/^.*= //' > "$out.hmac"
    mv "$out.part" "$out"
    echo "[offsite] logs $day: $(wc -l < "$tmp") lines -> $out"
  fi
  rm -f "$tmp"
done

# ---- db backups (already encrypted + HMAC'd by backup.sh). -rt, not -a: the CIFS share cannot chown.
docker run --rm -v "${PROJECT}_backups_data:/b:ro" -v "$DEST/db:/o" --entrypoint rsync "${PROJECT}-backup:local" \
  -rt --ignore-existing --itemize-changes /b/ /o/

# ---- retention
find "$DEST/logs" "$DEST/db" -type f -mtime +180 -print -delete
echo "[offsite] done $(date -Is)"
