#!/bin/sh
# Persist the container env for cron (cron jobs start with an empty env), then run crond.
set -eu
umask 077
env | grep -E '^(PG|BACKUP_)' | sed "s/'/'\\\\''/g; s/=/='/; s/\$/'/; s/^/export /" > /etc/backup.env
echo '0 2 * * * . /etc/backup.env; /scripts/backup.sh >/proc/1/fd/1 2>&1' > /etc/crontabs/root
echo "[backup] cron installed: daily 02:00"
exec crond -f -l 8 -d 8
