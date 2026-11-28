#!/usr/bin/env bash
# Restore drill (13-backup-recovery §4, ADR-0027): fetch the newest backup, decrypt it with the
# OFFLINE age private key, restore it into a throwaway PostgreSQL 18 container, verify it against
# the manifest, time it against the RTO and append the result to infra/runbooks/restore-log.md.
# Runs on the operator machine (Docker only); the private key never goes to the server or CI.
#
#   infra/backup/restore-drill.sh --source b2:lga-backups-prod --key ~/secure/lga-backup.agekey
#   infra/backup/restore-drill.sh --source /path/to/local/bucket --key ./drill.agekey   # rehearsal
#
# B2 credentials (read-only key) come from RCLONE_CONFIG_B2_ACCOUNT / RCLONE_CONFIG_B2_KEY.
set -euo pipefail

SOURCE=""
KEY=""
IMAGE="${BACKUP_IMAGE:-lga-backup:dev}"
RTO_SECONDS=$((8 * 3600)) # launch RTO (13 §1)
TARGET_SECONDS=$((60 * 60)) # restore test must finish in < 60 min (13 §4)
LOG_FILE="$(cd "$(dirname "$0")/../runbooks" && pwd)/restore-log.md"

while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --no-log) LOG_FILE=""; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$SOURCE" ] || [ -z "$KEY" ]; then
  echo "Usage: $0 --source <remote|dir> --key <age key file>" >&2
  exit 2
fi
[ -f "$KEY" ] || { echo "Key file not found: $KEY" >&2; exit 2; }

started=$(date +%s)
id="lga-drill-$(date +%s)"
net="$id-net"
db="$id-db"
pw="drill-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"

cleanup() {
  docker rm -f "$db" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Absolute host path Docker understands (Git Bash on Windows needs the C:/... form).
host_path() { (cd "$1" && (pwd -W 2>/dev/null || pwd)); }

# Mount local sources and the key read-only; remotes are reached with rclone.
key_dir="$(host_path "$(dirname "$KEY")")"
key_name="$(basename "$KEY")"
mounts=(-v "$key_dir:/keys:ro")
src="$SOURCE"
if [ -d "$SOURCE" ]; then
  mounts+=(-v "$(host_path "$SOURCE"):/bucket:ro")
  src="/bucket"
fi
env_args=()
for var in RCLONE_CONFIG_B2_TYPE RCLONE_CONFIG_B2_ACCOUNT RCLONE_CONFIG_B2_KEY; do
  [ -n "${!var:-}" ] && env_args+=(-e "$var")
done
[ -n "${RCLONE_CONFIG_B2_ACCOUNT:-}" ] && env_args+=(-e RCLONE_CONFIG_B2_TYPE=b2)

echo "[drill] starting a throwaway PostgreSQL 18"
docker network create "$net" >/dev/null
docker run -d --name "$db" --network "$net" -e POSTGRES_PASSWORD="$pw" -e POSTGRES_DB=lga \
  postgres:18-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "$db" pg_isready -U postgres -d lga >/dev/null 2>&1 && break
  sleep 1
done

run_tool() {
  docker run --rm -i --network "$net" "${mounts[@]}" ${env_args[@]+"${env_args[@]}"} \
    -e PGHOST="$db" -e PGUSER=postgres -e PGPASSWORD="$pw" -e PGDATABASE=lga \
    --entrypoint sh "$IMAGE" -c "$1"
}

echo "[drill] finding the newest backup in $SOURCE"
latest=$(run_tool "rclone lsf -R --files-only --include '*.dump.age' '$src/pg/daily' | sort | tail -1")
[ -n "$latest" ] || { echo "[drill] no backups found" >&2; exit 1; }
object="$src/pg/daily/$latest"
manifest="${object%.dump.age}.manifest.json"
echo "[drill] restoring $latest"

restore_started=$(date +%s)
run_tool "set -o pipefail; rclone cat '$object' | age -d -i '/keys/$key_name' | pg_restore --no-owner --no-acl --exit-on-error -d lga"
restore_seconds=$(($(date +%s) - restore_started))

echo "[drill] verifying against the manifest"
manifest_json=$(run_tool "rclone cat '$manifest'")
verify=$(run_tool "psql -XAtq -v ON_ERROR_STOP=1 -v manifest='$manifest_json' -f -" <"$(dirname "$0")/verify-restore.sql")
echo "$verify"
status="PASS"
grep -q '^FAIL' <<<"$verify" && status="FAIL"

total=$(($(date +%s) - started))
verdict="$status"
[ "$total" -le "$TARGET_SECONDS" ] || verdict="FAIL (slower than the 60 min target)"
echo "[drill] $verdict: restore ${restore_seconds}s, total ${total}s (RTO $((RTO_SECONDS / 3600)) h)"

if [ -n "$LOG_FILE" ]; then
  printf '| %s | %s | %s | %ss | %ss | %s |\n' \
    "$(date -u +%Y-%m-%dT%H:%MZ)" "$latest" "$( [ -d "$SOURCE" ] && echo local || echo "$SOURCE")" \
    "$restore_seconds" "$total" "$verdict" >>"$LOG_FILE"
  echo "[drill] logged to $LOG_FILE"
fi
[ "$status" = "PASS" ]
