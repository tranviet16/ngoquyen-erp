---
phase: 10
title: "UAT, Bug Fix, Training, Go-live"
status: pending
priority: P1
effort: "1w"
dependencies: [9]
---

# Phase 10: UAT, Bug Fix, Training, Go-live

## Overview
Đưa hệ thống vào sử dụng thực tế: UAT với end users, sửa bug, training nhân viên, deploy lên VPS production, hand-over.

## Requirements
**Functional:**
- UAT scenarios cover toàn bộ 6 module
- Bug log + tracking → fix → re-test
- User docs (vận hành cơ bản) bằng tiếng Việt
- Training video / live session
- Production deploy với backup + monitoring

**Non-functional:**
- Daily DB backup tự động lên cloud (Backblaze B2 / Wasabi)
- Uptime monitoring (Uptime Kuma)
- Error tracking (Sentry hoặc self-hosted GlitchTip)

## Architecture
**Production stack:**
```
VPS (Ubuntu 24.04, 4 vCPU, 8GB RAM, 100GB SSD)
└── docker compose:
    ├── nginx (reverse proxy + Let's Encrypt SSL)
    ├── nextjs (1 container, restart=always)
    ├── postgres (volume mount, daily pg_dump cron)
    ├── uptime-kuma (port 3001)
    └── glitchtip (optional, port 8000)
```

**Backup:**
- `pg_dump | gzip | rclone copy → b2:bucket/erp-backup/$(date).sql.gz` daily 02:00
- Retention: 30 daily + 12 monthly + 5 yearly

**Training materials:**
- `docs/user-guide/{role}.md` cho 5 role
- 4 video screencast (Loom/OBS): login + master data, nhập giao dịch, xem báo cáo, export

## Related Code Files
**Create:**
- `docs/user-guide/admin.md`
- `docs/user-guide/ke-toan.md`
- `docs/user-guide/can-bo-vat-tu.md`
- `docs/user-guide/chi-huy-cong-truong.md`
- `docs/user-guide/viewer.md`
- `docs/operations/deploy.md` (deploy runbook)
- `docs/operations/backup-restore.md`
- `scripts/backup-db.sh`
- `scripts/restore-db.sh`
- `docker/docker-compose.prod.yml`
- `tests/uat/{module}.test-cases.md` (UAT test cases)

**Modify:**
- `README.md` (production deploy section)
- `.env.example` (production vars)

## Implementation Steps
1. Soạn UAT test cases theo từng module (≥10 case/module = 60 case)
2. Tổ chức UAT session 2 ngày với 3-5 user thật
3. Log mọi bug vào GitHub Issues, ưu tiên P0 (chặn) → P1 (lớn) → P2 (cosmetic)
4. Fix bug P0 + P1 ngay; P2 ghi nhận cho post-launch
5. Provision VPS, install Docker, clone repo, copy `.env.production`
6. Chạy `docker compose -f docker-compose.prod.yml up -d`
7. Setup Let's Encrypt SSL (certbot)
8. Setup backup cron + test restore từ backup
9. Setup Uptime Kuma + Sentry/GlitchTip
10. Run import historical data lên production
11. Soạn user guide + record video
12. Training session: 1 buổi tổng quan + 1 buổi/role nếu cần
13. Go-live cutover: thông báo dừng dùng Excel, freeze data Excel, switch
14. Hỗ trợ tại chỗ 1 tuần đầu

## Success Criteria
- [ ] ≥60 UAT case pass
- [ ] 0 P0 bug, ≤5 P1 bug ở thời điểm go-live
- [ ] Production HTTPS hoạt động, uptime monitoring xanh
- [ ] Backup chạy đêm + test restore thành công
- [ ] 5 role đều có user guide + đã train
- [ ] Sau 1 tuần go-live: <5 incident, không mất data

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| User chống đối, vẫn dùng Excel song song | Lãnh đạo chốt deadline freeze Excel; chuyển ownership data vào ERP rõ ràng |
| Bug nghiêm trọng phát hiện sau go-live | Rollback plan: switch nginx về maintenance page, restore từ backup mới nhất, fix dev |
| Performance issue khi 10+ user vào cùng lúc | Load test trước go-live (k6 script); tăng VPS spec nếu cần |
| Backup B2/Wasabi mất kết nối | Local backup retention 7 ngày làm fallback; alert nếu cron fail |
| Training không đủ → lỗi nhập liệu | "Buddy system" tuần đầu: mỗi user có 1 superuser (admin) hỗ trợ trực tiếp |

## Post Go-live (out of Phase 1 nhưng cần plan)
- Tuần 2-4: thu thập feedback, list cải tiến cho Phase 2
- Tháng 2: review performance, optimize query chậm
- Quý 2: bắt đầu Phase 2 (mobile, e-invoice, BI)
