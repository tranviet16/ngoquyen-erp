# Backup & Restore Runbook

---

## Backup Mechanism

### What is backed up
- PostgreSQL database (`ngoquyyen_erp`) — full pg_dump, gzip compressed
- Stored locally at `/opt/ngoquyyen-erp/backups/` (retained 30 days)
- Uploaded to Backblaze B2 via rclone (remote: `b2:ngoquyyen-erp-backup/`)

### Backup Schedule
- **Daily:** 02:00 AM — via cron
- **Retention local:** Last 30 daily backups
- **Retention remote (B2):** Last 30 daily + 12 monthly (managed by `backup-db.sh`)

### Backup Naming
```
erp-YYYYMMDD-HHMM.sql.gz          # daily backup
erp-YYYYMM-monthly.sql.gz          # first backup of each month (copied by script)
```

---

## Backup Script

Location: `scripts/backup-db.sh`

Run manually:
```bash
bash /opt/ngoquyyen-erp/scripts/backup-db.sh
```

Verify latest backup exists:
```bash
ls -lh /opt/ngoquyyen-erp/backups/ | tail -5
```

Verify backup size (should be > 1 KB, non-empty):
```bash
du -sh /opt/ngoquyyen-erp/backups/erp-$(date +%Y%m%d)*.sql.gz
```

---

## Restore Procedure

### When to restore
- Database corruption
- Accidental mass deletion
- Migration failure causing data loss
- Disaster recovery (VPS rebuild)

### Step 1 — Identify backup to restore

```bash
# List local backups
ls -lht /opt/ngoquyyen-erp/backups/

# Or list remote backups
rclone ls b2:ngoquyyen-erp-backup/ | sort -k2
```

### Step 2 — Download backup (if needed from B2)

```bash
rclone copy b2:ngoquyyen-erp-backup/erp-20260501-0200.sql.gz \
  /opt/ngoquyyen-erp/backups/
```

### Step 3 — Run restore script

```bash
bash /opt/ngoquyyen-erp/scripts/restore-db.sh \
  /opt/ngoquyyen-erp/backups/erp-20260501-0200.sql.gz
```

Script will:
1. Prompt for confirmation (unless `--force` passed)
2. Stop the Next.js app container
3. Drop and recreate the database
4. Restore from backup file
5. Restart the app container

### Step 4 — Run migrations (if restoring to newer schema)

```bash
docker compose -f docker/docker-compose.prod.yml exec nextjs \
  npx prisma migrate deploy
```

### Step 5 — Verify restore

```bash
curl https://erp.ngoquyyen.vn/api/health
# Expect: {"status":"ok","db":"ok",...}

# Check record counts
docker compose -f docker/docker-compose.prod.yml exec postgres \
  psql -U nqerp -d ngoquyyen_erp -c "SELECT COUNT(*) FROM users;"
```

---

## Test Restore (Monthly Drill)

Run this on staging or a spare VPS monthly to verify backups are usable:

```bash
# On staging VPS:
scp prod:/opt/ngoquyyen-erp/backups/erp-latest.sql.gz /tmp/
bash restore-db.sh /tmp/erp-latest.sql.gz --force

# Verify data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM audit_logs;"
```

Document result and date in a restore test log.

---

## Backup Failure Response

If cron backup fails (check `/var/log/erp-backup.log`):

```bash
# Check log
tail -50 /var/log/erp-backup.log

# Common causes:
# - DB connection refused: docker postgres container down
# - rclone auth expired: re-run rclone config
# - Disk full: clean old local backups manually

# Manual cleanup (keep last 10 if disk full):
ls -t /opt/ngoquyyen-erp/backups/*.sql.gz | tail -n +11 | xargs rm -f
```

If remote (B2) upload fails but local backup succeeded — local acts as fallback for up to 30 days.
