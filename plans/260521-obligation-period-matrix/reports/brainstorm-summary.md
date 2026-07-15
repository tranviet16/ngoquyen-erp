---
title: "Nhập phát sinh theo kỳ — ma trận cho Nghĩa vụ Nhà nước"
date: 2026-05-21
status: approved
relatedPlan: plans/260521-state-obligations-tracking/
---

# Brainstorm: Nhập phát sinh nghĩa vụ theo kỳ

## Vấn đề

Module Nghĩa vụ Nhà nước đã track `phai_tra` qua sổ phẳng `/so-theo-doi` — nhưng UX không khớp tư duy kế toán. Kế toán làm việc theo kỳ: "tháng 5/2026, mỗi nghĩa vụ bao nhiêu". Sổ phẳng bắt chọn lại nghĩa vụ + ngày + loại + gõ tiền cho mỗi dòng. 8 nghĩa vụ × 12 tháng = 96 lượt thao tác/năm, dễ sót, không match `tax declaration` mental model.

**Không phải bài toán tự động hóa** — kế toán đã có số (từ tờ khai/Excel), chỉ cần chỗ nhập nhanh theo kỳ. Cũng không có module lương → không thể auto-compute BHXH/TNCN dù muốn.

## Decisions (đã chốt với user)

| # | Quyết định | Giá trị |
|---|------------|---------|
| D1 | Phương án | **A — Ma trận theo kỳ** (KISS, không đổi schema) |
| D2 | Phạm vi ma trận | **Cả `Phải trả` và `Đã nộp`** trong cùng lưới |
| D3 | Vị trí | **Tab trên `/so-theo-doi`** — 2 tab: "Nhập theo kỳ" (mặc định) + "Sổ chi tiết" (lưới phẳng hiện tại) |

## Thiết kế

### Mô hình "canonical txn"

Mỗi ô ma trận map về **đúng 1** `StateObligationTxn` cho bộ `(typeId, period, kind)`:
- Date stamp = **ngày cuối kỳ** (tháng 5/2026 → `2026-05-31`; quý 2/2026 → `2026-06-30`; năm 2026 → `2026-12-31`). Báo cáo dùng `date >= start AND date < end` exclusive nên ngày cuối luôn nằm trong kỳ.
- Số tiền cell = `amount` của canonical txn.
- Đặt 0/trống ⇒ soft-delete canonical txn (kéo theo soft-delete JE liên kết qua `deleteTxnWithSync` sẵn có).

### Edge case: nhiều dòng cho cùng `(type × period × kind)`

Khi sổ chi tiết đã có ≥2 dòng `phai_tra` cho cùng `(type, period)` (vd 2 lần điều chỉnh GTGT):
- Ô ma trận hiện **tổng** nhưng **chỉ-đọc**, kèm hint "nhiều dòng — sửa ở Sổ chi tiết".
- Không cho gộp tổng về 1 số vì sẽ làm hỏng các dòng tách (mất refNo, mất description riêng).
- Áp dụng đối xứng cho cả `da_nop`.

### Cấu trúc lưới

| Cột | Edit | Note |
|-----|------|------|
| Nghĩa vụ | read-only | Tất cả type từ `/danh-muc`, gộp nhóm Thuế / Bảo hiểm / Khác |
| Đầu kỳ | read-only | Carry-in từ kỳ trước (formula sẵn) |
| Phải trả (VND) | editable | Đặt = 0 ⇒ delete canonical txn |
| Đã nộp (VND) | editable | Đặt = 0 ⇒ delete canonical txn + JE |
| TK tiền | editable (select) | **Required khi Đã nộp > 0**; trống là validation error |
| Cuối kỳ | read-only | `Đầu + Phải trả − Đã nộp` |

### Đồng bộ JournalEntry

- Mọi save từ ma trận đi qua `bulkUpsertObligationTxns` sẵn có → `createTxnWithSync` / `updateTxnWithSync` / `deleteTxnWithSync` tự sync JE trong transaction. Không cần code sync mới.
- Auto-set `description = "Nghĩa vụ {type.name} {period label}"` để JE chi đọc được. `refNo` để trống — nhập chi tiết ở Sổ chi tiết nếu cần.

### Tab layout `/so-theo-doi`

```
/so-theo-doi
├── [Tab default] Nhập theo kỳ
│   ├── PeriodSelector (Tháng/Quý/Năm + index) — tái dùng obligation-period-selector
│   └── Ma trận (rows = obligation types, cols như trên)
└── [Tab] Sổ chi tiết
    └── DataGrid phẳng hiện tại (giữ nguyên)
```

## Scope

### Tạo mới

- `components/tai-chinh/obligation-period-matrix-client.tsx` — period selector + matrix grid + save handler
- `lib/tai-chinh/state-obligation-matrix.ts` — `getObligationMatrix(period)` + `saveObligationMatrix(period, rows)`
- Update `app/(app)/tai-chinh/nghia-vu-nha-nuoc/so-theo-doi/page.tsx` — wrap 2 tab

### Không đổi

- Schema Prisma (không migration)
- Service `state-obligation-service.ts` (tái dùng `bulkUpsertObligationTxns`)
- `state-obligation-internal.ts` (JE sync helpers giữ nguyên)
- `state-obligation-report.ts` (formula báo cáo giữ nguyên)
- ACL (vẫn `requireRoleModuleAccess("tai-chinh", "edit")`)

### Effort

~½ ngày. 1 trang + 1 component + 1 service file.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| User nhập ở matrix năm 2026 ⇒ txn date = 31/12 ⇒ tab month tháng 5 hiện 0 (gây nhầm) | Hint nhỏ trên matrix: "Số nhập sẽ ghi ngày cuối {kỳ}. Nhập theo tháng nếu cần chi tiết." |
| Đã nộp > 0 nhưng quên TK tiền ⇒ JE có `fromAccountId = null` | Validation client-side block save; server cũng từ chối với error rõ ràng |
| Multi-row case làm ô khóa, user không biết tách dòng ở đâu | Tooltip ô + link "Mở Sổ chi tiết với filter type X, kỳ Y" |
| Race: 2 user edit cùng ô ⇒ last-write-wins gộp sai | YAGNI cho v1 — kế toán thường làm 1 người. Note ở docs nếu mở rộng team. |

## Success criteria

- Mở `/so-theo-doi` mặc định thấy tab "Nhập theo kỳ" với period = tháng hiện tại
- Nhập Phải trả + Đã nộp + TK tiền → save → reload thấy số cũ
- Đặt = 0 ⇒ canonical txn (và JE nếu Đã nộp) bị soft-delete
- Đã nộp > 0 không có TK tiền ⇒ validation error, không save
- Tab "Sổ chi tiết" vẫn hoạt động đầy đủ như hiện tại
- Multi-row cell khóa đúng, hiện tổng đúng, hint hiển thị
- `tsc --noEmit` + lint + tests xanh
- Báo cáo `/bao-cao` ra số khớp với matrix

## Ngoài phạm vi (YAGNI)

- Ma trận 12 tháng × N nghĩa vụ trên 1 màn hình (year matrix)
- Auto-compute từ doanh thu/lương (cần build module lương trước)
- Lịch nhắc hạn nộp
- Import Excel theo kỳ
- Per-cell description / refNo (đã có ở Sổ chi tiết)
