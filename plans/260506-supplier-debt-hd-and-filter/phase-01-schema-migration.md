---
phase: 1
title: Schema migration
status: completed
priority: P1
effort: 20m
dependencies: []
---

# Phase 1: Schema migration

## Overview
Thêm 3 cột HĐ (nullable) vào `project_supplier_debt_snapshots` để chứa cặp Lấy hàng / Đã trả / Còn nợ theo hợp đồng.

## Requirements
- Functional: schema chấp nhận giá trị HĐ; data cũ không bị hỏng (nullable, không default).
- Non-functional: migration thuận, không cần down-time, không backfill.

## Architecture
Field-level addition only. Không đổi tên/index/relation. Type giữ y hệt cặp TT đã có (`Decimal(18,2)?`).

## Related Code Files
- Modify: `prisma/schema.prisma` (model `ProjectSupplierDebtSnapshot` line 741)
- Create: `prisma/migrations/<timestamp>_add_supplier_debt_hd_columns/migration.sql`

## Implementation Steps
1. Mở `prisma/schema.prisma`, sau dòng `balance` thêm:
   ```prisma
   amountTakenHd Decimal?  @db.Decimal(18, 2) // Lấy hàng HĐ
   amountPaidHd  Decimal?  @db.Decimal(18, 2) // Đã trả HĐ
   balanceHd     Decimal?  @db.Decimal(18, 2) // Còn nợ HĐ
   ```
2. Chạy `npx prisma migrate dev --name add_supplier_debt_hd_columns`.
3. Verify migration SQL chỉ chứa 3 `ALTER TABLE ... ADD COLUMN`, không có drop/rename ngoài ý muốn.

## Success Criteria
- [ ] Migration chạy clean trên DB local
- [ ] `npx prisma generate` không lỗi; `prisma.projectSupplierDebtSnapshot` có 3 field mới
- [ ] `SELECT amountTakenHd, amountPaidHd, balanceHd FROM project_supplier_debt_snapshots LIMIT 1` chạy được (giá trị NULL)

## Risk Assessment
- Risk: trộn migration với schema drift khác. **Mitigation:** chạy `prisma migrate status` trước, chỉ thêm 3 field, review SQL trước commit.
