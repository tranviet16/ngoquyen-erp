---
title: "Vòng lặp phản hồi kiểm thử toàn product"
description: "Thiết lập quality loop theo rủi ro cho bảo mật, ACL, API, nghiệp vụ, vận hành và hiệu năng của ERP."
status: completed
priority: P1
effort: "90h"
tags: [infra, security, auth, api, tech-debt]
blockedBy: []
blocks: []
created: 2026-07-15
---

# Vòng lặp phản hồi kiểm thử toàn product

## Mục tiêu

Tạo vòng lặp có thể lặp lại: phân loại thay đổi → chạy gate theo rủi ro → quan sát sau phát hành → triage → sửa lỗi kèm regression test → cải thiện baseline. Security, ACL và API là hard gate; performance là non-blocking gate nhưng mọi cảnh báo phải được xử lý trước khi đóng kế hoạch.

## Quyết định đã chốt

- Không có staging: kiểm thử tự động chạy trên DB/container cô lập; không dùng dữ liệu production.
- Load test hoặc active scan trên production chỉ chạy trong change window được phê duyệt, với rate limit và kill switch; không phải job PR.
- Không dùng coverage toàn cục làm điều kiện an toàn. P0 phải có allow, deny và IDOR/regression test.
- Không tự động rollback dữ liệu nghiệp vụ theo alert. P0 có runbook và owner quyết định rollback/repair.
- Error tracking dùng GlitchTip self-hosted; event retention 30 ngày, incident ticket 12 tháng. DSN chỉ qua production secret store; event dùng allowlist, không gửi body/cookie/token/PII/số tiền/audit JSON.
- `test/risk-manifest.ts` là nguồn sự thật versioned cho bề mặt rủi ro; một record P0 bắt buộc có owner, policy reference, test và recovery metadata.

## Phases

| # | Phase | Effort | Status |
|---|---|---:|---|
| 1 | [Inventory rủi ro và baseline an toàn](phase-01-risk-inventory-and-safe-baseline.md) | 10h | completed |
| 2 | [Bootstrap CI và quality lane](phase-02-pr-quality-gates.md) | 12h | completed |
| 3 | [Kiểm thử security, ACL và API P0](phase-03-security-acl-api-coverage.md) | 24h | completed |
| 8 | [Bật required security gates](phase-08-enforce-required-security-gates.md) | 4h | completed |
| 4 | [Telemetry và triage sau phát hành](phase-04-telemetry-and-triage.md) | 14h | completed |
| 5 | [An toàn release, migration và phục hồi](phase-05-release-safety-and-recovery.md) | 10h | completed |
| 6 | [Baseline hiệu năng và cảnh báo](phase-06-performance-baseline-and-alerts.md) | 8h | completed |
| 7 | [Nhịp vận hành, KPI và cải tiến liên tục](phase-07-operating-cadence-and-kpis.md) | 8h | completed |

## Dependencies

- 1 là blocker cho 2–8: chưa có canonical checkout và inventory thì không thể gán/test gate chính xác.
- 2 chỉ tạo lane report-only; 3 hoàn chỉnh security contract P0; 8 mới được bật required checks và branch protection.
- 4 bắt đầu sau 1 và 3; 5 dựa trên baseline release từ 1–3; 6 phụ thuộc telemetry phase 4.
- 7 tổng hợp đầu ra của toàn bộ phase trước, gồm phase 8.

## Success criteria

- Mọi bề mặt P0 có owner, quyền yêu cầu, dữ liệu nhạy cảm, test tối thiểu và rollback/runbook.
- Canonical repository/commit có clean checkout tái lập toàn bộ command CI; nếu không đạt, implementation dừng ở Phase 1.
- PR chạm ACL/auth/API/migration không thể merge nếu security gate thất bại.
- Lỗi P0/P1 sau phát hành có quy trình triage, metric và regression test trước khi đóng.
- Hiệu năng có baseline đo trong môi trường kiểm soát; không gây flaky PR gate; mọi cảnh báo phải được xử lý và xác minh đóng trước khi kế hoạch hoàn tất.

## Out of scope

- Viết lại ACL, auth hoặc toàn bộ service chỉ để tăng coverage.
- DAST/load scan không giới hạn trên production.
- Auto-rollback các mutation tài chính hay khôi phục DB không có phê duyệt.

## Context

- [Phản biện Kongming](reports/kongming-review.md)
- [Kiến trúc hệ thống](../../docs/system-architecture.md)
- [Kế hoạch test hiện hữu](../260516-comprehensive-test-suite/plan.md)
