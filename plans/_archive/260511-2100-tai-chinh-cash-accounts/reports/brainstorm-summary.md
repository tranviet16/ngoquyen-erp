# Brainstorm — CashAccount + opening balance (Tài chính NQ)

**Date:** 2026-05-11
**Status:** Approved

## Problem
Module Tài chính NQ chưa có master data **nguồn tiền** và **số dư đầu kỳ** từng nguồn:
- `JournalEntry.fromAccount` / `toAccount` đang là **string tự do** (typo → balance lệch).
- KPI "Vị thế tiền mặt" = Σ(thu) - Σ(chi) → chỉ là delta, KHÔNG phải vị thế thật.
- SOP `Báo cáo Thanh khoản` chạy công thức: `opening + tiền vào - tiền ra = closing` per nguồn → hiện tại không tính được.
- SOP `Danh sách Dropdown` (sheet) có 7 nguồn tiền với số dư đầu kỳ cứng từ file Excel quản trị thực tế.

## Goal
Thêm master data `CashAccount` (id, name, opening balance, display order) + FK trên JournalEntry. Seed 7 record từ SOP. Backfill JE cũ qua name match. Báo cáo thanh khoản tính chuẩn.

## Approaches considered

| # | Approach | Verdict |
|---|----------|---------|
| 1 | Model mới CashAccount + FK cứng (`fromAccountId/toAccountId`) | ✅ Chọn — integrity tốt, báo cáo chuẩn |
| 2 | Model master + giữ string field | ❌ Typo vẫn lệch balance |
| 3 | Chỉ lưu opening trong bảng `cash_opening_balances` + giữ string | ❌ Không ràng buộc tham chiếu, lặp pattern ledger_opening_balances không cần thiết |

## Decisions

| Quyết định | Lựa chọn | Rationale |
|------------|----------|-----------|
| Schema | Model mới `CashAccount` + FK cứng | Integrity, báo cáo chuẩn |
| Seed | Script `prisma/seed-cash-accounts.ts` (7 record cứng từ SOP) | One-shot, admin sửa sau qua page CRUD |
| Backfill JE cũ | Auto-map qua name match, giữ cột string làm audit trail | Soft migration, không drop data |
| Page CRUD | `/tai-chinh/nguon-tien` (admin only, role: ketoan/admin) | Cùng pattern với các trang master khác |

## Final design

### Schema changes
```prisma
model CashAccount {
  id                Int       @id @default(autoincrement())
  name              String    @unique // "Tiền mặt", "VCB - 899", "Vietin - 1833"
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
  // ... existing fields
  fromAccount    String?       // KEEP as audit trail (read-only after migration)
  toAccount      String?       // KEEP as audit trail
  fromAccountId  Int?
  toAccountId    Int?
  fromAccountRef CashAccount?  @relation("JeFromAccount", fields: [fromAccountId], references: [id])
  toAccountRef   CashAccount?  @relation("JeToAccount",   fields: [toAccountId],   references: [id])

  @@index([fromAccountId])
  @@index([toAccountId])
}
```

### Seed data (from SOP `Danh sách Dropdown` G:H)
```ts
const SEED = [
  { name: "Tiền mặt",     opening: 408_249_861, order: 1 },
  { name: "VCB - 899",    opening: 46_831,      order: 2 },
  { name: "VCB - 999",    opening: 111_705,     order: 3 },
  { name: "Vietin - 1114", opening: 1_149_063_175, order: 4 },
  { name: "Vietin - 9694", opening: 1_479_626,    order: 5 },
  { name: "Vietin - 6820", opening: 13_598_844,   order: 6 },
  { name: "Vietin - 1833", opening: 770_258_835,  order: 7 },
];
```

### Backfill migration
SQL trong migration `*_cash_accounts_backfill.sql`:
```sql
UPDATE journal_entries je
SET "fromAccountId" = ca.id
FROM cash_accounts ca
WHERE je."fromAccount" = ca.name AND je."fromAccountId" IS NULL;

UPDATE journal_entries je
SET "toAccountId" = ca.id
FROM cash_accounts ca
WHERE je."toAccount" = ca.name AND je."toAccountId" IS NULL;
```
Log unmapped count cho admin check sau.

### Page CRUD
`/tai-chinh/nguon-tien` — table: name | opening | order | actions. Modal create/edit. Soft-delete (guard nếu có JE FK).

### Báo cáo thanh khoản update
`/tai-chinh/bao-cao-thanh-khoan` rewrite query:
```ts
// Per cashAccount: opening + Σ(thu where toAccountId=ca.id) - Σ(chi where fromAccountId=ca.id) = closing
```
Hiển thị bảng: Nguồn | Đầu kỳ | Tiền vào | Tiền ra | Cuối kỳ.

### JE form update
`/tai-chinh/nhat-ky` form `fromAccount`/`toAccount` đổi từ text input → dropdown lookup CashAccount. Giữ tương thích đọc string khi FK NULL.

## Out of scope (MVP)
- Multi-currency
- Account types (cash vs bank vs e-wallet)
- Per-account permission
- Account reconciliation workflow
- Period closing (đóng kỳ)

## Files affected
| Action | File |
|--------|------|
| Edit | `prisma/schema.prisma` (add CashAccount, JE FK) |
| Create | `prisma/migrations/*_cash_accounts/migration.sql` + backfill SQL |
| Create | `prisma/seed-cash-accounts.ts` |
| Create | `lib/tai-chinh/cash-account-service.ts` |
| Create | `app/(app)/tai-chinh/nguon-tien/page.tsx` + client |
| Edit | `lib/tai-chinh/journal-service.ts` (accept FK input, fallback string) |
| Edit | `app/(app)/tai-chinh/nhat-ky/*` (form dropdown) |
| Edit | `app/(app)/tai-chinh/bao-cao-thanh-khoan/*` (per-account closing) |
| Edit | `lib/tai-chinh/dashboard-service.ts` (KPI vị thế tiền mặt = Σ opening + Σ delta) |

## Risks
| Risk | Mitigation |
|------|-----------|
| JE cũ name có typo/whitespace → unmatch | Migration log count + admin tool re-map manual (post-MVP) |
| User add/remove account giữa kỳ → reconciliation khó | Soft-delete + guard FK; opening balance là as-of-date sau |
| Báo cáo thanh khoản rewrite vỡ format hiện tại | Snapshot test trước-sau |
| Seed chạy 2 lần → duplicate | `upsert` by unique `name` |

## Success criteria
- [ ] 7 cash account seed đúng từ SOP
- [ ] JE form lưu được `fromAccountId/toAccountId` qua dropdown
- [ ] Báo cáo thanh khoản hiển thị per-account closing chuẩn `opening + in - out`
- [ ] JE cũ backfill ≥95% (log unmapped)
- [ ] `npx tsc --noEmit` clean
- [ ] Existing flows (create/edit/delete JE) không vỡ

## Effort
~3-4h, 1 phase (gồm migration + seed + CRUD page + JE form + báo cáo thanh khoản).
