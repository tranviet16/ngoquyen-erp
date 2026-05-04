# Troubleshooting Guide

Common errors and fixes for the NgoquYyen ERP production environment.

---

## 1. Database Connection Errors

### Error: `Can't reach database server` / `ECONNREFUSED`

**Symptoms:** App shows 503, health endpoint returns `{"db":"fail"}`, logs show connection error.

**Causes & Fixes:**

```bash
# Check postgres container is running
docker compose -f docker/docker-compose.prod.yml ps postgres

# If stopped, restart it
docker compose -f docker/docker-compose.prod.yml start postgres

# Check postgres logs
docker compose -f docker/docker-compose.prod.yml logs postgres | tail -30

# Verify DATABASE_URL matches actual credentials
docker compose -f docker/docker-compose.prod.yml exec nextjs \
  sh -c 'echo $DATABASE_URL'
```

If `pg_isready` returns "no response":
```bash
docker compose -f docker/docker-compose.prod.yml exec postgres \
  pg_isready -U nqerp -d ngoquyyen_erp
```

---

## 2. Migration Drift

### Error: `P3005 The database schema is not empty` or migration fails

**Symptoms:** `prisma migrate deploy` exits with error about baseline.

**Fix:**
```bash
# Check current migration status
docker compose -f docker/docker-compose.prod.yml exec nextjs \
  npx prisma migrate status

# If drift detected, resolve by baselining (use carefully — only if DB schema matches model)
docker compose -f docker/docker-compose.prod.yml exec nextjs \
  npx prisma migrate resolve --applied "20260504084531_init"
```

> If schema genuinely diverged, restore from backup and re-migrate from clean state.

---

## 3. Authentication / Cookie Issues

### Error: User logged out unexpectedly / `CSRF` / `SameSite` cookie warnings

**Cause:** `BETTER_AUTH_URL` mismatch or missing `HTTPS` in production.

**Fix:**
1. Ensure `.env.production` has:
   ```env
   BETTER_AUTH_URL=https://erp.ngoquyyen.vn
   NEXT_PUBLIC_BETTER_AUTH_URL=https://erp.ngoquyyen.vn
   ```
2. Ensure nginx proxies `X-Forwarded-Proto: https` header (see `nginx.conf`)
3. Verify SSL is active: `curl -I https://erp.ngoquyyen.vn`

### Error: Session not persisting across requests

**Cause:** `BETTER_AUTH_SECRET` changed after users logged in (invalidates all sessions).

**Fix:** Keep `BETTER_AUTH_SECRET` stable. If changed intentionally, all users must log in again — expected behavior.

---

## 4. Audit Log AsyncLocalStorage Issues

### Error: `AsyncLocalStorage is not available` or audit log missing userId

**Context:** AsyncLocalStorage does not propagate through Next.js middleware into RSC/Server Actions when running on Edge runtime.

**Fix:** This is a known architectural limitation (documented in `lib/prisma.ts`). The fallback reads session from `next/headers` — ensure the Next.js container is running in Node.js runtime, not Edge.

Verify in `next.config.ts`:
```ts
// No "runtime: 'edge'" in route handlers that perform DB writes
```

If audit logs show `userId: null`, check that:
- User is authenticated (session exists)
- Route handler runs in Node.js (not Edge)

---

## 5. Import Failures

### Error: `Unknown adapter` or preview shows no rows

**Cause:** Wrong adapter selected for the file format.

**Fix:** Match file to adapter exactly:
- `Gạch Nam Hương.xlsx` → adapter "Gạch Nam Hương"
- `Quang Minh cát,gạch.xlsx` → adapter "Quang Minh"
- See full mapping in `docs/user-guide/admin.md` Section 5.2

### Error: `Duplicate import detected`

**Cause:** Same file uploaded twice (file hash matched). Expected behavior.

**Fix:** No action needed — system is protecting against duplicates. If you need to force re-import with different data, rename the file or contact admin to clear the import run record.

---

## 6. Export / Excel Download Issues

### Error: Excel download triggers browser popup block

**Fix:** Allow downloads from `erp.ngoquyyen.vn` in browser settings:
- Chrome: Settings → Privacy → Site Settings → Pop-ups → Add site

### Error: Excel file opens as garbled text / wrong encoding

**Cause:** Old Excel (pre-2007) opened `.xlsx` file incorrectly.

**Fix:** Use Excel 2010+ or LibreOffice. All exports use `.xlsx` format (Office Open XML).

---

## 7. Container Restart Loops

### Symptom: nextjs container restarts repeatedly

```bash
# Check recent logs before crash
docker compose -f docker/docker-compose.prod.yml logs nextjs --tail=50

# Common causes:
# - DATABASE_URL unreachable at startup (postgres not ready yet)
# - Missing required env var (BETTER_AUTH_SECRET)
# - Build artifact missing (rebuild needed)

# Fix: ensure postgres starts before nextjs
docker compose -f docker/docker-compose.prod.yml up -d postgres
sleep 10
docker compose -f docker/docker-compose.prod.yml up -d nextjs
```

---

## 8. Disk Space Full

```bash
# Check disk usage
df -h

# Find large files
du -sh /opt/ngoquyyen-erp/backups/*
docker system df

# Clean old Docker images
docker image prune -f

# Clean old backups (keep last 7)
ls -t /opt/ngoquyyen-erp/backups/*.sql.gz | tail -n +8 | xargs rm -f
```

---

## 9. Nginx 502 Bad Gateway

**Cause:** Next.js container not running or not listening on port 3000.

```bash
docker compose -f docker/docker-compose.prod.yml ps nextjs
docker compose -f docker/docker-compose.prod.yml restart nextjs
docker compose -f docker/docker-compose.prod.yml logs nextjs | tail -20
```

---

## Escalation Contacts

| Issue | Contact |
|-------|---------|
| Data loss / corruption | Admin + backup team immediately |
| Auth system failure | Developer (better-auth config) |
| Performance degradation | Developer (query optimization) |
| VPS hardware issues | VPS provider support |
