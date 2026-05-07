---
phase: 2
title: Adapter HD parse
status: completed
priority: P1
effort: 30m
dependencies:
  - 1
---

# Phase 2: Adapter HD parse

## Overview
Mở rộng `du-an-xay-dung.adapter.ts` block "Công Nợ" để đọc thêm cặp cột HĐ song song với cặp TT đang có và lưu vào 3 field mới ở Phase 1.

## Requirements
- Functional: với mỗi dòng NCC trong sheet "Công Nợ", parse cả 6 giá trị (TT + HĐ); skip dòng chỉ khi tất cả 6 = 0.
- Non-functional: không phá hành vi cũ — file không có cột HĐ vẫn import bình thường (default = null/0).

## Architecture
Header sheet "Công Nợ" trong file mẫu lặp tên cột (Lấy Hàng / Đã TT / Còn Nợ xuất hiện 2 lần). `buildRowsFromMatrix` đặt suffix `_2` cho lần xuất hiện thứ 2. Adapter hiện tại dùng cặp `_2` = TT, không suffix = HĐ. Đối chiếu lại bằng cách kiểm tra giá trị thật trong file mẫu trước khi finalize mapping.

**Mapping giả định (cần verify ở Phase 4):**
| Field DB | Header Excel |
|---|---|
| `amountTaken` (TT) | `Lấy Hàng_2` |
| `amountPaid` (TT) | `Đã TT_2` |
| `balance` (TT) | `Còn Nợ_2` |
| `amountTakenHd` (HĐ) | `Lấy Hàng` |
| `amountPaidHd` (HĐ) | `Đã TT` |
| `balanceHd` (HĐ) | `Còn Nợ` |

## Related Code Files
- Modify: `lib/import/adapters/du-an-xay-dung.adapter.ts`
  - Block parse: line ~385-418
  - INSERT raw SQL: line ~685-700

## Implementation Steps
1. Trong block parse `Công Nợ` (~line 397-413):
   ```ts
   const amountTaken = num(r["Lấy Hàng_2"] ?? 0);
   const amountPaid  = num(r["Đã TT_2"] ?? 0);
   const balance     = num(r["Còn Nợ_2"] ?? 0);
   const amountTakenHd = num(r["Lấy Hàng"] ?? 0);
   const amountPaidHd  = num(r["Đã TT"] ?? 0);
   const balanceHd     = num(r["Còn Nợ"] ?? 0);
   if (amountTaken === 0 && amountPaid === 0 && balance === 0
       && amountTakenHd === 0 && amountPaidHd === 0 && balanceHd === 0) continue;
   rows.push({
     rowIndex: rowIdx++,
     data: {
       _type: "debt-snapshot",
       supplierName, itemName: itemName || undefined,
       qty: r["SL"] ? num(r["SL"]) : null,
       unit: String(r["ĐVT"] ?? "").trim() || undefined,
       amountTaken, amountPaid, balance,
       amountTakenHd, amountPaidHd, balanceHd,
       note: String(r["Mã"] ?? "").trim() || undefined,
     },
   });
   ```
2. Trong `apply()` block INSERT supplier debt (~line 685-700), thêm 3 cột vào câu INSERT:
   ```ts
   INSERT INTO project_supplier_debt_snapshots
     ("projectId", "supplierName", "itemName", qty, unit, "unitPrice",
      "amountTaken", "amountPaid", balance,
      "amountTakenHd", "amountPaidHd", "balanceHd",
      "asOfDate", note, "importRunId", "createdAt", "updatedAt")
   VALUES (..., ${amountTakenHd ?? null}, ${amountPaidHd ?? null}, ${balanceHd ?? null}, ...)
   ```
   Đọc giá trị từ `row.data.amountTakenHd / amountPaidHd / balanceHd` y hệt pattern TT.
3. Run `npm run typecheck` để chắc adapter compile.

## Success Criteria
- [ ] Type-check pass
- [ ] Re-import file mẫu thấy 3 cột HD trong DB có giá trị > 0 (kiểm bằng `psql` hoặc Prisma Studio)
- [ ] File import không có cột HĐ (legacy) vẫn không lỗi (HD field = null hoặc 0)

## Risk Assessment
- Risk: header mapping `_2` ngược (TT/HĐ tráo) → tổng âm hoặc khớp ngược. **Mitigation:** Phase 4 đối chiếu 1 NCC cụ thể có số rõ ràng, swap mapping nếu sai.
- Risk: dòng `TỔNG` cuối sheet đã skip nhờ filter `supplierName.includes("TỔNG")` — không thay đổi logic skip.
