#!/bin/sh
# Production backup helper for Vineyard Manager on abidevine.hipfog.com.
# Creates a PostgreSQL custom-format dump and a tarball of /data/uploads.
# Safe to run live (never stops containers or touches UpwardScoreboard).
#
# Usage:
#   BACKUP_DIR=/var/backups/vineyard RETENTION_DAYS=30 ./deploy/scripts/backup-prod.sh
set -eu

COMPOSE_PROJECT="${COMPOSE_PROJECT:-vineyard}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/compose.yaml}"
DB_SERVICE="${DB_SERVICE:-postgres}"
API_SERVICE="${API_SERVICE:-vineyard-api}"
PG_USER="${PG_USER:-vineyard}"
PG_DB="${PG_DB:-vineyard_manager}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vineyard}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

db_out="${BACKUP_DIR}/vineyard-db-${stamp}.dump"
uploads_out="${BACKUP_DIR}/vineyard-uploads-${stamp}.tar.gz"

echo "[backup] dumping PostgreSQL (${PG_DB}) -> ${db_out}"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  pg_dump -U "$PG_USER" -Fc "$PG_DB" > "$db_out"
chmod 600 "$db_out"

if [ ! -s "$db_out" ]; then
  echo "[backup] ERROR: database dump is empty" >&2
  rm -f "$db_out"
  exit 1
fi

echo "[backup] archiving /data/uploads -> ${uploads_out}"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T "$API_SERVICE" \
  tar -C /data -czf - uploads > "$uploads_out"
chmod 600 "$uploads_out"

echo "[backup] pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'vineyard-db-*.dump' -o -name 'vineyard-uploads-*.tar.gz' \) \
  -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] complete: $(ls -lh "$db_out" "$uploads_out")"
