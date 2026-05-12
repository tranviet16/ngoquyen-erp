---
phase: 1
title: "Implementation"
status: pending
priority: P2
effort: "3-4h"
dependencies: []
---

# Phase 1: Implementation

## Overview
Add `CashAccount` model + JE FK; migration & backfill; seed 7 record từ SOP; service + page CRUD `/tai-chinh/nguon-tien`; rewrite báo cáo thanh khoản per-account closing; cập nhật JE form + dashboard KPI.

## Architecture

### Schema (Prisma)
```prisma
model CashAccount {
  id                Int       @id @default(autoincrement())
  name              String    @unique
  openingBalanceVnd Decimal   @db.Decimal(18, 2) @default(0)
  displayOrder      Int       @default(0)
  deletedAt         DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @default(now())

  jeFrom JournalEntry[] @relation("JeFromAccount")
  jeTo   JournalEntry[] @relation("JeToAccount")

  @@map("cash_accounts")
}

model JournalEntry {
  // ... existing
  fromAccount   String?
  toAccount     String?
  fromAccountId Int?
  toAccountId   Int?

  fromAccountRef CashAccount? @relation("JeFromAccount", fields: [fromAccountId], references: [id])
  toAccountRef   CashAccount? @relation("JeToAccount",   fields: [toAccountId],   references: [id])

  @@index([fromAccountId])
  @@index([toAccountId])
}
```

### Seed (`prisma/seed-cash-accounts.ts`)
Upsert by `name`:
```ts
const SEED = [
  { name: "Tiền mặt",      opening: "408249861",  order: 1 },
  { name: "VCB - 899",     opening: "46831",      order: 2 },
  { name: "VCB - 999",     opening: "111705",     order: 3 },
  { name: "Vietin - 1114", opening: "1149063175", order: 4 },
  { name: "Vietin - 9694", opening: "1479626",    order: 5 },
  { name: "Vietin - 6820", opening: "13598844",   order: 6 },
  { name: "Vietin - 1833", opening: "770258835",  order: 7 },
];
for (const s of SEED) {
  await prisma.cashAccount.upsert({
    where: { name: s.name },
    update: { displayOrder: s.order },
    create: { name: s.name, openingBalanceVnd: s.opening, displayOrder: s.order },
  });
}
```

### Migration backfill SQL
Sau khi Prisma migration tạo table + add cột:
```sql
UPDATE journal_entries je
SET "fromAccountId" = ca.id
FROM cash_accounts ca
WHERE TRIM(je."fromAccount") = ca.name AND je."fromAccountId" IS NULL AND je."fromAccount" IS NOT NULL;

UPDATE journal_entries je
SET "toAccountId" = ca.id
FROM cash_accounts ca
WHERE TRIM(je."toAccount") = ca.name AND je."toAccountId" IS NULL AND je."toAccount" IS NOT NULL;
```
Log count unmapped sau migration để inspect.

### Service `lib/tai-chinh/cash-account-service.ts`
```ts
listCashAccounts(): Promise<CashAccount[]>           // active, sort displayOrder
createCashAccount(input): Promise<CashAccount>       // role: ketoan/admin
updateCashAccount(id, input): Promise<CashAccount>   // role: ketoan/admin
softDeleteCashAccount(id): Promise<void>             // role: admin, guard FK count
```

### Page `/tai-chinh/nguon-tien`
Server component fetch list → client table (display order, edit/delete actions, modal create/edit).

### `lib/tai-chinh/journal-service.ts` updates
- `JournalEntryInput` thêm `fromAccountId?: number | null`, `toAccountId?: number | null`
- `createJournalEntry`/`update` set FK; nếu input có FK → lookup name → fill `fromAccount` string (giữ audit trail consistent)
- `listJournalEntries` include `fromAccountRef`, `toAccountRef`

### `app/(app)/tai-chinh/nhat-ky/*` updates
Form `fromAccount`/`toAccount` → dropdown `<Select>` từ `listCashAccounts()`. Hidden input lưu cả `*Id` và name. Render hiển thị name từ FK; fallback string nếu FK NULL.

### `app/(app)/tai-chinh/bao-cao-thanh-khoan/*` rewrite
```ts
// Cho mỗi cash account active:
// closing = openingBalanceVnd
//   + Σ(amountVnd WHERE entryType='thu' AND toAccountId=ca.id  AND deletedAt IS NULL)
//   - Σ(amountVnd WHERE entryType='chi' AND fromAccountId=ca.id AND deletedAt IS NULL)
//   + Σ(amountVnd WHERE entryType='chuyen_khoan' AND toAccountId=ca.id)
//   - Σ(amountVnd WHERE entryType='chuyen_khoan' AND fromAccountId=ca.id)
```
Bảng: Nguồn | Đầu kỳ | Tiền vào | Tiền ra | Cuối kỳ + Tổng.

