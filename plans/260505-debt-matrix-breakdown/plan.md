---
title: "Báo cáo công nợ — breakdown 4 nhóm + filter NCC"
status: pending
priority: P2
created: 2026-05-05
effort: "3-4h"
---

# Báo cáo công nợ — breakdown + filter NCC

## Goal
Mở rộng `/cong-no-vt/chi-tiet` (và `/cong-no-nc/chi-tiet`) từ matrix 1 số dư/ô thành matrix breakdown **Đầu kỳ / Lấy hàng / Trả tiền / Cuối kỳ × (TT, HĐ)** = 8 sub-cols/entity. Thêm filter multi-select NCC ở đầu trang.

## Why
1. Báo cáo hiện tại không khớp Excel SOP về *layout* — chỉ show số dư cuối, thiếu chi tiết phát sinh.
2. User cần xem nhanh tổng lấy hàng / tổng trả tiền theo từng (NCC, chủ thể) để đối chiếu.
3. Filter NCC cho phép focus 1 NCC hoặc compare 2-3 NCC mà không scroll qua toàn bộ list.

## Non-goals
- KHÔNG thêm cột `dieu_chinh` riêng — material ledger không dùng (per user).
- KHÔNG thêm filter theo entity / project / khoảng thời gian (V2 nếu cần).
- KHÔNG thay đổi schema DB — chỉ đổi query + UI.
- KHÔNG xử lý trang `/cong-no-vt/bao-cao-thang` (đã có flow riêng).

## Scope
| Module | Trang | Áp dụng |
|---|---|---|
| Vật tư NCC | `/cong-no-vt/chi-tiet` | ✅ chính |
| Lương NCC | `/cong-no-nc/chi-tiet` | ✅ reuse component |

Component `DebtMatrix` + `SupplierMultiSelect` viết generic, dùng cho cả 2 ledgerType.

## Phases

| # | Title | Status | Effort |
|---|---|---|---|
| 1 | Backend — query breakdown + filter | pending | ~1.5h |
| 2 | Frontend — matrix 8 sub-cols + filter UI | pending | ~1.5h |
| 3 | Apply NCC ăn lương + verify data | pending | ~1h |

Chi tiết:
- [phase-01-backend-breakdown.md](phase-01-backend-breakdown.md)
- [phase-02-frontend-matrix-filter.md](phase-02-frontend-matrix-filter.md)
- [phase-03-apply-nhan-cong-and-verify.md](phase-03-apply-nhan-cong-and-verify.md)

## Dependencies
- Đã merge: `260505-import-run-rollback` (rollback feature) — cần để re-import sạch trước khi verify số liệu.
- DB phải có dữ liệu material ledger sau re-import (335 rows kỳ vọng).

## Success criteria (high-level)
- [ ] `/cong-no-vt/chi-tiet` hiển thị 8 sub-cols/entity với data đúng.
- [ ] `Cuối kỳ = Đầu kỳ + Lấy hàng − Trả tiền` ở từng cell và tổng cột.
- [ ] Multi-select NCC: trống → all, chọn N → chỉ N hàng + tổng tương ứng.
- [ ] URL share-able: `?supplier=1,3,5` reproduce đúng filter.
- [ ] `/cong-no-nc/chi-tiet` áp dụng cùng pattern, không regression.
- [ ] Spot-check: tổng lấy hàng + trả tiền cho 2 NCC mẫu khớp tab "Báo cáo" Excel.

## Risks
- **Bảng quá rộng** (5 entity × 8 + 8 tổng = 48 cols) → sticky NCC col + scroll-x; nếu user kêu chật, V2 chuyển drill-down.
- **Performance**: query `queryDebtMatrix` đang full-scan ledger_transactions. Với 335 rows hiện tại không đáng lo, nhưng khi data lớn cần index `(ledgerType, partyId, transactionType)`. Defer.
- **Decimal precision** qua RSC boundary — đã chốt convert sang `number` ở server (precedent từ fix `t.isNegative` trước).
