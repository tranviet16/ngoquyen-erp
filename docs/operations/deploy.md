# Production Deployment Runbook

## Production on VIETPC (from the 11/2026 release)

From the 11/2026 cutover (`plans/261124-0448-production-release-train/`), production runs on **VIETPC**, using the data copy that already holds the công nợ vật tư cutover and the DT-HĐ-TT books. Until the cutover is recorded in that plan, the admin-pc section below is still the live production.

- **Address:** `http://vietpc:3001` (also `http://100.77.222.89:3001`, HTTPS fallback `https://vietpc.tail8998df.ts.net`).
  - The app is bound to `127.0.0.1:3001`.
  - Tailnet access goes through `tailscale serve --bg --tcp=3001 tcp://127.0.0.1:3001` on VIETPC. Never open 3001 to the LAN.
- **Containers:**
  - database: `ngoquyen-bansao-pg` (postgres:16, volume `ngoquyen-bansao-pgdata`, `127.0.0.1:5433`, restart `unless-stopped`);
  - app: `ngoquyen-prod-erp`, from `docker/docker-compose.erp-vietpc.yml`.
- **Config outside git and outside OneDrive:** the production env file and uploads in `C:\Users\tranv\.ngoquyen-prod\`. The production `BETTER_AUTH_SECRET` is its own, never the copy's or dev's. The bootstrap admin is managed with `scripts/manage-erp-admin-local.ps1`, as below.
- **Build and run** from a clean checkout of the release commit, outside OneDrive:
  - `docker compose -f docker/docker-compose.erp-vietpc.yml --env-file <prod env> build`, then `up -d --no-build`;
  - `npx prisma migrate status` from that checkout, with the production `DATABASE_URL`, before declaring it healthy. The image carries no Prisma CLI.
- **Ports on VIETPC:**

  | Port | Use |
  |---|---|
  | 5433 | Production database. Dev tools refuse it. |
  | 3001 | Production app. Dev tools refuse it. |
  | 5434 | Dev copy `ngoquyen-dev-pg`, env files in `C:\Users\tranv\.ngoquyen-dev\`. |
  | 3002 / 3003 | Dev servers started by `scripts/serve-local-build.mjs`. |
  | 5435 | Throwaway integration-test database. |

- **Backups:**
  - `scripts/backup-erp-vietpc.ps1` runs nightly from Task Scheduler. It writes `pg_dump -Fc` with SHA-256 to `C:\Users\tranv\ngoquyen-prod-backups\` and a verified copy to admin-pc over Tailscale, kept 30 days.
  - Check `backup.log` there after each change.
- **Monitoring:** Uptime Kuma on admin-pc watches `http://vietpc:3001/api/health` for `"status":"ok"`, and the app reports to the GlitchTip on admin-pc.
- **Keeping it up:**
  - VIETPC must stay on: no sleep on AC, Docker Desktop starts at login, the user stays logged in, and Windows Update active hours cover the working day.
  - After a restart, check that both containers are up and that `/api/health` is ok.
- **If VIETPC fails:** restore the latest nightly dump on admin-pc and run the same release image there with admin-pc's address in `BETTER_AUTH_URL` / `TRUSTED_ORIGINS`.

## Previous Windows host deployment (admin-pc, until the 11/2026 cutover)

The active instance is private to the Tailscale network:

- ERP primary: `http://100.116.178.88:3001`
- ERP short-host alternative: `http://admin-pc:3001`
- ERP HTTPS fallback: `https://admin-pc.tail8998df.ts.net`
- Uptime Kuma: `https://admin-pc.tail8998df.ts.net:8443` → `127.0.0.1:8002`
- GlitchTip: `https://admin-pc.tail8998df.ts.net:8444` → security-header proxy on `127.0.0.1:8003`

ERP remains bound to `127.0.0.1:3001`; a Tailscale TCP forwarder exposes tailnet port 3001 without opening Docker on LAN/public interfaces. Configure it with `tailscale serve --bg --tcp=3001 tcp://127.0.0.1:3001`. Because direct HTTP is the primary URL, Better Auth cookies cannot carry the browser `Secure` flag; transport remains encrypted inside Tailscale, and port 3001 must never be exposed outside the tailnet. Switching between the HTTP endpoints and HTTPS fallback creates separate browser sessions.

Run `npx prisma migrate deploy` against the production database before declaring a fresh database healthy; `/api/health` proves connectivity but does not replace migration verification. Provision the bootstrap admin with `powershell -File scripts/manage-erp-admin-local.ps1 provision`; the idempotent command generates a random password, DPAPI-encrypts it for the current Windows user at `%LOCALAPPDATA%\NgoQuyenERP\erp-admin-secrets.json`, and never prints it. Check access with the same script's `status` action. If the store is missing while the admin already exists, provisioning fails closed and removes the unverified new store; reset/recover the existing account before provisioning again. Never commit the secret store; rotate the password after the first login.

---

**Stack:** Next.js 16 (standalone) + PostgreSQL 16 + nginx + Docker Compose  
**Target OS:** Ubuntu 24.04 LTS  
**Estimated time:** 45–60 minutes for first deploy

---

## Prerequisites

### VPS Requirements
- Ubuntu 24.04 LTS, 4 vCPU, 8 GB RAM, 100 GB SSD
- Open ports: 80 (HTTP), 443 (HTTPS), 22 (SSH)
- Root or sudo access

