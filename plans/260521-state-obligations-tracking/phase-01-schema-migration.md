---
phase: 1
title: "Schema + Migration"
status: completed
priority: P1
effort: "1h"
dependencies: []
completed: 2026-05-21
---

# Phase 1: Schema + Migration

## Overview
Thêm 2 model Prisma cho module nghĩa vụ nhà nước, tạo migration, regenerate Prisma client.

## Requirements
- Functional: 2 bảng `state_obligation_types` + `state_obligation_txns`, toàn công ty (không entityId/projectId).
- Non-functional: theo convention schema hiện có — `@db.Decimal(18,2)` cho tiền, `deletedAt` soft-delete, `@@map` snake_case, timestamps.

## Architecture

**`StateObligationType`** — danh mục nghĩa vụ (seed sẵn, sửa được):
```prisma
model StateObligationType {
  id             Int       @id @default(autoincrement())
  name           String    @unique          // "Thuế GTGT"
  code           String?                     // mã TK kế toán optional, vd "3331"
  category       String                      // "thue" | "bao_hiem" | "khac"
  openingBalance Decimal   @default(0) @db.Decimal(18, 2)
  openingDate    DateTime                     // mốc số dư đầu kỳ
  sortOrder      Int       @default(0)
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  txns StateObligationTxn[]

  @@index([category, sortOrder])
  @@map("state_obligation_types")
}
```

**`StateObligationTxn`** — sổ phát sinh:
```prisma
model StateObligationTxn {
  id             Int       @id @default(autoincrement())
  typeId         Int
  date           DateTime                     // ngày ghi nhận
  kind           String                       // "phai_tra" | "da_nop"
  amount         Decimal   @db.Decimal(18, 2)
  cashAccountId  Int?                          // chỉ với da_nop
  journalEntryId Int?      @unique             // bút toán liên kết, chỉ với da_nop
  refNo          String?
  description    String?
  note           String?
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  type         StateObligationType @relation(fields: [typeId], references: [id])
  cashAccount  CashAccount?        @relation(fields: [cashAccountId], references: [id])
  journalEntry JournalEntry?       @relation(fields: [journalEntryId], references: [id])

  @@index([typeId, date])
  @@index([kind, date])
  @@map("state_obligation_txns")
}
```

- `journalEntryId` là `@unique` → quan hệ 1-1 với `JournalEntry`, chống liên kết trùng.
- Thêm quan hệ ngược trên `CashAccount` (`stateObligationTxns StateObligationTxn[]`) và `JournalEntry` (`stateObligationTxn StateObligationTxn?`).

## Related Code Files
- Modify: `prisma/schema.prisma` — thêm 2 model + 2 relation ngược; đặt khối mới sau `JournalEntry`/`CashAccount`.
- Create: `prisma/migrations/<timestamp>_state_obligations/migration.sql` (sinh tự động).

## Implementation Steps
1. Đọc `node_modules/next/dist/docs/` / Prisma docs nếu cần — schema hiện ở Prisma 7.8.0 (WASM query compiler).
2. Thêm 2 model vào `prisma/schema.prisma`; thêm field quan hệ ngược trên `CashAccount` và `JournalEntry`.
3. Chạy `npx prisma migrate dev --name state_obligations` (PostgreSQL Docker, port 5433). Nếu shadow-DB ordering lỗi → tạo migration thủ công bằng `prisma migrate diff` rồi `prisma migrate resolve` (tiền lệ: 2 migration gần đây phải workaround SQL thủ công).
4. Xác nhận `prisma generate` chạy (predev/prebuild tự chạy) — client có `prisma.stateObligationType` / `prisma.stateObligationTxn`.
5. `npx tsc --noEmit` → exit 0.

## Success Criteria
- [x] 2 bảng tồn tại trong DB, `\d state_obligation_txns` có 2 index.
- [x] Prisma client expose `stateObligationType` + `stateObligationTxn`.
- [x] `npx tsc --noEmit` xanh.

## Risk Assessment
- **Prisma shadow-DB ordering bug** (đã gặp 2 lần trong repo): nếu `migrate dev` fail, dùng `prisma migrate diff --from-... --to-schema-datamodel --script` tạo SQL thủ công, kiểm tra thứ tự `CREATE TABLE` (types trước txns vì FK).
- FK `journalEntryId` trỏ `journal_entries` — `onDelete` mặc định `Restrict`; service phải tự gỡ liên kết trước khi xóa bút toán.
