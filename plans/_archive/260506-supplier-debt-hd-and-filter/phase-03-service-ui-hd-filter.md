---
phase: 3
title: Service+UI HD+filter
status: completed
priority: P1
effort: 1.5h
dependencies:
  - 2
---

# Phase 3: Service + UI (HD columns + supplier multi-filter)

## Overview
Mở rộng service trả thêm 3 field HĐ + summary HĐ + filter `suppliers?: string[]`. UI: đổi bảng thành 6 cột tiền (TT/HĐ pair), thêm multi-select NCC sync URL `?suppliers=A,B,C`, thêm 4 summary cards mới (TT + HĐ).

## Requirements
- Functional:
  - Service nhận `{ projectId, suppliers? }`; nếu suppliers truthy & length>0 → `where.supplierName: { in: suppliers }`.
  - UI hiển thị: SL, ĐVT, Đơn giá, **Lấy hàng TT, Lấy hàng HĐ, Đã trả TT, Đã trả HĐ, Còn nợ TT, Còn nợ HĐ**, Ghi chú.
  - Summary cards: rowCount, Tổng còn nợ TT, Tổng còn nợ HĐ, **Tổng còn nợ (TT+HĐ)** (highlight).
  - Multi-select dropdown NCC: nguồn = distinct supplierName của project, có ô search, checkbox; nút "Tất cả NCC" clear filter; chip hiển thị số NCC đang chọn.
- Non-functional: filter persist qua URL share; không cần client-side virtualization (snapshot table thường < 200 row).

## Architecture
- Service: thêm tham số `suppliers` (array string). Page server component đọc `searchParams.suppliers` (CSV), split → array, truyền xuống. Client component dùng `useRouter().push` cập nhật URL khi user đổi filter.
- Multi-select: dùng shadcn `Popover` + `Command` + `Checkbox` (đã có trong codebase) — KHÔNG tạo lib mới. Tham khảo `components/ui/` để xem component nào sẵn.

## Related Code Files
- Modify: `lib/du-an/supplier-debt-service.ts`
- Modify: `app/(app)/du-an/[id]/cong-no/page.tsx`
- Modify: `app/(app)/du-an/[id]/cong-no/cong-no-client.tsx`
- (Có thể) Create: `app/(app)/du-an/[id]/cong-no/supplier-multi-select.tsx` (tách component nếu >50 dòng)

## Implementation Steps

### 3.1 Service
1. Mở rộng `SupplierDebtRow` thêm `amountTakenHd / amountPaidHd / balanceHd: number | null`.
2. Mở rộng `SupplierDebtSummary` thêm `totalTakenHd / totalPaidHd / totalBalanceHd: number; totalBalanceCombined: number`.
3. Đổi signature:
   ```ts
   listProjectSupplierDebts(projectId: number, suppliers?: string[]): Promise<SupplierDebtRow[]>
   getProjectSupplierDebtSummary(projectId: number, suppliers?: string[]): Promise<SupplierDebtSummary>
   ```
4. Thêm helper `listProjectSupplierNames(projectId: number): Promise<string[]>` — distinct supplierName cho filter dropdown.
5. Map 3 field HĐ y hệt pattern TT (Decimal → number | null).

### 3.2 page.tsx
```ts
const sp = await searchParams;
const suppliers = sp.suppliers ? sp.suppliers.split(",").filter(Boolean) : undefined;
const [rows, summary, supplierNames] = await Promise.all([
  listProjectSupplierDebts(projectId, suppliers),
  getProjectSupplierDebtSummary(projectId, suppliers),
  listProjectSupplierNames(projectId),
]);
return <CongNoClient rows={rows} summary={summary} supplierNames={supplierNames} initialFilter={{ suppliers: suppliers ?? [] }} />;
```

### 3.3 cong-no-client.tsx
1. Đổi `colDefs` thành 6 cột tiền: tách cặp Lấy hàng TT/HĐ, Đã trả TT/HĐ, Còn nợ TT/HĐ. Mỗi cột width 130-140, vndFormatter, type numericColumn, textAlign right.
2. Thay 4 SummaryCard cũ thành 6:
   - Số dòng
   - Tổng lấy hàng TT  
   - Tổng lấy hàng HĐ
   - Tổng còn nợ TT
   - Tổng còn nợ HĐ
   - Tổng còn nợ tổng hợp (TT+HĐ) — highlight destructive
3. Thêm khu filter trên bảng:
   ```tsx
   <SupplierMultiSelect
     options={supplierNames}
     value={selected}
     onChange={(next) => {
       const params = new URLSearchParams();
       if (next.length) params.set("suppliers", next.join(","));
       startTransition(() => router.push(`?${params.toString()}`));
     }}
   />
   <Button variant="outline" onClick={() => router.push("?")}>Tất cả NCC</Button>
   ```
4. State: `useState<string[]>(initialFilter.suppliers)` đồng bộ với URL.

### 3.4 SupplierMultiSelect component
- Popover trigger button: hiển thị "Tất cả NCC" nếu rỗng, "{N} NCC" nếu chọn.
- Popover content: Input search + danh sách checkbox scroll.
- Khi onChange: gọi prop `onChange(newArray)`.
- < 80 dòng. Không state phức tạp — controlled component.

### 3.5 Type-check + format
```bash
npm run typecheck
```

## Success Criteria
- [ ] Type-check pass
- [ ] Bảng hiện 6 cột tiền + ghi chú; Còn nợ HĐ có giá trị (sau re-import)
- [ ] Chọn 1 NCC → URL có `?suppliers=X`, table chỉ NCC đó, summary cards đổi theo
- [ ] Chọn nhiều NCC → URL `?suppliers=A,B,C`, hoạt động đúng
- [ ] Click "Tất cả NCC" → URL clear, hiện tất cả
- [ ] Reload trang giữ nguyên filter

## Risk Assessment
- Risk: cột nhiều → bảng tràn ngang trên màn nhỏ. **Mitigation:** AG-Grid auto-scroll horizontal sẵn; giữ width ~130 mỗi cột tiền; ưu tiên freeze cột `supplierName + itemName` (`pinned: "left"`).
- Risk: distinct supplierName trả thuộc tính tiếng Việt có dấu / khoảng trắng leading → so sánh nhầm. **Mitigation:** trim ngay trong service, so sánh exact string.
- Risk: URL param dài khi chọn nhiều NCC. **Mitigation:** nếu select all (length === supplierNames.length) → clear param thay vì gửi full list.
