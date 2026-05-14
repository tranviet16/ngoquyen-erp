---
phase: 1
title: "Schema + migration"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Schema + migration

## Overview
Thêm 2 model `PaymentRound` + `PaymentRoundItem` vào Prisma schema, generate migration, thêm các relation tới `User`, `Supplier`, `Project`.

## Related Code Files
- Modify: [prisma/schema.prisma](prisma/schema.prisma) — add 2 models, 4 relations (User x2, Supplier, Project)
- Create: `prisma/migrations/{timestamp}_payment_module/migration.sql`

## Implementation Steps

### 1. Thêm 2 model vào `prisma/schema.prisma`
Insert sau `model SupplierReconciliation` (~line 550), trước `// ─── Ledger Models`:

```prisma
model PaymentRound {
  id           Int       @id @default(autoincrement())
  month        String    // "YYYY-MM"
  sequence     Int
  category     String    // vat_tu | nhan_cong | dich_vu | khac
  status       String    @default("draft")
  createdById  String
  submittedAt  DateTime?
  approvedById String?
  approvedAt   DateTime?
  note         String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  createdBy  User                @relation("PaymentRoundCreator", fields: [createdById], references: [id])
  approvedBy User?               @relation("PaymentRoundApprover", fields: [approvedById], references: [id])
  items      PaymentRoundItem[]

  @@unique([month, sequence, category])
  @@index([status, month])
  @@map("payment_rounds")
}

model PaymentRoundItem {
  id           Int       @id @default(autoincrement())
  roundId      Int
  supplierId   Int
  projectScope String    // cty_ql | giao_khoan
  projectId    Int?
  congNo       Decimal   @default(0) @db.Decimal(18, 2)
  luyKe        Decimal   @default(0) @db.Decimal(18, 2)
  soDeNghi     Decimal   @default(0) @db.Decimal(18, 2)
  soDuyet      Decimal?  @db.Decimal(18, 2)
  approvedAt   DateTime?
  approvedById String?
  note         String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  round      PaymentRound @relation(fields: [roundId], references: [id], onDelete: Cascade)
  supplier   Supplier     @relation(fields: [supplierId], references: [id])
  project    Project?     @relation(fields: [projectId], references: [id])
  approvedBy User?        @relation("PaymentItemApprover", fields: [approvedById], references: [id])

  @@index([roundId])
  @@index([supplierId])
  @@map("payment_round_items")
}
```

### 2. Cập nhật relation ở các model hiện có
- `model User`: thêm 3 dòng
  ```prisma
  paymentRoundsCreated  PaymentRound[]     @relation("PaymentRoundCreator")
  paymentRoundsApproved PaymentRound[]     @relation("PaymentRoundApprover")
  paymentItemsApproved  PaymentRoundItem[] @relation("PaymentItemApprover")
  ```
- `model Supplier`: thêm
  ```prisma
  paymentItems PaymentRoundItem[]
  ```
- `model Project`: thêm
  ```prisma
  paymentItems PaymentRoundItem[]
  ```

### 3. Generate + apply migration
```powershell
npx prisma migrate dev --name payment_module
```

### 4. Verify
- `npx prisma generate` không lỗi
- `psql` query: `\d payment_rounds`, `\d payment_round_items` → check FK + index tồn tại

## Success Criteria
- [ ] Migration chạy clean, không cần shadow-DB workaround
- [ ] `prisma generate` produces typed client cho 2 model mới
- [ ] FK constraints: `round_id → payment_rounds.id ON DELETE CASCADE`, `supplier_id`, `project_id`, các `*_by_id → users.id`
- [ ] Unique index `(month, sequence, category)` tồn tại
- [ ] Type-check `npx tsc --noEmit` pass

## Risk Assessment
- **Prisma shadow-DB ordering bug** (đã gặp ở migration trước): nếu lỗi, tạo migration thủ công với raw SQL trong `migration.sql` và `npx prisma migrate resolve --applied`
- **Tên relation duplicate trên User**: dùng 3 `@relation("...")` distinct names — verify không clash với relation hiện có (`CFormCreator`, etc.)
