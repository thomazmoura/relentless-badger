#!/usr/bin/env bash
# Dumps the Pi's database (pg_dump custom format) into the backups folder the Postgres
# container shares with the host — $PI_DIR/backups unless BACKUP_DIR is set in the Pi's
# .env — keeping the newest $BACKUP_KEEP dumps. Configuration: see deploy.env.example.
#
#   deploy/backup.sh
set -euo pipefail
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

load_config
run_backup
