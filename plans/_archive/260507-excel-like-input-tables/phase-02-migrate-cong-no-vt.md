---
phase: 2
title: "Migrate Cong No VT (Vật tư)"
status: pending
priority: P2
effort: "1-1.5d"
dependencies: [1]
---

# Phase 2: Migrate Cong No VT

## Overview

Replace `<TransactionGrid>` (cong-no-vt nhập liệu) và `<OpeningBalanceClient>` (so-du-ban-dau VT) bằng `<DataGrid>` từ Phase 1.

## Requirements

**Functional:**
- `cong-no-vt/nhap-lieu`: edit/add/delete giao dịch (TT/HĐ — Lấy hàng / Thanh toán / Điều chỉnh), paste range
- `cong-no-vt/so-du-ban-dau`: edit/add/delete số dư đầu kỳ
- Phân quyền: admin full, kế toán theo role (TBD theo logic hiện tại — preserve)
- FK select: entity, supplier, project, item — render bằng select cell

**Non-functional:**
- Không thay đổi service `lib/cong-no-vt/material-ledger-service.ts` interface (chỉ thêm `bulkUpsertMaterialTransactions`)
- Validation Zod giữ nguyên schema `lib/cong-no-vt/schemas.ts`

## Architecture

```
app/(app)/cong-no-vt/nhap-lieu/page.tsx   (server component, không đổi nhiều)
  └─ <CongNoVtNhapLieuGrid>                (client, dynamic import)
       └─ <DataGrid<TransactionRow>>
            ├─ columns: 18 cột (date, type, entity, party, project, item, amountTt/Hd, vat..., invoiceNo, content, status, note)
            └─ handlers → server actions

app/(app)/cong-no-vt/so-du-ban-dau/page.tsx
  └─ <CongNoVtOpeningGrid>                 (client, dynamic import)
       └─ <DataGrid<OpeningBalanceRow>>
            └─ handlers → setOpeningBalance / deleteOpeningBalance
```

## Related Code Files

**Create:**
- `components/cong-no-vt/nhap-lieu-grid.tsx` — client wrapper với dynamic import `<DataGrid>`
- `components/cong-no-vt/opening-grid.tsx` — tương tự cho số dư đầu kỳ

**Modify:**
- `app/(app)/cong-no-vt/nhap-lieu/page.tsx` — render `<CongNoVtNhapLieuGrid>` thay `<TransactionGrid>`
- `app/(app)/cong-no-vt/so-du-ban-dau/page.tsx` — render `<CongNoVtOpeningGrid>` thay `<OpeningBalanceClient>`
- `lib/cong-no-vt/material-ledger-service.ts` — thêm `bulkUpsertMaterialTransactions(rows)` server action

**Delete (sau khi verify):**
- `components/ledger/transaction-grid.tsx` (nếu chỉ dùng bởi VT) — nếu dùng chung NC, để Phase 3 xóa
- `components/ledger/opening-balance-client.tsx` (tương tự)

## Implementation Steps

1. Đọc `components/ledger/transaction-grid.tsx` để map cột → `DataGridColumn<TransactionRow>[]`
2. Viết `components/cong-no-vt/nhap-lieu-grid.tsx`:
   - `"use client"` + `dynamic(() => import("@/components/data-grid/data-grid"), { ssr: false })`
   - Định nghĩa columns array (18 cột)
   - Map handlers: `onCellEdit` → `updateMaterialTransaction(id, { [col]: value })`
   - `onBulkPaste` → `bulkUpsertMaterialTransactions(rows)`
   - `onAddRow` → `createMaterialTransaction(template)`
   - `onDeleteRows` → `Promise.all(ids.map(softDeleteMaterialTransaction))`
3. Thêm `bulkUpsertMaterialTransactions` vào service:
   ```ts
   export async function bulkUpsertMaterialTransactions(rows: Partial<TransactionRow>[]) {
     const validated = rows.map(r => transactionUpsertSchema.parse(r));
     return bulkUpsert(prisma.materialTransaction, validated);
   }
   ```
4. Update `app/(app)/cong-no-vt/nhap-lieu/page.tsx` — swap import + component
5. Lặp lại 1-4 cho `so-du-ban-dau` (ít cột hơn, đơn giản hơn)
6. Compile check + manual test trên dev server:
   - Edit 1 cell, verify DB
   - Paste 5×3 từ Excel, verify DB
   - Add row, verify DB
   - Delete 2 rows, verify soft delete

## Success Criteria

- [ ] Trang `/cong-no-vt/nhap-lieu` render bằng `<DataGrid>`, không lỗi console
- [ ] Edit cell amountTt → DB update đúng (psql verify)
- [ ] Paste range 10×4 từ Excel thật vào grid → tất cả row vào DB
- [ ] Add row mới qua nút "+ Thêm dòng" → row xuất hiện + DB có entry
- [ ] Delete 2 row → `deletedAt` set, row biến khỏi grid
- [ ] Số dư ban đầu trang cũng hoạt động tương tự
- [ ] Báo cáo summary (`/cong-no-vt`) sau khi sửa data → số liệu cập nhật đúng

## Risk Assessment

| Risk | Mitigation |
|---|---|
| FK select cell với 1000+ supplier slow | Glide có search-in-cell built-in; nếu chậm, switch sang autocomplete dropdown overlay |
| Decimal serialize Tt vs Hd phức tạp | Giữ `serializeDecimals` ở server, parse string → Decimal ở `bulkUpsert` validator |
| Computed `vatTt`, `totalTt` (server-side) | Server action recompute sau khi nhận amountTt + vatPctTt; client không gửi computed |
| `transactionType` enum strict | Cell kind = "select" với options từ enum, không cho free text |

## Dependencies

Blocked by Phase 1.
