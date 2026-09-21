#!/usr/bin/env bash
# Publishes the current working tree to the Raspberry Pi: builds the API and web images for
# the Pi's architecture here, streams them over ssh, refreshes the HTTPS gateway and its
# Tailscale certificate, backs the database up, and restarts the stack. The API applies
# pending EF Core migrations as it starts, so a healthy /health means the database is
# migrated too. Configuration: see deploy.env.example.
#
#   deploy/publish.sh
set -euo pipefail
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

load_config
cd "$REPO_DIR"

API_REPO=relentlessbadger-api
WEB_REPO=relentlessbadger-web
BASE_URL="https://$PI_TS_HOSTNAME"

tag="$(git rev-parse --short HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  tag="$tag-dirty"
  warn "the working tree has uncommitted changes; they are included, tagged $tag"
fi

# --- preflight -------------------------------------------------------------------------
log "Checking $SSH_TARGET"
pi_script "$PI_DIR" <<'REMOTE'
set -euo pipefail
dir="$1"
for cmd in docker tailscale; do
  command -v "$cmd" >/dev/null || { echo "error: $cmd is not installed on the Pi" >&2; exit 1; }
done
docker compose version >/dev/null 2>&1 || { echo "error: the docker compose plugin is missing on the Pi" >&2; exit 1; }
if [[ ! -f "$dir/.env" ]]; then
  cat >&2 <<EOF
error: $dir/.env does not exist on the Pi. It holds the server's secrets; create it once:
  mkdir -p $dir && nano $dir/.env      # fill in from .env.example in the repo
EOF
  exit 1
fi
# The data lives in the volume relentlessbadger_pgdata. A database container from an
# earlier, differently named deployment would sit on another volume — starting this stack
# next to it would come up on an empty database, so stop and let a human sort it out.
db=relentlessbadger-db
if docker inspect "$db" >/dev/null 2>&1; then
  project="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$db")"
  volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$db")"
  if [[ "$project" != relentlessbadger || "$volume" != relentlessbadger_pgdata ]]; then
    cat >&2 <<EOF
error: an existing $db container belongs to compose project '$project' and keeps its data
in volume '$volume'; this deployment uses project 'relentlessbadger' and volume
'relentlessbadger_pgdata'. Nothing was changed. To carry the data over, back it up
(pg_dump), stop the old stack, publish, then restore — see the README.
EOF
    exit 1
  fi
fi
REMOTE

# --- build -----------------------------------------------------------------------------
log "Building $API_REPO:$tag for $PI_PLATFORM"
docker buildx build --platform "$PI_PLATFORM" --load \
  -t "$API_REPO:$tag" -t "$API_REPO:latest" backend/

log "Building $WEB_REPO:$tag for $PI_PLATFORM"
docker buildx build --platform "$PI_PLATFORM" --load \
  --build-arg API_BASE_URL=/badger-api \
  --build-arg GOOGLE_WEB_CLIENT_ID="$GOOGLE_WEB_CLIENT_ID" \
  -t "$WEB_REPO:$tag" -t "$WEB_REPO:latest" web/

# --- ship ------------------------------------------------------------------------------
log "Sending the images to the Pi"
docker save "$API_REPO:$tag" "$API_REPO:latest" "$WEB_REPO:$tag" "$WEB_REPO:latest" \
  | gzip -1 | pi 'gunzip | docker load'

log "Sending the compose and gateway files"
q_pi_dir="$(printf '%q' "$PI_DIR")"
q_gw_dir="$(printf '%q' "$GATEWAY_DIR")"
tar -cf - docker-compose.prod.yml \
  | pi "mkdir -p $q_pi_dir/backups && tar -C $q_pi_dir -xf -"
# Only this app's site file is written; other apps' files in nginx/sites are left alone.
tar -C deploy/gateway -cf - docker-compose.yml nginx/nginx.conf nginx/sites/badger.conf \
  | pi "mkdir -p $q_gw_dir/certs && tar -C $q_gw_dir -xf -"

# --- gateway ---------------------------------------------------------------------------
log "Refreshing the gateway and the certificate for $PI_TS_HOSTNAME"
pi_script "$GATEWAY_DIR" "$PI_TS_HOSTNAME" <<'REMOTE'
set -euo pipefail
dir="$1" host="$2"
docker network inspect gateway >/dev/null 2>&1 || docker network create gateway >/dev/null
# Renews only when the certificate is close to expiry; otherwise it just rewrites the files.
if ! tailscale cert --cert-file "$dir/certs/fullchain.pem" --key-file "$dir/certs/privkey.pem" "$host"; then
  cat >&2 <<EOF
error: tailscale cert failed. Check that MagicDNS and HTTPS certificates are enabled in the
Tailscale admin console, and that this user may request certificates:
  sudo tailscale set --operator=\$USER
EOF
  exit 1
fi
cd "$dir"
docker compose up -d --remove-orphans
# A running gateway doesn't notice new config or certificate files by itself.
docker exec gateway nginx -c /etc/nginx/gateway/nginx.conf -t -q
docker exec gateway nginx -c /etc/nginx/gateway/nginx.conf -s reload
REMOTE

# --- backup, then roll out -------------------------------------------------------------
if [[ "$SKIP_BACKUP" == 1 ]]; then
  warn "SKIP_BACKUP=1: publishing without a backup"
elif [[ "$(pi "docker inspect -f '{{.State.Running}}' relentlessbadger-db 2>/dev/null || true")" == true ]] \
     && pi "docker inspect -f '{{range .Mounts}}{{.Destination}} {{end}}' relentlessbadger-db" | grep -q /backups; then
  # Migrations are about to run against this data.
  run_backup
else
  log "No backup-ready database yet (first publish); skipping the pre-deploy backup"
fi

log "Starting $tag"
pi "cd $q_pi_dir && docker compose -f docker-compose.prod.yml up -d --no-build --pull never --remove-orphans"

# --- verify ----------------------------------------------------------------------------
log "Waiting for $BASE_URL/badger-api/health (migrations run first)"
healthy=0
for _ in $(seq 1 45); do
  if curl -fsS --max-time 5 "$BASE_URL/badger-api/health" >/dev/null 2>&1 \
     && curl -fsS --max-time 5 "$BASE_URL/badger/" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done
if [[ "$healthy" != 1 ]]; then
  warn "the stack did not come up healthy; recent logs follow"
  pi "cd $q_pi_dir && docker compose -f docker-compose.prod.yml ps; docker compose -f docker-compose.prod.yml logs --tail 100 api; docker logs --tail 30 gateway" || true
  die "publish of $tag failed its health check; the pre-deploy dump (if one was taken) is in the backups folder"
fi

# Keep the three newest builds of each image so a rollback is a retag away, drop the rest.
pi_script "$API_REPO" "$WEB_REPO" <<'REMOTE' || warn "image cleanup failed; harmless"
set -euo pipefail
for repo in "$@"; do
  docker images "$repo" --format '{{.Tag}}' | grep -vx latest | tail -n +4 \
    | xargs -r -I{} docker rmi "$repo:{}" >/dev/null
done
docker image prune -f >/dev/null
REMOTE

log "Published $tag"
echo "  web: $BASE_URL/badger/"
echo "  api: $BASE_URL/badger-api/"
