---
phase: 2
title: "UI: ma trận theo kỳ + tab restructure"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: UI ma trận + 2 tab trên /so-theo-doi

## Overview

Client component `obligation-period-matrix-client.tsx` (period selector + DataGrid ma trận) + restructure `/so-theo-doi/page.tsx` thành 2 tab.

## Requirements

- Functional:
  - Tab "Nhập theo kỳ" (default) — period selector + matrix grid.
  - Tab "Sổ chi tiết" — `ObligationTxnGridClient` hiện tại, không đổi.
  - State tab + period sync qua URL search params (`?tab=...&period=...&index=...&year=...`).
  - Matrix grid: rows = mỗi obligation type, cột: Nghĩa vụ (read-only), Đầu kỳ (read-only), Phải trả (edit currency), Đã nộp (edit currency), TK tiền (edit select), Cuối kỳ (read-only).
  - Save: `onCellEdit` → gọi `saveObligationMatrix` cho row đó.
  - Multi-row cell: render `disabled` + tooltip "Nhiều dòng — sửa ở Sổ chi tiết".
  - Validation client-side: trước khi save, nếu Đã nộp > 0 mà TK tiền null ⇒ toast/alert chặn save.
- Non-functional:
  - Format VND qua `formatVND` (`lib/utils/format`).
  - Tabs: dùng shadcn/ui Tabs (đã có trong codebase) nếu sẵn; fallback button group + state.

## Architecture

```
/so-theo-doi/page.tsx (modified)
├── Parse searchParams: tab, period, index, year
├── Load data theo tab:
│   ├── tab=nhap-theo-ky → getObligationMatrix({periodKind, year, periodIndex}) + listCashAccounts
│   └── tab=so-chi-tiet  → listObligationTxns + listObligationTypes + listCashAccounts (như cũ)
└── Render <Tabs> với 2 panel
    ├── <ObligationPeriodMatrixClient .../>
    └── <ObligationTxnGridClient .../>  // unchanged
```

`obligation-period-matrix-client.tsx` cấu trúc giống `obligation-txn-grid-client.tsx`:
- Props: `rows: MatrixRow[]`, `cashAccounts: SelectOption[]`, period params (để hiển thị label).
- Period selector ở trên (tái dùng `ObligationPeriodSelector`).
- DataGrid với columns động — `phai_tra_amount`/`da_nop_amount` editable hoặc disabled tùy `multiRow` flag.
- `onCellEdit` async → gọi `saveObligationMatrix` với 1 row patch → `router.refresh()`.

## Related Code Files

- Create: `components/tai-chinh/obligation-period-matrix-client.tsx`
- Modify: `app/(app)/tai-chinh/nghia-vu-nha-nuoc/so-theo-doi/page.tsx`
- Read for context: `components/tai-chinh/obligation-txn-grid-client.tsx`, `components/tai-chinh/obligation-period-selector.tsx`, `components/data-grid/types.ts`, `components/ui/tabs.tsx` (nếu có)
- Delete: none

## Implementation Steps

1. Check shadcn Tabs sẵn có (`components/ui/tabs.tsx`). Nếu chưa: chọn button group đơn giản với URL search param (KISS).
2. Tạo `obligation-period-matrix-client.tsx`:
   - Props + types.
   - State: dùng `router.refresh()` sau mỗi save; không cần local state nặng.
   - Columns array dynamic — readonly cell khi `multiRow`.
   - Default new row template: N/A (matrix là fixed rows, không thêm row mới).
   - `handlers.onCellEdit` async: build patch object → call `saveObligationMatrix(period, [{typeId, ...currentCells, [col]: value}])` → `router.refresh()`.
   - Tip box trên đầu: "Số nhập sẽ ghi ngày cuối {kỳ label}. Cần chi tiết hơn → dùng tab Sổ chi tiết."
3. Update `so-theo-doi/page.tsx`:
   - Receive `searchParams` from page props (Next.js App Router).
   - Parse `tab` (default = `nhap-theo-ky`), `period`/`index`/`year` (default = current month).
   - Conditional fetch theo tab để giảm payload.
   - Render `<Tabs>` với 2 `<TabsContent>`.
4. Default period = current month UTC.
5. Test bằng browser: load page, switch tab, đổi kỳ, sửa ô, kiểm tra số lưu/load.

## Success Criteria

- [ ] Mở `/so-theo-doi` mặc định = tab "Nhập theo kỳ", period = tháng hiện tại
- [ ] Chuyển tab giữ nguyên period qua URL
- [ ] Nhập Phải trả + Đã nộp + TK tiền → reload trang vẫn thấy
- [ ] Đặt amount = 0 ⇒ ô trống ở lần load sau
- [ ] Đã nộp > 0 không TK tiền ⇒ toast lỗi, không save
- [ ] Multi-row cell hiển thị disabled + tooltip
- [ ] Tab "Sổ chi tiết" hành vi như trước
- [ ] `tsc --noEmit` + lint pass
- [ ] Báo cáo `/bao-cao` khớp số với matrix

## Risk Assessment

- **Risk:** shadcn Tabs chưa có ⇒ phải tự code. **Mitigation:** fallback URL search param + 2 button đơn giản (KISS).
- **Risk:** DataGrid hiện không hỗ trợ disabled cell theo flag. **Mitigation:** kiểm tra `DataGridColumn` API; nếu không, render bằng `kind: "text"` + `editable: false` hoặc workaround render override. Nếu không có thì YAGNI v1: cho phép edit và rely on server skip — nhưng UX kém. Ưu tiên tìm cách disable.
- **Risk:** `router.refresh()` sau mỗi cell edit hơi chậm (full SSR re-fetch). **Mitigation:** ổn với <20 ô; nếu chậm sau này → optimistic update + batched save.
