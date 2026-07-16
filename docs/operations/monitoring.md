# Monitoring and Error Tracking

## Production endpoints

| Service | Private URL | Local binding | Purpose |
|---|---|---|---|
| ERP | `http://100.116.178.88:3001` (primary), `http://admin-pc:3001` (alternative), `https://admin-pc.tail8998df.ts.net` (fallback) | `127.0.0.1:3001` through Tailscale TCP forwarding | Application and `/api/health` |
| Uptime Kuma | `https://admin-pc.tail8998df.ts.net:8443` | `127.0.0.1:8002` | Availability and TLS monitoring |
| GlitchTip | `https://admin-pc.tail8998df.ts.net:8444` | `127.0.0.1:8003` security-header proxy (`8001` upstream) | Sentry-compatible error tracking |

Tailscale Serve terminates TLS for the ERP fallback and Kuma, and separately forwards tailnet TCP port 3001 to the loopback-only ERP port. Docker ports are not exposed on LAN/public interfaces. Direct HTTP sessions do not use `Secure` cookies and are permitted only because the Tailscale tunnel encrypts transport; never expose port 3001 with Funnel or router port forwarding.

## Ownership and access

| Area | Owner | Access rule | Retention |
|---|---|---|---|
| Docker, Tailscale, backup, DSN rotation | Platform owner | Windows administrator on the host | Operational logs 30 days |
| GlitchTip P0 security/ACL triage | Security triager | GlitchTip admin, least privilege | Events 30 days |
| Import, payment and domain errors | Domain owner | Project member only | Events 30 days |
| Incident record and evidence | Incident commander | Repository/incident tracker | 12 months |

GlitchTip and Uptime Kuma credentials are DPAPI-encrypted for the current Windows user under `%LOCALAPPDATA%\NgoQuyenERP`. They are outside Git and must never be copied into dotenv, Compose files, reports, screenshots, or tickets. Client and server error events use the private GlitchTip HTTPS endpoint on port 8444. Application secrets enter Docker only through process environment or BuildKit secrets and are cleared from the deployment shell afterward.

## Operations

```powershell
powershell -File scripts/manage-glitchtip-local.ps1 up
powershell -File scripts/manage-glitchtip-local.ps1 status
powershell -File scripts/manage-glitchtip-local.ps1 backup
docker compose -p ngoquyen-uptime -f docker/uptime-kuma-compose.yml ps
docker ps --filter name=ngoquyen-erp-3001
tailscale serve status
Invoke-RestMethod https://admin-pc.tail8998df.ts.net/api/health
```

Kuma monitor `NgoQuyen ERP HTTPS` checks health every 60 seconds with one retry. GlitchTip receives sanitized server/client exceptions; telemetry excludes request bodies, cookies, tokens, full email addresses, monetary values and audit JSON.

## Alert classification

- P0: suspected tenant/ACL bypass, exposed secret, destructive mutation or integrity loss; triage immediately and block release.
- P1: repeated 5xx, unavailable health endpoint, backup failure, import/payment failure; triage the same day.
- P2: isolated recoverable error; assign an owner and review date.
- Expected 401/403 responses are security signals, not outages. Investigate a spike; do not send a single denial as an exception.

Close an alert only after reproduction, containment, regression coverage, deployed verification and a clean follow-up scan. ZAP classifications live in `test/security/zap-rules.conf`; only informational cache behavior and modern-app detection are ignored.

## Verification evidence

- GlitchTip synthetic event received with redaction verified.
- Validated GlitchTip backup stored under `%LOCALAPPDATA%\NgoQuyenERP\backups\glitchtip`.
- Final GlitchTip HTTPS baseline: `FAIL=0`, `WARN=0` (`plans/260715-iteration-feedback-loop/reports/zap-glitchtip-baseline-clean-v2-20260715.md`).
- Final post-migration ERP HTTPS full active scan: `FAIL=0`, `WARN=0`; informational scan telemetry was retained and triaged (`plans/260715-iteration-feedback-loop/reports/zap-full-post-migration-clean-20260716.md`).
- Uptime Kuma reports the ERP monitor `Up`, HTTP 200, and validates its TLS certificate.
