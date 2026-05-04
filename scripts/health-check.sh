#!/usr/bin/env bash
# health-check.sh — Verify ERP app + database are healthy
# Usage: bash health-check.sh [base-url]
# Exit 0 = healthy, Exit 1 = unhealthy
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
HEALTH_URL="${BASE_URL}/api/health"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-nqerp}"

ERRORS=0

# ── Check Next.js health endpoint ─────────────────────────────────────────────
echo "Checking ${HEALTH_URL}..."
HTTP_RESPONSE="$(curl -s -o /tmp/health-body.json -w "%{http_code}" \
  --max-time 10 \
  "${HEALTH_URL}" || echo "000")"

if [[ "${HTTP_RESPONSE}" == "200" ]]; then
  echo "  HTTP: OK (200)"
  # Check db field in response
  DB_STATUS="$(cat /tmp/health-body.json | grep -o '"db":"[^"]*"' | cut -d'"' -f4 || echo "unknown")"
  if [[ "${DB_STATUS}" == "ok" ]]; then
    echo "  DB (via API): OK"
  else
    echo "  DB (via API): FAIL (status=${DB_STATUS})"
    ERRORS=$(( ERRORS + 1 ))
  fi
  cat /tmp/health-body.json && echo
else
  echo "  HTTP: FAIL (status=${HTTP_RESPONSE})"
  ERRORS=$(( ERRORS + 1 ))
fi

# ── Check PostgreSQL directly ─────────────────────────────────────────────────
echo "Checking PostgreSQL at ${DB_HOST}:${DB_PORT}..."
if pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -q; then
  echo "  PostgreSQL: READY"
else
  echo "  PostgreSQL: NOT READY"
  ERRORS=$(( ERRORS + 1 ))
fi

# ── Result ────────────────────────────────────────────────────────────────────
if [[ "${ERRORS}" -eq 0 ]]; then
  echo "Health check PASSED"
  exit 0
else
  echo "Health check FAILED (${ERRORS} error(s))"
  exit 1
fi
