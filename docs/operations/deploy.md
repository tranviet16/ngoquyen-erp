# Production Deployment Runbook

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
