---
title: "Nhập phát sinh nghĩa vụ theo kỳ (ma trận)"
status: completed
priority: P2
created: 2026-05-21
planDir: plans/260521-obligation-period-matrix
relatedPlan: plans/260521-state-obligations-tracking
blockedBy: []
blocks: []
---

# Ma trận nhập phát sinh theo kỳ — Nghĩa vụ Nhà nước

UX "nhập theo kỳ" cho module Nghĩa vụ Nhà nước. Kế toán đã có số (tính ngoài) → cần ô lưới điền nhanh theo kỳ thay vì sổ phẳng.

Context: [reports/brainstorm-summary.md](reports/brainstorm-summary.md)
Tái dùng từ: [plans/260521-state-obligations-tracking/](../260521-state-obligations-tracking/) (đã ship)

## Kiến trúc chốt

- **KHÔNG đổi schema, KHÔNG migration.** Tái dùng `StateObligationTxn`.
- **Canonical txn:** mỗi ô = đúng 1 txn cho bộ `(typeId × period × kind)`. Date = ngày cuối kỳ.
- **Multi-row guard:** ≥2 txn cùng `(type × period × kind)` → ô chỉ-đọc, hiện tổng, hint sang Sổ chi tiết.
- **Đã nộp ⇒ TK tiền required.** Save đi qua `bulkUpsertObligationTxns` sẵn có → `*WithSync` tự đồng bộ JournalEntry trong transaction.
- **UI:** 2 tab trên `/so-theo-doi` — "Nhập theo kỳ" (mặc định) + "Sổ chi tiết" (DataGrid hiện tại).
- **ACL:** giữ nguyên `requireRoleModuleAccess("tai-chinh", "edit")`.

## Phases

| # | Phase | Status | Priority | Effort | Mô tả |
|---|-------|--------|----------|--------|-------|
| 1 | [Service layer](phase-01-service-layer.md) | completed | P1 | 2h | `state-obligation-matrix.ts` — get/save canonical txns + multi-row guard |
| 2 | [UI: ma trận + tabs](phase-02-ui-matrix-tabs.md) | completed | P1 | 2h | Client component + restructure `/so-theo-doi` thành 2 tab |
| 3 | [Tests](phase-03-tests.md) | completed | P2 | 1h | Unit tests cho matrix service (canonical lookup, save, guard, validation) |

## Dependencies

- Phase 1 → 2 → 3. Phase 3 có thể chạy song song với Phase 2.

## Success criteria

- Mở `/so-theo-doi` mặc định thấy tab "Nhập theo kỳ" với period = tháng hiện tại
- Nhập Phải trả + Đã nộp + TK tiền → save → reload thấy số cũ
- Đặt = 0 ⇒ canonical txn (và JE nếu Đã nộp) bị soft-delete
- Đã nộp > 0 không có TK tiền ⇒ validation error
- Tab "Sổ chi tiết" giữ nguyên hành vi
- Multi-row cell khóa đúng, hiện tổng, hint hiển thị
- `tsc --noEmit` + lint + vitest xanh
- Báo cáo `/bao-cao` khớp số với matrix

## Ngoài phạm vi (YAGNI)

Year-matrix 12 cột; auto-compute từ doanh thu/lương; lịch nhắc hạn nộp; import Excel theo kỳ; per-cell description/refNo (đã có ở Sổ chi tiết).
