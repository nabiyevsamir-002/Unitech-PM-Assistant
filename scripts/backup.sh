#!/usr/bin/env bash
# UniTech PM AI Assistant — backup script (track 5c).
# Dumps the PostgreSQL database (gzip) + copies Excel source files into ./backups,
# then prunes backups older than the retention window.
#
# Usage:
#   ./scripts/backup.sh                      # uses DATABASE_URL from .env / env
#   DATABASE_URL=postgresql://... ./scripts/backup.sh
#   RETENTION_DAYS=30 ./scripts/backup.sh
#
# In the Docker stack, run it against the postgres service, e.g.:
#   docker compose exec -T postgres pg_dump -U unitech unitech_pm | gzip > backups/db.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."

# Load DATABASE_URL from .env if not already in the environment.
if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | tail -1 | cut -d= -f2- | tr -d '"')"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set (and not found in .env)." >&2
  exit 1
fi

# Strip Prisma-only query params (e.g. ?schema=public) that libpq/pg_dump reject.
CONN="${DATABASE_URL%%\?*}"

# Locate pg_dump (PATH, then the Homebrew postgresql@15 keg used in local dev).
PG_DUMP="$(command -v pg_dump || true)"
[[ -z "$PG_DUMP" && -x /opt/homebrew/opt/postgresql@15/bin/pg_dump ]] && PG_DUMP=/opt/homebrew/opt/postgresql@15/bin/pg_dump
if [[ -z "$PG_DUMP" ]]; then
  echo "ERROR: pg_dump not found on PATH." >&2
  exit 1
fi

RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="backups"
mkdir -p "$OUT_DIR"

DB_FILE="$OUT_DIR/db_${STAMP}.sql.gz"
echo "→ Dumping database to $DB_FILE"
"$PG_DUMP" --no-owner --no-privileges "$CONN" | gzip > "$DB_FILE"

# Bundle the Excel source files (the write-back backups live under sample-data/backups already).
if compgen -G "sample-data/*.xlsx" > /dev/null; then
  XLSX_FILE="$OUT_DIR/excel_${STAMP}.tar.gz"
  echo "→ Archiving Excel sources to $XLSX_FILE"
  tar -czf "$XLSX_FILE" sample-data/*.xlsx
fi

echo "→ Pruning backups older than ${RETENTION_DAYS} day(s)"
find "$OUT_DIR" -type f \( -name 'db_*.sql.gz' -o -name 'excel_*.tar.gz' \) -mtime +"$RETENTION_DAYS" -print -delete || true

echo "✓ Backup complete:"
ls -lh "$OUT_DIR" | tail -n +2
