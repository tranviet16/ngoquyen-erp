#!/usr/bin/env bash
# backup-db.sh — PostgreSQL backup with local retention + optional rclone upload
# Usage: bash backup-db.sh
# Cron: 0 2 * * * /opt/ngoquyyen-erp/scripts/backup-db.sh >> /var/log/erp-backup.log 2>&1
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/opt/ngoquyyen-erp/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"          # e.g. "b2:ngoquyyen-erp-backup"
DB_NAME="${PGDATABASE:-ngoquyyen_erp}"
DB_USER="${PGUSER:-nqerp}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
TIMESTAMP="$(date +%Y%m%d-%H%M)"
BACKUP_FILE="${BACKUP_DIR}/erp-${TIMESTAMP}.sql.gz"
MONTHLY_MARKER="${BACKUP_DIR}/erp-$(date +%Y%m)-monthly.sql.gz"

# ── Setup ─────────────────────────────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Starting backup → ${BACKUP_FILE}"

# ── Dump & compress ───────────────────────────────────────────────────────────
PGPASSWORD="${PGPASSWORD:-}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-password \
  --format=plain \
  | gzip -9 > "${BACKUP_FILE}"

BACKUP_SIZE="$(du -sh "${BACKUP_FILE}" | cut -f1)"
echo "[$(date -Iseconds)] Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── Monthly copy (first backup each month) ────────────────────────────────────
if [[ ! -f "${MONTHLY_MARKER}" ]]; then
  cp "${BACKUP_FILE}" "${MONTHLY_MARKER}"
  echo "[$(date -Iseconds)] Monthly snapshot saved: ${MONTHLY_MARKER}"
fi

# ── Local retention: keep last N daily backups ────────────────────────────────
BACKUP_COUNT="$(ls -1 "${BACKUP_DIR}"/erp-[0-9]*.sql.gz 2>/dev/null | wc -l)"
if [[ "${BACKUP_COUNT}" -gt "${RETENTION_DAYS}" ]]; then
  TO_DELETE=$(( BACKUP_COUNT - RETENTION_DAYS ))
  ls -1t "${BACKUP_DIR}"/erp-[0-9]*.sql.gz \
    | tail -n "${TO_DELETE}" \
    | xargs rm -f
  echo "[$(date -Iseconds)] Removed ${TO_DELETE} old daily backup(s)"
fi

# Keep last 12 monthly backups
MONTHLY_COUNT="$(ls -1 "${BACKUP_DIR}"/erp-[0-9][0-9][0-9][0-9][0-9][0-9]-monthly.sql.gz 2>/dev/null | wc -l)"
if [[ "${MONTHLY_COUNT}" -gt 12 ]]; then
  TO_DELETE=$(( MONTHLY_COUNT - 12 ))
  ls -1t "${BACKUP_DIR}"/erp-[0-9][0-9][0-9][0-9][0-9][0-9]-monthly.sql.gz \
    | tail -n "${TO_DELETE}" \
    | xargs rm -f
  echo "[$(date -Iseconds)] Removed ${TO_DELETE} old monthly backup(s)"
fi

# ── Remote upload via rclone ──────────────────────────────────────────────────
if [[ -n "${RCLONE_REMOTE}" ]]; then
  echo "[$(date -Iseconds)] Uploading to ${RCLONE_REMOTE}..."
  if rclone copy "${BACKUP_FILE}" "${RCLONE_REMOTE}/" --quiet; then
    echo "[$(date -Iseconds)] Remote upload succeeded"
    # Also sync monthly if just created
    if [[ ! -f "${MONTHLY_MARKER}.uploaded" ]]; then
      rclone copy "${MONTHLY_MARKER}" "${RCLONE_REMOTE}/monthly/" --quiet || true
      touch "${MONTHLY_MARKER}.uploaded"
    fi
  else
    echo "[$(date -Iseconds)] WARNING: Remote upload failed — local backup retained"
    exit 1
  fi
else
  echo "[$(date -Iseconds)] RCLONE_REMOTE not set — skipping remote upload"
fi

echo "[$(date -Iseconds)] Backup finished successfully"
