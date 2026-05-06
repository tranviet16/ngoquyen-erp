---
title: SL-DT Module — Independent Rewrite + Formula Audit
status: pending
priority: P1
scope: project
created: 2026-05-06
---

# SL-DT Module Independent Rewrite

## Goal
Tách SL-DT thành module độc lập (entity riêng, không reuse `projects`). Compute strict theo công thức Excel. Đảm bảo dữ liệu T12/2025 chính xác 0 VND khi reconcile với file gốc `SOP/SL - DT 2025.xlsx`.

## Context
- Phase 1 đã extract toàn bộ formulas — xem [phase-1-formula-mapping.md](phase-1-formula-mapping.md).
- DB hiện có 67 Project rows do SL-DT adapter tạo, không có ràng buộc với Quản lý dự án (xác nhận qua `scripts/diag-sldt-projects.ts`).
- User chốt: phaseCode/groupCode lưu riêng (Q-A), CauHinh quản lý qua UI (Q-B), cleanup theo migrate-then-soft-delete (Q-C).

## Phases

| # | Phase | Status | File |
|---|---|---|---|
| 2 | Schema + cleanup migration | pending | [phase-2-schema-migration.md](phase-2-schema-migration.md) |
| 3 | Adapter rewrite (5 sheet types → inputs only) | pending | [phase-3-adapter-rewrite.md](phase-3-adapter-rewrite.md) |
| 4 | Compute service + UI 5 báo cáo | pending | [phase-4-compute-and-ui.md](phase-4-compute-and-ui.md) |
| 5 | Import T10/T11/T12 + reconcile script | pending | [phase-5-import-and-reconcile.md](phase-5-import-and-reconcile.md) |

## Dependencies
- Hard order: 2 → 3 → 4 → 5. Mỗi phase độ block phase sau.
- Re-import file `SOP/SL - DT 2025.xlsx` qua UI sau khi adapter mới sẵn sàng (không cần backfill script).

## Success Criteria
- Trang Quản lý dự án không còn 67 lô SL-DT hiện ra.
- Trang SL-DT 5 báo cáo (Sản lượng / Doanh thu / Chỉ tiêu / Tiến độ XD / Tiến độ nộp tiền) render đúng cấu trúc Excel.
- Reconcile script T12 báo 0 diff với file gốc cho các cell compute (H, I, J, K của SL; H, L, M, N, O, P, Q của DT; L, O của Chỉ tiêu).
- Subtotal nhóm/giai đoạn rollup chính xác.
