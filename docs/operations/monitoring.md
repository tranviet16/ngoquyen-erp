# Monitoring Setup

**Tools:** Uptime Kuma (uptime + alerting) + GlitchTip (error tracking, self-hosted)

---

## Uptime Kuma

Uptime Kuma runs as a Docker service on port 3001 (see `docker-compose.prod.yml`).

### Initial Setup

1. Open `http://<VPS_IP>:3001` (first time only — before nginx proxy)
2. Create admin account
3. Configure notifications (Telegram / Email recommended)

### Monitors to Configure

| Monitor | Type | URL / Target | Interval | Alert after |
|---------|------|-------------|----------|-------------|
| ERP App | HTTP Keyword | `https://erp.ngoquyyen.vn/api/health` | 60s | 2 failures |
| DB Health | HTTP Keyword | `https://erp.ngoquyyen.vn/api/health` — check `"db":"ok"` | 60s | 1 failure |
| Backup Cron | Push | (push URL — copy from Kuma UI) | N/A | miss 1 push |
| Postgres Direct | TCP Port | `localhost:5432` | 60s | 2 failures |

### Configure Telegram Notification

1. Settings → Notifications → Add
2. Type: Telegram
3. Bot Token: (create via @BotFather)
4. Chat ID: (get from @userinfobot)
5. Test → Save
6. Assign notification to all monitors

### Access Kuma via nginx

Add to `nginx.conf` (optional — proxy port 3001 under `/status`):
```nginx
location /kuma/ {
    proxy_pass http://uptime-kuma:3001/;
}
```

---

## GlitchTip (Self-hosted Sentry alternative)

GlitchTip is optional. Add to `docker-compose.prod.yml` if error tracking is required.

### Quick Setup with Docker

```bash
# Add GlitchTip service to docker-compose.prod.yml (see commented block)
docker compose -f docker/docker-compose.prod.yml up -d glitchtip

# Open http://<VPS_IP>:8000
# Create organization + project "ngoquyyen-erp"
# Copy DSN from project settings
```

### Configure Next.js to send errors

Add to `.env.production`:
```env
SENTRY_DSN=https://xxx@glitchtip.yourdomain.com/1
```

Install Sentry SDK (compatible with GlitchTip):
```bash
npm install @sentry/nextjs
```

Follow `@sentry/nextjs` setup wizard — GlitchTip accepts the same protocol.

---

## Log Monitoring

Application logs available via Docker:

```bash
# Stream live logs
docker compose -f docker/docker-compose.prod.yml logs -f nextjs

# Last 100 lines
docker compose -f docker/docker-compose.prod.yml logs --tail=100 nextjs

# Filter for errors
docker compose -f docker/docker-compose.prod.yml logs nextjs | grep -i error
```

Nginx access logs:
```bash
docker compose -f docker/docker-compose.prod.yml logs nginx
```

---

## Alerting Checklist

- [ ] Uptime Kuma installed and running
- [ ] ERP health endpoint monitor active
- [ ] Telegram/Email notification configured and tested
- [ ] Backup push monitor configured
- [ ] GlitchTip DSN added to `.env.production` (optional)
