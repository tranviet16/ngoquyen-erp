---
phase: 2
title: "Frontend — matrix 8 sub-cols + filter UI"
status: pending
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Frontend — matrix 8 sub-cols + filter UI

## Overview
Đổi `<DebtMatrix>` để hiển thị 8 sub-cols/entity (ĐK / Lấy / Trả / CK × TT/HĐ). Tạo `<SupplierMultiSelect>` reusable. Sửa `/cong-no-vt/chi-tiet/page.tsx` đọc `searchParams` và render filter.

## Requirements
- **Functional:**
  - Header table 3 tầng:
    1. Entity name (colSpan=8) | Tổng (colSpan=8)
    2. ĐK (colSpan=2) | Lấy hàng (colSpan=2) | Trả tiền (colSpan=2) | Cuối kỳ (colSpan=2)
    3. TT | HĐ × 4 nhóm
  - Tổng row ở `<tfoot>` cộng dồn 8 metric.
  - Multi-select NCC: combobox check-list từ shadcn/ui (hoặc tự build với `<Popover>` + `<Checkbox>`).
  - URL param `?supplier=1,3,5` → server filter.
  - Nút "Xóa filter" reset về all.
- **Non-functional:**
  - Sticky NCC col (left) khi scroll ngang.
  - Sub-cols TT/HĐ font nhỏ (`text-xs`), số padded numeric (tabular-nums).
  - Negative số: text-destructive.

## Architecture

### Layout matrix
```
┌─────────────┬──────────────────────────────────────────────┬──────┐
│             │ Cty Quản Lý (8 cols)                         │ Tổng │
│ NCC (sticky)├────┬────┬────┬────┬────┬────┬────┬────┬─...──┼──────┤
│             │ ĐK │ ĐK │ Lấy│ Lấy│ Trả│ Trả│ CK │ CK │      │      │
│             │ TT │ HĐ │ TT │ HĐ │ TT │ HĐ │ TT │ HĐ │      │      │
├─────────────┼────┼────┼────┼────┼────┼────┼────┼────┼─...──┼──────┤
│ Quang Minh  │ ...│ ...│ ...│ ...│ ...│ ...│ ...│ ...│      │      │
└─────────────┴────┴────┴────┴────┴────┴────┴────┴────┴──────┴──────┘
```

### Component split
- `<DebtMatrix>` — pure presentational, nhận `rows: MatrixRow[]` (từ phase 1) + `entities` + `partyLabel`.
- `<SupplierMultiSelect>` — controlled, props `{ suppliers, selected, onChange }`. Bên trong dùng `useRouter`/`useSearchParams` của `next/navigation` để đẩy URL.
- Page là Server Component: parse `searchParams.supplier` → array number → fetch → render.

### URL state
- `searchParams.supplier`: chuỗi CSV "1,3,5". Empty/missing = all.
- Khi user thay đổi: `router.push("?supplier=1,3", { scroll: false })`.

## Related Code Files
- Modify: `components/ledger/debt-matrix.tsx` (rewrite — 8 sub-cols)
- Create: `components/ledger/supplier-multi-select.tsx`
- Modify: `app/(app)/cong-no-vt/chi-tiet/page.tsx` (đọc searchParams + render filter)

## Implementation Steps
1. **DebtMatrix rewrite**:
   - Cập nhật `DebtMatrixRow` interface khớp `MatrixRow` của phase 1 (8 metric/cell + totals).
   - Header 3 tầng (HTML colSpan + 2 hàng `<tr>` cho group + sub).
   - Sticky col đầu: `className="sticky left-0 bg-background z-10"`.
   - Số format VND không phần lẻ: dùng helper `fmt(n)` đã có.
   - Tổng row cộng dồn từ `rows` ở client (hoặc dùng `row.totals` nếu phase 1 đã pre-compute — preferred).
2. **SupplierMultiSelect**:
   - Dựng từ `<Popover>` + `<Command>` (shadcn) + `<Checkbox>`. Nếu chưa có cmd component, fallback `<select multiple>`.
   - Search box trong popover (ListSearch trên `name`).
   - Footer: nút "Xóa" + "Áp dụng" — Áp dụng push URL.
3. **Page server component**:
   ```tsx
   export default async function Page({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
     const sp = await searchParams;
     const partyIds = sp.supplier ? sp.supplier.split(",").map(Number).filter(Number.isFinite) : undefined;
     const [matrix, entities, suppliers] = await Promise.all([
       getMaterialDebtMatrix({ partyIds }),
       prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
       prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
     ]);
     // ... render <SupplierMultiSelect> + <DebtMatrix>
   }
   ```
4. Test thủ công:
   - Trang load không filter → all NCC.
   - `?supplier=1` → 1 hàng.
   - `?supplier=1,2` → 2 hàng + tổng cộng dồn.
   - Click NCC khác trong dropdown → URL update, table re-render.

## Success Criteria
- [ ] Bảng hiện đầy đủ 8 sub-cols/entity với header 3 tầng đúng.
- [ ] Cuối kỳ ở mỗi cell = ĐK + Lấy − Trả (verify visual với 1 cell).
- [ ] Sticky NCC col khi scroll ngang.
- [ ] Multi-select hoạt động: chọn → URL update → server re-fetch → table cập nhật.
- [ ] "Xóa filter" → URL clean, hiện all.
- [ ] Không có error console (cả browser và server).

## Risk Assessment
- **Risk**: `<select multiple>` xấu, `<Command>` shadcn chưa có.
  **Mitigation**: Check `components/ui/`. Nếu thiếu, fallback `<details>` + `<input type=checkbox>` list. Đẹp hơn ở V2.
- **Risk**: 48-col bảng tràn viewport, header layered nhầm.
  **Mitigation**: `min-w-[80px]` cho mỗi sub-col + container `overflow-x-auto`. Header `<th>` colspan/rowspan kiểm tra kỹ.
- **Risk**: `useSearchParams` cause hydration mismatch.
  **Mitigation**: SupplierMultiSelect là client component (`"use client"`), nhận `defaultValue` từ server prop, không đọc URL trước hydration.
