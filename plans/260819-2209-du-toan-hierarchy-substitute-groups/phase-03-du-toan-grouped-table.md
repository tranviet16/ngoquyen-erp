# Phase 03 — Rebuild tab Dự Toán thành grouped table

## Context links

- Brainstorm §A DECISION 3 (bỏ DataGrid inline)
- Client hiện tại: `app/(app)/du-an/[id]/du-toan/du-toan-client.tsx` (211 dòng, DataGrid + CrudDialog + admin raw patch)
- Service (không đổi): `lib/du-an/estimate-service.ts` — `createEstimate/updateEstimate/adminPatchEstimate/softDeleteEstimate`
- Form: `app/(app)/du-an/[id]/du-toan/du-toan-form.tsx` (giữ)
- Pure helper Phase 02: `lib/du-an/category-tree.ts`

## Overview

Thay DataGrid bằng grouped table (HM → section → dòng), giữ CRUD dialog (Thêm/Sửa/Xóa) và thêm inline edit cheap cho `qty`, `unitPrice` (numeric text input pattern giống `OverrideCell`). Preserve `canCreate/canEdit/canDelete/isAdmin` capability flags.

## Key insights

- **Không** teach DataGrid tree. **Không** tái sử dụng component với du-toan-dieu-chinh. Copy pattern.
- Inline edit chỉ cho `qty` và `unitPrice` (2 cột nóng). Cột `itemName`, `unit`, `categoryId`, `itemCode`, `note` → dialog "Sửa đầy đủ". Admin-only cột `totalVnd, unit` giữ qua dialog admin panel (không inline nữa để tránh phải mock role).
- CRUD contract KHÔNG đổi. UpdateEstimate với cùng payload signature.

## Requirements

- FR1: Grouped table HM→section giống Phase 02, thêm cột thao tác cuối row (icon Sửa / Xóa) khi có quyền.
- FR2: Inline edit `qty`, `unitPrice`: click cell → text input → Enter/blur → gọi `updateEstimate(id, merged)`; ESC cancel; loading state trong `useTransition`. Ghi đè `totalVnd = qty × unitPrice` server-side (đã có sẵn).
- FR3: Section subtotal cột `qty` (chỉ khi cùng ĐVT; nếu khác — hiện `—`), `totalVnd`, `% share HM`. HM subtotal + `% share grand`. Grand total.
- FR4: Nút "Thêm hạng mục" (top-right, `hidden={!canCreate}`) mở CrudDialog `EstimateForm` — không đổi.
- FR5: Nút "Sửa đầy đủ" per-row (`hidden={!canEdit}`) mở CrudDialog `EstimateForm` với defaultValues — không đổi.
- FR6: Nút "Xóa" per-row (`hidden={!canDelete}`) → confirm → `softDeleteEstimate`.
- FR7: Nếu `isAdmin`, thêm menu overflow "Sửa raw (admin)" → mini form patch `unit/totalVnd/note` gọi `adminPatchEstimate`.

## Architecture

```
page.tsx (server) → listEstimates + categories → DuToanClient
DuToanClient
  useMemo tree = buildCategoryTree(rows, categoriesById)
  render:
    <TableHead sticky/>
    tree.map(hm):
      <HmRow /> (label + subtotal cols + % share grand)
      hm.sections.map(section):
        <SectionRow /> (label + subtotal + % share hm)
        section.rows.map(r): <ItemRow />
    <GrandTotalRow sticky-bottom/>
  Dialogs: create, editFull, adminRaw
```

Inline numeric cell (helper local `NumericEditCell`):

- Props: `value: number, canEdit: boolean, onCommit: (n: number) => Promise<void>`
- Behavior giống `OverrideCell` (dòng 85–169 can-doi): committed flag, blur+enter, toast error, `router.refresh`.
- Format hiển thị: `vndFormatter` cho unitPrice, `toLocaleString('vi-VN', {maximumFractionDigits: 4})` cho qty.

Section-level subtotal qty guard: kiểm tra `new Set(rows.map(r => normVtName(r.unit))).size === 1` — nếu >1, subtotal qty = `null` → render `—` với tooltip "Đơn vị khác nhau".

## Related code files

- Modify (rebuild): `app/(app)/du-an/[id]/du-toan/du-toan-client.tsx`
- Không sửa: `du-toan-form.tsx`, `estimate-service.ts`, `page.tsx` (trừ khi cần select `note` — verify)
- Import: `lib/du-an/category-tree.ts`, `lib/text/norm-vt-name.ts`

## Implementation steps

1. Xác nhận `page.tsx` trả `initialData` có đủ field cho render (mã, tên, ĐVT, qty, unitPrice, totalVnd, categoryId, note).
2. Copy `NumericEditCell` từ Phase 01 pattern (OverrideCell) — file-local trong client.
3. Build tree qua `useMemo`. Compute subtotals: mỗi HM & section {totalVnd, qtySum-nullable, count}.
4. Render table. Sticky header. Sticky grand total footer row.
5. Wire up inline edit → `updateEstimate` với payload merged (giống hiện tại `patchEstimate` helper).
6. Wire row-level "Sửa đầy đủ" / "Xóa" / admin raw.
7. Xoá `DataGrid` import và `selectedIds` state (thay bằng per-row buttons).
8. Update copy hướng dẫn: "Sửa nhanh: click ô SL hoặc Đơn giá. Sửa các cột khác qua nút 'Sửa đầy đủ'."

## Todo list

- [ ] Rebuild `du-toan-client.tsx`
- [ ] `NumericEditCell` inline pattern
- [ ] Subtotal qty unit-guard (dùng `normVtName`)
- [ ] Test manual: sửa qty → totalVnd tự cập nhật; subtotal update sau `router.refresh()`
- [ ] Test manual: capability flags (viewer không có Thêm/Sửa/Xóa)
- [ ] Test manual: admin raw patch còn hoạt động

## Success criteria

- Dự Toán MNTC-GD1: hiển thị 3 HM groups, subtotal `totalVnd` từng section = Σ dòng con (khớp đến VND).
- Click ô "SL" dòng bất kỳ → sửa → Enter → toast + row refresh, subtotal cập nhật.
- User không phải admin không nhìn thấy menu "Sửa raw".
- Không có DataGrid import trong file này nữa.

## Risk assessment

- **HIGH** — Mất inline edit multi-cell của DataGrid (user đã dùng để nhập liệu nhanh). Mitigation: giữ 2 cột nóng (qty, unitPrice) inline; hướng dẫn Sửa đầy đủ cho phần còn lại. User đã accept trade-off (brainstorm DECISION 3).
- **MED** — Regression capability flags. Mitigation: giữ `hidden={!canX}` giống pattern hiện tại; snapshot test button visibility qua viewer/editor/admin nếu có test infra.
- **LOW** — Subtotal `qty` cross-unit — user hiểu lầm subtotal khi khác đơn vị. Mitigation: `—` + tooltip.

## Security considerations

- Không đổi contract server actions → không mở surface mới.
- Admin raw patch giữ nguyên `requireActiveAdmin` guard trong service.

## Next steps

Phase 04 (phat-sinh totals tree — pattern nhẹ hơn).
