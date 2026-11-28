#!/bin/sh
# Nightly logical backup (13-backup-recovery §3.1, ADR-0027, ADR-0040).
#   pg_dump -Fc | age -r <public key> | rclone rcat <remote>/pg/daily/YYYY/MM/DD/lga-<ts>.dump.age
# Encrypted in the stream: no plaintext ever touches disk. The server holds only the age PUBLIC
# key; the B2 key can write but not delete or overwrite, and the bucket's object lock keeps
# every object for 35 days. A manifest (sizes, sha256, versions, row counts) is uploaded next to
# the dump for the restore drill. Logs are JSON lines; `event` feeds the Grafana alerts.
#
# Env: PGHOST PGDATABASE PGUSER PGPASSWORD (libpq), BACKUP_AGE_RECIPIENT (age1...),
#      BACKUP_REMOTE (e.g. b2:lga-backups-prod, or a local directory for drills), BACKUP_ENV.
set -eu
# BusyBox ash (the image's /bin/sh) supports pipefail; a failed pg_dump must fail the upload.
# shellcheck disable=SC3040
set -o pipefail

log() {
  # $1 level, $2 event, $3 message, $4 optional extra JSON members (",\"k\":v")
  printf '{"ts":"%s","level":"%s","service":"backup","env":"%s","event":"%s","msg":"%s"%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${BACKUP_ENV:-local}" "$2" "$3" "${4:-}"
}

fail() {
  log error backup.failed "$1"
  exit 1
}

[ -n "${BACKUP_AGE_RECIPIENT:-}" ] || fail 'BACKUP_AGE_RECIPIENT is not set'
[ -n "${BACKUP_REMOTE:-}" ] || fail 'BACKUP_REMOTE is not set'
case "$BACKUP_AGE_RECIPIENT" in age1*) ;; *) fail 'BACKUP_AGE_RECIPIENT must be an age public key (age1...)' ;; esac

started=$(date +%s)
ts=$(date -u +%Y%m%dT%H%M%SZ)
day=$(date -u +%Y/%m/%d)
name="lga-${ts}.dump.age"
dest="${BACKUP_REMOTE%/}/pg/daily/${day}/${name}"

log info backup.started "Backing up ${PGDATABASE}" ",\"object\":\"pg/daily/${day}/${name}\""

work=$(mktemp -d /tmp/backup.XXXXXX)
trap 'rm -rf "$work"' EXIT INT TERM
mkfifo "$work/hash" "$work/count"
sha256sum <"$work/hash" | cut -d' ' -f1 >"$work/sha256" &
hash_pid=$!
wc -c <"$work/count" | tr -d ' ' >"$work/bytes" &
count_pid=$!

if ! pg_dump -Fc -Z 6 --no-owner |
  age -r "$BACKUP_AGE_RECIPIENT" |
  tee "$work/hash" "$work/count" |
  rclone rcat --quiet "$dest"; then
  fail 'pg_dump, age or upload failed'
fi
wait "$hash_pid" "$count_pid"

# Manifest for the restore drill: what the dump should contain.
migration=$(psql -XAtqc "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1")
pg_version=$(psql -XAtqc "SHOW server_version")
counts=$(psql -XAtqc "
  SELECT string_agg(format('\"%s\":%s', t, c), ',') FROM (
    SELECT 'workspaces' t, count(*) c FROM workspaces UNION ALL
    SELECT 'users', count(*) FROM users UNION ALL
    SELECT 'workspace_members', count(*) FROM workspace_members UNION ALL
    SELECT 'companies', count(*) FROM companies UNION ALL
    SELECT 'contacts', count(*) FROM contacts UNION ALL
    SELECT 'leads', count(*) FROM leads UNION ALL
    SELECT 'campaigns', count(*) FROM campaigns UNION ALL
    SELECT 'messages', count(*) FROM messages UNION ALL
    SELECT 'audit_logs', count(*) FROM audit_logs UNION ALL
    SELECT 'ai_runs', count(*) FROM ai_runs
  ) x")
bytes=$(cat "$work/bytes")
sha=$(cat "$work/sha256")

printf '{"object":"%s","createdAt":"%s","bytes":%s,"sha256":"%s","pgVersion":"%s","migration":"%s","rowCounts":{%s}}\n' \
  "$name" "$ts" "$bytes" "$sha" "$pg_version" "$migration" "$counts" |
  rclone rcat --quiet "${dest%.dump.age}.manifest.json" || fail 'manifest upload failed'

elapsed=$(($(date +%s) - started))
log info backup.succeeded "Backup uploaded" ",\"bytes\":${bytes},\"durationSeconds\":${elapsed},\"migration\":\"${migration}\""
