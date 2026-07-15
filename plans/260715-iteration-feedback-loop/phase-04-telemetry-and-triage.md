---
phase: 4
title: "Telemetry và triage sau phát hành"
status: completed
priority: P1
effort: "14h"
dependencies: [1, 3]
---

# Phase 4: Telemetry và triage sau phát hành

## Context links

- [Plan](plan.md), [monitoring](../../docs/operations/monitoring.md), [audit helper](../../lib/audit.ts)

## Overview

Tạo tín hiệu đủ để phát hiện lỗi thật sau deploy và quy trình biến tín hiệu thành fix có regression test.

## Requirements

- Correlation ID xuyên request, application error và audit log, không chứa PII/secret/payload nhạy cảm.
- Đo route/method/status/latency, timeout, auth denial reason/scope, mutation outcome, audit failure, DB error/slow query, import/payment/SSE failures.
- Error tracking production là GlitchTip self-hosted, bắt buộc trước khi gọi loop hoàn chỉnh; Uptime Kuma giữ nhiệm vụ availability. Event retention 30 ngày, incident ticket 12 tháng.
- P0 triage ngay; P1 trong ngày; P2 có owner và review date.

## Architecture

Structured application logs → error tracker/alert channel → incident template → issue/fix → regression test → metric verification. 401/403 được phân loại security signal, không tự động coi là error.

## Related code files

- Modify: `lib/audit.ts`, `prisma/schema.prisma`, migration mới nếu AuditLog lưu correlation ID, API handlers/services được inventory chọn, `docker/docker-compose.prod.yml`, `docs/operations/monitoring.md`.
- Create: `lib/observability/*`, `docs/operations/incident-response.md`, `docs/operations/alert-catalog.md`.

## Implementation steps

1. Deploy GlitchTip self-hosted nội bộ; Platform owner quản lý Docker/backup/DSN, Security triager xử lý P0, domain owner xử lý payment/import/export. DSN chỉ trong production secret store.
2. Định nghĩa event schema/version và redaction allowlist; add correlation ID at request boundary.
3. Emit deny/audit/mutation metrics từ shared seams, tránh log riêng lẻ ở mọi caller.
4. Cấu hình alerts: 5xx/timeout, audit failure, spike denial, import/payment error, health/backup miss; đặt threshold có owner và runbook.
5. Viết incident template: reproduce, blast radius, containment, data repair, rollback decision, regression test, verification metric.
6. Test redaction, event schema và alert routing bằng synthetic event; xác nhận event đến trong 5 phút, không chứa body/cookie/token/email đầy đủ/số tiền/audit JSON; diễn tập một P0 access-denied spike.

## Todo list

- [x] Error tracking nhận test exception đã redacted.
- [x] Mọi alert có severity, owner, runbook.
- [x] Diễn tập P0 tạo regression ticket/test.

## Success criteria

- Có thể liên kết một lỗi P0 từ request tới audit log và incident, không lộ dữ liệu nhạy cảm.
- Alert không tạo loop vô hạn hoặc coi 403 bình thường là outage.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Telemetry lộ PII | Allowlist fields, redaction test, least-privilege dashboard |
| Alert fatigue | Baseline trước, severity/owner, weekly tuning |

## Security considerations

DSN/tokens chỉ qua production secret store. Limit access log/error dashboard theo role.

## Next steps

Phase 7 dùng trend incident và alert để ưu tiên backlog.
