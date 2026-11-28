#!/usr/bin/env bash
# Deploy one release to staging or production (ARCHITECTURE §17.5, ADR-0012, ADR-0040).
#
#   deploy.sh staging    <release>   # migrate + dev seed, start, health gate, smoke, then stop
#   deploy.sh production <release>   # migrate, start, health gate, smoke; auto-rollback on failure
#
# On the VPS it runs as the `deploy` user from /opt/lga/compose (copied there by the release
# workflow) with env files in /opt/lga/env and state in /opt/lga/state. Options:
#   --local            rehearse on a workstation: local images, repo .env, no pull, state in .deploy/
#   --force-unhealthy  pretend the health gate failed (rehearses the automatic rollback)
#   --dry-run          print the docker commands instead of running them
# Migrations are expand-only (AGENTS.md), so rolling the code back never needs a down-migration.
set -euo pipefail

ENVIRONMENT="${1:-}"
RELEASE="${2:-}"
shift 2 || true
LOCAL=0
FORCE_UNHEALTHY=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --local) LOCAL=1 ;;
    --force-unhealthy) FORCE_UNHEALTHY=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
case "$ENVIRONMENT" in staging | production) ;; *)
  echo "Usage: $0 <staging|production> <release> [--local] [--force-unhealthy] [--dry-run]" >&2
  exit 2
  ;;
esac
[[ "$RELEASE" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || { echo "Invalid release: '$RELEASE'" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_DIR="${LGA_COMPOSE_DIR:-$REPO_DIR/infra/docker}"
if [ "$LOCAL" = 1 ]; then
  ENV_FILE="${LGA_ENV_FILE:-$REPO_DIR/.env}"
  STATE_DIR="${LGA_STATE_DIR:-$REPO_DIR/.deploy}"
else
  ENV_FILE="${LGA_ENV_FILE:-/opt/lga/env/$ENVIRONMENT.env}"
  STATE_DIR="${LGA_STATE_DIR:-/opt/lga/state}"
fi
[ -f "$ENV_FILE" ] || { echo "Env file not found: $ENV_FILE" >&2; exit 2; }
mkdir -p "$STATE_DIR"

if [ "$ENVIRONMENT" = staging ]; then
  PROJECT=lga-staging
  FILES=(-f "$COMPOSE_DIR/compose.prod.yml" -f "$COMPOSE_DIR/compose.staging.yml")
  BASE_URL="http://127.0.0.1:${STAGING_HTTP_PORT:-8081}"
else
  PROJECT=lga
  FILES=(-f "$COMPOSE_DIR/compose.prod.yml")
  [ "$LOCAL" = 1 ] || FILES+=(-f "$COMPOSE_DIR/compose.vps.yml")
  BASE_URL="${LGA_HEALTH_URL:-http://127.0.0.1:${HTTP_PORT:-8080}}"
  # On the VPS nginx serves HTTPS; health checks go through it with the real host name.
  if [ "$LOCAL" = 0 ]; then
    domain="$(grep -E '^LGA_APP_DOMAIN=' "$ENV_FILE" | cut -d= -f2- || true)"
    BASE_URL="${LGA_HEALTH_URL:-https://$domain}"
  fi
fi

log() { printf '[deploy %s %s] %s\n' "$ENVIRONMENT" "$(date -u +%H:%M:%S)" "$*"; }

compose() {
  if [ "$DRY_RUN" = 1 ]; then
    echo "+ RELEASE=$CURRENT docker compose -p $PROJECT ${FILES[*]} --env-file $ENV_FILE $*"
    return 0
  fi
  RELEASE="$CURRENT" docker compose -p "$PROJECT" "${FILES[@]}" --env-file "$ENV_FILE" "$@"
}

# ---- health gate and smoke -----------------------------------------------------------------

wait_healthy() {
  [ "$DRY_RUN" = 1 ] && { log "(dry run) health gate skipped"; return 0; }
  if [ "$FORCE_UNHEALTHY" = 1 ]; then
    log "health gate: forced failure (--force-unhealthy)"
    return 1
  fi
  local deadline=$((SECONDS + ${LGA_HEALTH_TIMEOUT:-180}))
  while [ $SECONDS -lt $deadline ]; do
    local states
    states="$(compose ps --format '{{.Service}}={{.Health}}' api worker web 2>/dev/null | sort | tr '\n' ' ')"
    if [[ "$states" == *"api=healthy"* && "$states" == *"web=healthy"* && "$states" == *"worker=healthy"* ]]; then
      log "containers healthy: $states"
      return 0
    fi
    sleep 3
  done
  log "health gate timed out: ${states:-no containers}"
  return 1
}

smoke() {
  [ "$DRY_RUN" = 1 ] && return 0
  local failed=0 body code
  body="$(curl -fsS --max-time 10 -k "$BASE_URL/health/ready" || true)"
  if [[ "$body" == *'"status":"ok"'* ]]; then log "smoke: /health/ready ok"; else log "smoke: /health/ready FAILED"; failed=1; fi
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -k "$BASE_URL/login" || true)"
  if [ "$code" = 200 ]; then log "smoke: /login 200"; else log "smoke: /login returned $code"; failed=1; fi
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -k -X POST -H 'Origin: https://evil.example' "$BASE_URL/api/v1/auth/logout" || true)"
  if [ "$code" = 403 ]; then log "smoke: cross-origin POST rejected"; else log "smoke: CSRF check returned $code"; failed=1; fi
  return $failed
}

# ---- one rollout ----------------------------------------------------------------------------

rollout() {
  CURRENT="$1"
  log "release $CURRENT: pulling images"
  [ "$LOCAL" = 1 ] || compose pull --quiet web api worker migrate
  compose up -d --wait postgres valkey
  log "release $CURRENT: migrating"
  compose run --rm migrate
  log "release $CURRENT: starting app containers"
  compose up -d --no-deps api worker web
  compose up -d --no-deps nginx
  if [ "$ENVIRONMENT" = production ] && [ "$LOCAL" = 0 ]; then
    compose up -d --no-deps certbot backup observability docker-proxy
  fi
  wait_healthy && smoke
}

CURRENT_FILE="$STATE_DIR/$ENVIRONMENT.release"
PREVIOUS_FILE="$STATE_DIR/$ENVIRONMENT.previous"
previous="$(cat "$CURRENT_FILE" 2>/dev/null || true)"

log "deploying $RELEASE (previous: ${previous:-none})"
if rollout "$RELEASE"; then
  if [ "$DRY_RUN" = 0 ]; then
    [ -n "$previous" ] && [ "$previous" != "$RELEASE" ] && echo "$previous" >"$PREVIOUS_FILE"
    echo "$RELEASE" >"$CURRENT_FILE"
  fi
  log "release $RELEASE is live"
  if [ "$ENVIRONMENT" = staging ]; then
    log "stopping staging (volumes kept)"
    compose down
  fi
  exit 0
fi

log "release $RELEASE FAILED the health gate"
if [ "$ENVIRONMENT" = staging ]; then
  compose logs --tail 80 api worker web migrate || true
  compose down
  exit 1
fi
if [ -z "$previous" ] || [ "$previous" = "$RELEASE" ]; then
  log "no previous release to roll back to; leaving containers for inspection"
  exit 1
fi
log "rolling back to $previous"
FORCE_UNHEALTHY=0
if rollout "$previous"; then
  log "rollback to $previous succeeded; production is healthy on the previous release"
else
  log "ROLLBACK FAILED: production needs a human (infra/runbooks/rollback.md)"
fi
exit 1