### Software to Install on VPS

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version

# Install rclone (for backup to cloud)
curl https://rclone.org/install.sh | sudo bash

# Install psql client (for health checks)
sudo apt install -y postgresql-client
```

---

## Environment Variables

Copy `.env.example` to `.env.production` on the VPS and fill in values:

```bash
cp .env.example .env.production
nano .env.production
```

Required vars:

```env
DATABASE_URL=postgresql://nqerp:<DB_PASSWORD>@postgres:5432/ngoquyyen_erp?schema=public
BETTER_AUTH_SECRET=<run: openssl rand -base64 32>
BETTER_AUTH_URL=https://erp.ngoquyyen.vn
NEXT_PUBLIC_APP_URL=https://erp.ngoquyyen.vn
NEXT_PUBLIC_BETTER_AUTH_URL=https://erp.ngoquyyen.vn
POSTGRES_PASSWORD=<DB_PASSWORD>
BACKUP_RETENTION_DAYS=30
RCLONE_REMOTE=b2:ngoquyyen-erp-backup
```

> Generate `BETTER_AUTH_SECRET`: `openssl rand -base64 32`

---

## Clone & Configure

```bash
git clone https://github.com/<org>/ngoquyyen-erp.git /opt/ngoquyyen-erp
cd /opt/ngoquyyen-erp

# Copy production env
cp /path/to/.env.production .env.production
```

---

## First Deploy

```bash
cd /opt/ngoquyyen-erp

# Build and start all services
docker compose -f docker/docker-compose.prod.yml --env-file .env.production up -d --build

# Verify containers running
docker compose -f docker/docker-compose.prod.yml ps
```

Expected output — all services `Up`:
```
NAME                STATUS
ngoquyyen-nginx     Up (healthy)
ngoquyyen-nextjs    Up (healthy)
ngoquyyen-postgres  Up (healthy)
ngoquyyen-uptime    Up
```

---

## Run Database Migrations

```bash
# Run inside nextjs container
docker compose -f docker/docker-compose.prod.yml exec nextjs \
  npx prisma migrate deploy
```

---

## Seed Initial Admin User

```bash
# Set vars then run seed script
docker compose -f docker/docker-compose.prod.yml exec \
  -e SEED_ADMIN_EMAIL=admin@ngoquyyen.vn \
  -e SEED_ADMIN_PASSWORD=<STRONG_PASSWORD> \
  -e SEED_ADMIN_NAME="Admin" \
  nextjs npx tsx scripts/seed-admin.ts
```

> Change the password immediately after first login.

---

## SSL — Let's Encrypt

SSL is handled outside Docker via certbot (webroot method):

```bash
# Install certbot
sudo apt install -y certbot

# Get certificate (nginx must be running on port 80 first)
sudo certbot certonly --webroot \
  -w /opt/ngoquyyen-erp/docker/nginx/webroot \
  -d erp.ngoquyyen.vn \
  --email admin@ngoquyyen.vn \
  --agree-tos --non-interactive

# Certificates stored at:
# /etc/letsencrypt/live/erp.ngoquyyen.vn/fullchain.pem
# /etc/letsencrypt/live/erp.ngoquyyen.vn/privkey.pem

# Update nginx.conf to enable HTTPS block (uncomment SSL server block)
# Restart nginx
docker compose -f docker/docker-compose.prod.yml restart nginx

# Auto-renewal (already set by certbot, verify):
sudo systemctl status certbot.timer
```

---

## Verify Health

```bash
# Health endpoint
curl https://erp.ngoquyyen.vn/api/health

# Expected:
# {"status":"ok","db":"ok","uptime":123,"version":"0.1.0"}

# Run health check script
bash scripts/health-check.sh
```

---

## Setup Automated Backup

```bash
# Configure rclone for Backblaze B2
rclone config
# Follow prompts: create remote named "b2", type=b2, enter keyID + applicationKey

# Test backup
bash scripts/backup-db.sh

# Add to cron (runs daily at 02:00)
sudo crontab -e
# Add line:
# 0 2 * * * /opt/ngoquyyen-erp/scripts/backup-db.sh >> /var/log/erp-backup.log 2>&1
```

---

## Setup Uptime Kuma

1. Navigate to `http://<VPS_IP>:3001`
2. Create admin account
3. Add monitor:
   - Type: HTTP(s) — Keyword
   - URL: `https://erp.ngoquyyen.vn/api/health`
   - Keyword: `"status":"ok"`
   - Interval: 60 seconds
4. Add push monitor for backup cron (optional):
   - Type: Push
   - Copy push URL
   - Add to `backup-db.sh`: `curl -s "<PUSH_URL>" > /dev/null`

---

## Update / Redeploy

```bash
cd /opt/ngoquyyen-erp
git pull origin main

# Rebuild and restart (zero-downtime: nginx buffers requests briefly)
docker compose -f docker/docker-compose.prod.yml up -d --build nextjs

# Run migrations if any
docker compose -f docker/docker-compose.prod.yml exec nextjs npx prisma migrate deploy
```

---

## Rollback

```bash
# Rollback to previous image (if tagged)
docker compose -f docker/docker-compose.prod.yml stop nextjs
docker tag ngoquyyen-nextjs:previous ngoquyyen-nextjs:latest
docker compose -f docker/docker-compose.prod.yml up -d nextjs

# Or restore from backup (see backup-restore.md)
```
