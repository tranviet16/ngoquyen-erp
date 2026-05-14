# Phase 01 — Schema migration

## Context Links
- Schema: `prisma/schema.prisma:561-605`
- Prior migrations: `prisma/migrations/`
- Journal note: Prisma 7.8 shadow-DB ordering bug with combined column-drop + unique-drop

## Overview
- Priority: P2 (blocker for Phase 02)
- Status: completed
- Effort: 1.5h (actual 1.5h)

## Description
Refactor data model: 1 round chứa nhiều category — move `category` field xuống item level. Wipe existing data (test only, user confirmed).

## Requirements
**Functional**
- `PaymentRound` không còn cột `category`
- Unique key `(month, sequence, category)` → `(month, sequence)`
- `PaymentRoundItem.category` (TEXT NOT NULL) chứa `vat_tu|nhan_cong|dich_vu|khac`
- `PaymentRoundItem.balancesRefreshedAt` (TIMESTAMP NULL) — đánh dấu lần refresh số dư cuối
- Index gợi ý: `payment_round_items(roundId, category)` để aggregate query nhanh

**Non-functional**
- Migration apply 1 lệnh duy nhất, không cần manual DB intervention
- Backward-compat: KHÔNG — wipe data (đã chốt brainstorm)

## Architecture
- Order trong migration SQL (giảm rủi ro Prisma 7 shadow-DB bug):
  1. `DELETE FROM payment_round_items;`
  2. `DELETE FROM payment_rounds;`
  3. `ALTER TABLE payment_rounds DROP CONSTRAINT IF EXISTS payment_rounds_month_sequence_category_key;`
  4. `ALTER TABLE payment_rounds DROP COLUMN category;`
  5. `CREATE UNIQUE INDEX payment_rounds_month_sequence_key ON payment_rounds(month, sequence);`
  6. `ALTER TABLE payment_round_items ADD COLUMN category TEXT NOT NULL DEFAULT 'khac';` → sau migration drop default (chỉ để tương thích nếu table còn rows; thực tế đã wipe)
  7. `ALTER TABLE payment_round_items ALTER COLUMN category DROP DEFAULT;`
  8. `ALTER TABLE payment_round_items ADD COLUMN "balancesRefreshedAt" TIMESTAMP(3);`
  9. `CREATE INDEX payment_round_items_roundId_category_idx ON payment_round_items("roundId", category);`

## Related Code Files
**Modify**
- `prisma/schema.prisma` (PaymentRound, PaymentRoundItem)

**Create**
- `prisma/migrations/{timestamp}_payment_multi_category/migration.sql` (raw SQL — bypass Prisma 7 ordering bug)

**Delete**: none

## Implementation Steps
1. Edit `schema.prisma`:
   - `PaymentRound`: xóa dòng `category String`; đổi `@@unique([month, sequence, category])` → `@@unique([month, sequence])`
   - `PaymentRoundItem`: thêm `category String` (sau `projectId`); thêm `balancesRefreshedAt DateTime?`; thêm `@@index([roundId, category])`
2. Tạo migration thủ công: `pnpm prisma migrate dev --create-only --name payment_multi_category`
3. Mở migration.sql vừa tạo, thay bằng SQL theo Architecture order ở trên (raw SQL workaround cho shadow-DB).
4. Apply: `pnpm prisma migrate dev`
5. Generate client: `pnpm prisma generate`
6. Compile check: `pnpm tsc --noEmit` → kỳ vọng FAIL ở `payment-service.ts` (sẽ fix Phase 02)

## Todo List
- [x] Update `schema.prisma` (PaymentRound + PaymentRoundItem)
- [x] Generate empty migration `--create-only` — bypassed via manual dir creation (shadow-DB bug with `add_task_collab` migration)
- [x] Viết raw SQL theo order chuẩn
- [x] `prisma migrate deploy` apply (used deploy to skip shadow-DB; migrate dev broken by pre-existing shadow-DB issue)
- [x] `prisma generate`
- [x] Sanity check DB: verified via pg client (psql not on PATH)

## Success Criteria
- `\d payment_rounds` không còn cột `category`; unique key là `(month, sequence)`
- `\d payment_round_items` có `category TEXT NOT NULL` + `balancesRefreshedAt TIMESTAMP NULL` + index `(roundId, category)`
- `SELECT COUNT(*) FROM payment_rounds;` = 0
- `pnpm prisma generate` OK; types reflect new fields

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Prisma 7 shadow-DB reorder fails | Medium | High | Raw SQL migration, không dùng auto-gen |
| Migration apply nửa chừng | Low | High | DELETE trước, ALTER sau — safe nếu fail giữa chừng |
| Production DB có data thật | None | — | Confirmed test data, wipe OK |

## Security Considerations
- DELETE chỉ chạm payment_rounds + items, không cascade ra bảng khác (FK Supplier/Project là ON DEFAULT)
- Migration phải qua review trước khi merge

## Next Steps
- Phase 02 service rewrite consume new schema