### `lib/tai-chinh/dashboard-service.ts` update
KPI `cashPositionVnd` = Σ closing balance per account (thay vì delta Thu-Chi).

## Related Code Files
- **Create:**
  - `prisma/seed-cash-accounts.ts`
  - `lib/tai-chinh/cash-account-service.ts`
  - `app/(app)/tai-chinh/nguon-tien/page.tsx`
  - `components/tai-chinh/cash-account-client.tsx`
- **Edit:**
  - `prisma/schema.prisma`
  - `lib/tai-chinh/journal-service.ts`
  - `lib/tai-chinh/dashboard-service.ts`
  - `app/(app)/tai-chinh/nhat-ky/*` (form + table — TBD file names khi cook)
  - `app/(app)/tai-chinh/bao-cao-thanh-khoan/page.tsx`
  - `app/(app)/tai-chinh/page.tsx` (thêm nav link "Nguồn tiền")

## Implementation Steps

1. **Schema + migration:**
   - Edit `prisma/schema.prisma`: add `CashAccount`, JE FK + index
   - `npx prisma migrate dev --name cash_accounts` → create migration
   - Append backfill SQL vào migration file (sau `CREATE TABLE` / `ALTER TABLE`)
   - `npx prisma generate`

2. **Seed:**
   - Tạo `prisma/seed-cash-accounts.ts` (upsert pattern)
   - Chạy: `npx tsx prisma/seed-cash-accounts.ts`
   - Verify: `psql ... -c "SELECT name, opening_balance_vnd FROM cash_accounts ORDER BY display_order"` ra 7 dòng

3. **Service + Page CRUD `/tai-chinh/nguon-tien`:**
   - `cash-account-service.ts` (list/create/update/softDelete với role guard + softDelete guard FK count)
   - `page.tsx` Server Component + `cash-account-client.tsx` (table + modal form, dùng pattern giống `expense-category-client.tsx` cũ)
   - Add link vào nav `app/(app)/tai-chinh/page.tsx`

4. **JE form + service update:**
   - `journal-service.ts`: extend input shape, lookup name khi save FK, include relations khi list
   - `app/(app)/tai-chinh/nhat-ky/*`: dropdown CashAccount thay text input; gridcolumn render name từ FK
   - Verify nhập + sửa JE mới lưu được FK đúng

5. **Báo cáo thanh khoản rewrite:**
   - `app/(app)/tai-chinh/bao-cao-thanh-khoan/page.tsx`: query closing per account
   - Bảng 5 cột (Nguồn | Đầu kỳ | Tiền vào | Tiền ra | Cuối kỳ) + tổng footer

6. **Dashboard KPI update:**
   - `dashboard-service.ts`: `cashPositionVnd` = Σ closing per account
   - Verify KPI Card "Vị thế tiền mặt" hiển thị số mới

7. **Verify:**
   - `npx tsc --noEmit` clean
   - Manual QA:
     - `/tai-chinh/nguon-tien` CRUD work
     - `/tai-chinh/nhat-ky` tạo JE chọn nguồn từ dropdown
     - `/tai-chinh/bao-cao-thanh-khoan` hiển thị 7 nguồn + opening đúng SOP
     - `/tai-chinh` KPI vị thế tiền mặt = Σ closing
   - JE cũ backfill: `SELECT COUNT(*) FROM journal_entries WHERE "fromAccountId" IS NULL AND "fromAccount" IS NOT NULL` → log expected count, nếu >0 thì note JE name chưa match (admin fix manual sau)

## Success Criteria
- [ ] Migration tạo `cash_accounts` table + JE FK columns + index
- [ ] Seed insert đủ 7 record, opening balance khớp SOP
- [ ] Page `/tai-chinh/nguon-tien` CRUD work với role guard
- [ ] JE form lưu được `fromAccountId/toAccountId` qua dropdown
- [ ] Backfill JE cũ ≥95% (log unmapped name nếu có)
- [ ] Báo cáo thanh khoản tính per-account `opening + in - out` chuẩn
- [ ] Dashboard KPI `cashPositionVnd` = Σ closing per account
- [ ] `npx tsc --noEmit` clean
- [ ] Existing JE create/edit/delete không vỡ

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| JE cũ name có whitespace/typo → unmatch | `TRIM()` trong backfill SQL; log count để admin biết |
| Migration backfill fail giữa chừng | Prisma migration transactional; rollback an toàn |
| Seed chạy 2 lần | `upsert` by unique `name` |
| Delete CashAccount khi vẫn còn JE FK | softDelete guard: count `journalEntry WHERE *AccountId=id AND deletedAt=null` > 0 → throw |
| Báo cáo cũ vỡ format/khách hàng quen | So sánh visual trước-sau, document change trong commit |
| `chuyen_khoan` chưa có UI từ trước → JE cũ NULL fromAccount khi transfer | Migration không assume; báo cáo handle NULL bằng cách bỏ qua |
