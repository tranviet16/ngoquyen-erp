---
phase: 6
title: "Baseline hiệu năng và cảnh báo"
status: completed
priority: P2
effort: "8h"
dependencies: [1, 4]
---

# Phase 6: Baseline hiệu năng và cảnh báo

## Context links

- [Plan](plan.md), [performance tests](../../test/performance), [baseline](../../test/performance/baseline.json)

## Overview

Đo và cảnh báo performance trong môi trường kiểm soát; không dùng shared CI runner làm latency gate. Cảnh báo không chặn từng PR, nhưng là work item bắt buộc của kế hoạch này: không được đóng phase khi còn cảnh báo chưa triage hoặc chưa xác minh khắc phục.

## Requirements

- Query count P0/P1 không tăng silent; baseline chỉ ratchet hoặc có rationale/reviewer.
- Load run thống kê median từ 3–5 lần: latency, error rate, throughput, DB pool/CPU saturation.
- Production load test chỉ khi được duyệt change window, caps traffic thấp, stop condition và on-call owner.
- Performance-warning register snapshot là nguồn sự thật: nguồn chỉ gồm query contract, controlled load run, GlitchTip/telemetry, DB/host monitoring; scope chỉ P0/P1 manifest. Mỗi cảnh báo có ticket/owner, nguyên nhân, mức ảnh hưởng, remediation, lần đo lại và trạng thái `noise-dismissed` hoặc `cleared`.

## Architecture

Fast query-count chạy trong CI như informational trend. Load runner chạy manual/weekly release candidate với DB/container cô lập; artifact lưu result/version/seed/config để so sánh.

## Related code files

- Modify: `test/performance/baseline.json`, `test/performance/n-plus-one.test.ts`, `test/performance/load/**`, `.github/workflows/test.yml`.
- Create: `docs/operations/performance-runbook.md`, `scripts/record-performance-baseline.ts`.

## Implementation steps

1. Xác minh seed/load runner không thể target production mặc định; require explicit environment acknowledgement cho approved production run.
2. Chọn endpoints/flows từ P0/P1 manifest; add authenticated scenario và error/leak assertion, không chỉ health endpoint.
3. Chạy 3–5 trial môi trường cố định; lưu median và dispersion thay vì lấy single run.
4. Ghi query-count, error rate, saturation trước p95; set warning threshold có margin/rationale.
5. Report regression thành issue/alert, không fail PR do p95 noise; fail chỉ nếu deterministic query contract bị phá và policy được duyệt.
6. Triage từng cảnh báo trong kỳ baseline: loại bỏ noise bằng lần đo lại; với cảnh báo thật, tối ưu query/index/cache/payload hoặc capacity theo root cause, thêm regression/query contract và chạy lại cùng seed/config.
7. Đóng cảnh báo chỉ khi metric đã dưới ngưỡng trong các lần chạy yêu cầu; `noise-dismissed` cần evidence lặp lại. Không dùng exception mở để đóng phase.

## Todo list

- [x] Baseline có provenance seed/config/date.
- [x] Production guard/stop condition được test.
- [x] Dashboard/alert performance có owner.
- [x] Tất cả cảnh báo baseline/load/telemetry trong phạm vi có trạng thái `cleared`; không còn exception mở.

## Success criteria

- Không có benchmark mơ hồ không tái lập.
- Thay đổi query P0/P1 có delta được review.
- Không còn cảnh báo performance mở trong phạm vi plan; mỗi cảnh báo đã được đo lại sau remediation.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Runner noise | Fixed environment, median, warning only |
| Load ảnh hưởng production | Approval, rate cap, stop conditions, off-peak window |

## Security considerations

Load credentials minimum privilege; không chạy destructive endpoint; no real PII in reports.

## Next steps

Phase 7 reviews trends và chọn optimization backlog.
