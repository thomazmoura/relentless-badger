# shellcheck shell=bash disable=SC2029  # remote command strings are built client-side on purpose
# Shared by publish.sh and backup.sh: configuration and the ssh connection to the Pi.
# Everything is driven by environment variables; deploy/deploy.env (gitignored, see
# deploy.env.example) is sourced first when present, and variables already exported in the
# shell win over it.

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC2034  # used by publish.sh
REPO_DIR="$(dirname "$DEPLOY_DIR")"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

load_config() {
  if [[ -f "$DEPLOY_DIR/deploy.env" ]]; then
    # Plain KEY=VALUE lines, read rather than sourced; a variable already set in the
    # environment wins, so a one-off `PI_HOST=other deploy/publish.sh` works.
    local key value
    while IFS='=' read -r key value || [[ -n "$key" ]]; do
      [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
      [[ -n "${!key+set}" ]] && continue
      value="${value%\"}"; value="${value#\"}"
      export "$key=$value"
    done < "$DEPLOY_DIR/deploy.env"
  fi

  : "${PI_HOST:?set PI_HOST to the ssh host of the Pi, e.g. badgerpi.tail1234.ts.net — see deploy/deploy.env.example}"
  PI_USER="${PI_USER:-}"
  PI_PORT="${PI_PORT:-22}"
  PI_SSH_KEY="${PI_SSH_KEY:-}"
  PI_SSH_KEY="${PI_SSH_KEY/#\~/$HOME}"
  # Remote paths are relative to the ssh user's home unless absolute.
  PI_DIR="${PI_DIR:-relentlessbadger}"
  GATEWAY_DIR="${GATEWAY_DIR:-gateway}"
  PI_TS_HOSTNAME="${PI_TS_HOSTNAME:-$PI_HOST}"
  PI_PLATFORM="${PI_PLATFORM:-linux/arm64}"
  GOOGLE_WEB_CLIENT_ID="${GOOGLE_WEB_CLIENT_ID:-}"
  BACKUP_KEEP="${BACKUP_KEEP:-14}"
  SKIP_BACKUP="${SKIP_BACKUP:-0}"

  SSH_TARGET="${PI_USER:+$PI_USER@}$PI_HOST"
  # One multiplexed connection for the whole run, so each step doesn't pay a new handshake.
  SSH_CONTROL_DIR="$(mktemp -d)"
  SSH_OPTS=(-p "$PI_PORT" -o BatchMode=yes -o ConnectTimeout=10
            -o ControlMaster=auto -o "ControlPath=$SSH_CONTROL_DIR/%C" -o ControlPersist=120)
  [[ -n "$PI_SSH_KEY" ]] && SSH_OPTS+=(-i "$PI_SSH_KEY")
  trap 'ssh "${SSH_OPTS[@]}" -O exit "$SSH_TARGET" 2>/dev/null; rm -rf "$SSH_CONTROL_DIR"' EXIT
}

# Runs a command string on the Pi, in the ssh user's home.
pi() { ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"; }

# Runs a bash script (read from stdin) on the Pi with the given positional arguments.
pi_script() {
  local args=() a
  for a in "$@"; do args+=("$(printf '%q' "$a")"); done
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s -- ${args[*]}"
}

# Dumps the database into the backups folder shared with the host, then prunes old dumps.
# Everything runs inside the container, which owns the folder, so the host user never
# needs write access to it; the dump itself is handed to the ssh user.
run_backup() {
  log "Backing up the database on $PI_HOST"
  pi_script "$BACKUP_KEEP" <<'REMOTE'
set -euo pipefail
keep="$1"
db=relentlessbadger-db
if [[ "$(docker inspect -f '{{.State.Running}}' "$db" 2>/dev/null)" != true ]]; then
  echo "error: container $db is not running" >&2; exit 1
fi
host_dir="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/backups"}}{{.Source}}{{end}}{{end}}' "$db")"
if [[ -z "$host_dir" ]]; then
  echo "error: $db has no /backups mount — it predates it; run deploy/publish.sh once" >&2; exit 1
fi
name="relentlessbadger-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec -e NAME="$name" -e KEEP="$keep" -e OWNER="$(id -u):$(id -g)" "$db" sh -euc '
  pg_dump -U badger -d relentlessbadger -Fc -f "/backups/$NAME.tmp"
  mv "/backups/$NAME.tmp" "/backups/$NAME"
  chown "$OWNER" "/backups/$NAME"
  chmod 600 "/backups/$NAME"
  ls -1t /backups/relentlessbadger-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm -f
'
echo "saved $host_dir/$name ($(du -h "$host_dir/$name" | cut -f1)); keeping the newest $keep"
REMOTE
}
