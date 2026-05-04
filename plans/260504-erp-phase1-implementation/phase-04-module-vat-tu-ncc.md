---
phase: 4
title: "Module: Vật tư theo NCC (per-supplier)"
status: pending
priority: P2
effort: "1w"
dependencies: [2]
---

# Phase 4: Module Vật tư theo NCC

## Overview
Mỗi nhà cung cấp lớn có 1 trang riêng với 3 sheet: Vật tư ngày, Vật tư tháng (view tổng hợp), Đối chiếu công nợ — phản ánh đúng thói quen Excel hiện tại.

## Requirements
**Functional:**
- Sidebar liệt kê tất cả NCC (filter from `suppliers`)
- Trang per-NCC = 3 tab: ngày / tháng / đối chiếu
- Chữ ký số: 3 trường ký Cán bộ vật tư / Chỉ huy CT / Kế toán (chỉ là dropdown chọn user, không cần e-sign)
- Tab "tháng" tự sum từ "ngày" theo `(item, month)`
- Tab "đối chiếu công nợ" theo period có thể chọn

**Non-functional:**
- Tạo NCC mới trong Master Data → tự động xuất hiện trang per-NCC, không cần code thêm

## Architecture
**Schema:**
```prisma
model SupplierDeliveryDaily {       // Vật tư ngày
  id          Int @id @default(autoincrement())
  supplierId  Int
  projectId   Int?                  // optional: phiếu giao theo dự án
  date        DateTime
  itemId      Int
  qty         Decimal @db.Decimal(18,4)
  unit        String                // snapshot từ Item.unit
  cbVatTu     String?               // tên cán bộ vật tư
  chiHuyCt    String?
  keToan      String?
  note        String?
}

model SupplierReconciliation {      // Đối chiếu công nợ
  id, supplierId, periodFrom DateTime, periodTo DateTime,
  openingBalance Decimal, totalIn Decimal, totalPaid Decimal,
  closingBalance Decimal, signedBySupplier Bool, signedDate DateTime?,
  note String?
}
```

**View** `vw_supplier_delivery_monthly`:
```sql
SELECT supplier_id, item_id,
       date_trunc('month', date) AS month,
       sum(qty) AS qty, max(unit) AS unit
FROM supplier_delivery_daily
GROUP BY supplier_id, item_id, date_trunc('month', date);
```

**UI:**
```
/vat-tu-ncc
├── page.tsx                        ← list NCC
└── [supplierId]/
    ├── layout.tsx                  ← tab nav
    ├── ngay/page.tsx               ← AG Grid editable
    ├── thang/page.tsx              ← read-only summary grid
    └── doi-chieu/page.tsx          ← form + lịch sử kỳ
```

## Related Code Files
**Create:**
- `prisma/schema.prisma` (add 2 models + raw SQL view)
- `lib/vat-tu-ncc/delivery-service.ts`
- `lib/vat-tu-ncc/reconciliation-service.ts`
- `app/(app)/vat-tu-ncc/page.tsx`
- `app/(app)/vat-tu-ncc/[supplierId]/{layout,ngay,thang,doi-chieu}/page.tsx`
- `components/vat-tu-ncc/delivery-grid.tsx`
- `components/vat-tu-ncc/reconciliation-form.tsx`

## Implementation Steps
1. Migration cho 2 model + view
2. Service layer (CRUD + filter theo supplier + period)
3. Page list NCC (đọc từ `suppliers`, count delivery records)
4. Page per-NCC ngày: AG Grid editable, autosave on cell change
5. Page tháng: AG Grid read-only từ view, group by item
6. Page đối chiếu: form tạo kỳ + bảng lịch sử kỳ trước
7. Test với 2 NCC: Nam Hương + Quang Minh, import data mẫu Excel

## Success Criteria
- [ ] Tạo NCC mới qua Master Data → auto xuất hiện trong sidebar `/vat-tu-ncc`
- [ ] Vật tư ngày: nhập, sửa, xóa qua grid; audit log đủ
- [ ] Vật tư tháng tự cập nhật khi đổi data ngày
- [ ] Đối chiếu công nợ tính đúng số dư đầu/cuối kỳ
- [ ] Khớp data mẫu của Nam Hương + Quang Minh

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Trùng nghiệp vụ với module Công nợ Vật tư (Phase 5) | Phase 4 chỉ tracking giao nhận; Phase 5 tracking thanh toán/nợ. SupplierDeliveryDaily KHÔNG ghi tiền, chỉ ghi KL |
| User muốn link delivery → ledger transaction | Phase 1: optional `deliveryId` FK trong LedgerTransaction; chưa enforce |
