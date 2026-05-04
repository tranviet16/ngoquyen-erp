#!/usr/bin/env bash
# restore-db.sh — Restore PostgreSQL database from a gzipped pg_dump backup
# Usage: bash restore-db.sh <backup-file.sql.gz> [--force]
# Example: bash restore-db.sh /opt/ngoquyyen-erp/backups/erp-20260501-0200.sql.gz
set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────────────
BACKUP_FILE="${1:-}"
FORCE="${2:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 <backup-file.sql.gz> [--force]"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

# ── Configuration ────────────────────────────────────────────────────────────
DB_NAME="${PGDATABASE:-ngoquyyen_erp}"
DB_USER="${PGUSER:-nqerp}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
ADMIN_USER="${PGADMINUSER:-postgres}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/ngoquyyen-erp/docker/docker-compose.prod.yml}"

echo "============================================================"
echo " ERP Database Restore"
echo "============================================================"
echo " Backup file : ${BACKUP_FILE}"
echo " Database    : ${DB_NAME} on ${DB_HOST}:${DB_PORT}"
echo " User        : ${DB_USER}"
echo "============================================================"
echo " WARNING: This will DROP and RECREATE the database."
echo " All current data will be LOST."
echo "============================================================"

# ── Confirmation ─────────────────────────────────────────────────────────────
if [[ "${FORCE}" != "--force" ]]; then
  read -r -p "Type 'yes' to confirm restore: " CONFIRM
  if [[ "${CONFIRM}" != "yes" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "[$(date -Iseconds)] Starting restore..."

# ── Stop Next.js app to prevent concurrent writes ─────────────────────────────
if docker compose -f "${COMPOSE_FILE}" ps nextjs 2>/dev/null | grep -q "Up"; then
  echo "[$(date -Iseconds)] Stopping nextjs container..."
  docker compose -f "${COMPOSE_FILE}" stop nextjs
  NEXTJS_STOPPED=true
else
  NEXTJS_STOPPED=false
fi

# ── Drop & recreate database ──────────────────────────────────────────────────
echo "[$(date -Iseconds)] Dropping database ${DB_NAME}..."
PGPASSWORD="${PGPASSWORD:-}" psql \
  -h "${DB_HOST}" -p "${DB_PORT}" \
  -U "${ADMIN_USER}" \
  -c "DROP DATABASE IF EXISTS ${DB_NAME};" \
  postgres

echo "[$(date -Iseconds)] Creating database ${DB_NAME}..."
PGPASSWORD="${PGPASSWORD:-}" psql \
  -h "${DB_HOST}" -p "${DB_PORT}" \
  -U "${ADMIN_USER}" \
  -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" \
  postgres

# ── Restore ───────────────────────────────────────────────────────────────────
echo "[$(date -Iseconds)] Restoring from ${BACKUP_FILE}..."
PGPASSWORD="${PGPASSWORD:-}" gunzip -c "${BACKUP_FILE}" \
  | psql \
      -h "${DB_HOST}" -p "${DB_PORT}" \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      --quiet

echo "[$(date -Iseconds)] Restore complete"

# ── Restart Next.js ───────────────────────────────────────────────────────────
if [[ "${NEXTJS_STOPPED}" == "true" ]]; then
  echo "[$(date -Iseconds)] Starting nextjs container..."
  docker compose -f "${COMPOSE_FILE}" start nextjs
fi

echo "[$(date -Iseconds)] Done. Verify with: curl http://localhost/api/health"
