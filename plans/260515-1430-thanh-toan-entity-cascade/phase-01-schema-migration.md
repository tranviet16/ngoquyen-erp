# Phase 01 — Schema migration: projectScope → entityId

---
status: completed
priority: P2
effort: 1.5h
actualEffort: 1.5h
blockedBy: [project:260514-1200-payment-refactor-multi-category]
---

## Context Links
- Schema: `prisma/schema.prisma:584-611` (PaymentRoundItem)
- Entity model: `prisma/schema.prisma:207-219`
- Prior pattern: `plans/260514-1200-payment-refactor-multi-category/phase-01-schema-migration.md` (Prisma 7.8 shadow-DB workaround)
- Existing migration dir: `prisma/migrations/20260514153000_payment_module/`

## Overview
- Priority: P2 (blocker for P2..P7)
- Status: completed
- Effort: 1.5h
- Blocked by: Sub-B `260514-1200-payment-refactor-multi-category` (DONE)

## Description
Drop `PaymentRoundItem.projectScope` column. Add `entityId INT NOT NULL` with FK to `entities(id)`. Wipe all `payment_round_items` + `payment_rounds` rows (test data only). Bypass Prisma shadow-DB ordering bug via manual SQL + `migrate deploy`.

## Key insights
- Schema currently: `projectScope String // cty_ql | giao_khoan` (line 588) — TEXT enum-by-convention.
- Entity model already exists with `deletedAt` soft-delete (line 212). FK target stable.
- `Project` has NO `entityId` field (verified at `prisma/schema.prisma:252-280`) — entity↔project relationship lives in `LedgerTransaction` rows, not schema. Cascade is data-driven, not schema-driven.
- Wipe is safe: confirmed test-only data per user decision.

## Requirements
**Functional**
- `payment_round_items.projectScope` column DROPPED.
- `payment_round_items.entityId INT NOT NULL` added, FK `entities(id)` ON DELETE RESTRICT.
- Index `payment_round_items(roundId, entityId)`.
- Existing indexes preserved: `(roundId)`, `(supplierId)`, `(roundId, category)`.

**Non-functional**
- 1 migration file, apply via `migrate deploy` (not `migrate dev` — avoids shadow-DB).
- Backward compat: NONE — wipe.

## Architecture
SQL order in `migration.sql`:
```sql
-- 1. Wipe payment data (FK cascade handles items via round.onDelete: Cascade)
DELETE FROM payment_round_items;
DELETE FROM payment_rounds;

-- 2. Drop legacy column
ALTER TABLE payment_round_items DROP COLUMN "projectScope";

-- 3. Add entityId (NOT NULL safe because table is empty)
ALTER TABLE payment_round_items ADD COLUMN "entityId" INTEGER NOT NULL;

-- 4. FK constraint
ALTER TABLE payment_round_items
  ADD CONSTRAINT "payment_round_items_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES entities(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Index for aggregate queries (Phase 06 pivot GROUP BY entityId)
CREATE INDEX "payment_round_items_roundId_entityId_idx"
  ON payment_round_items("roundId", "entityId");
```

## Related Code Files
**Modify**
- `prisma/schema.prisma` — `PaymentRoundItem` block (~line 584-611)

**Create**
- `prisma/migrations/{YYYYMMDDHHMMSS}_payment_entity_id/migration.sql`

**Delete**: none

## Implementation Steps
1. Edit `prisma/schema.prisma` PaymentRoundItem:
   - Remove `projectScope        String // cty_ql | giao_khoan` (line 588)
   - Add `entityId            Int` after `roundId`
   - Add relation: `entity     Entity   @relation(fields: [entityId], references: [id])`
   - Add `@@index([roundId, entityId])`
2. Add reverse relation in `Entity` model (`prisma/schema.prisma:207-219`):
   - `paymentItems PaymentRoundItem[]`
3. Create migration dir manually (bypass `migrate dev` shadow-DB bug):
   - Generate timestamp: `Get-Date -Format "yyyyMMddHHmmss"` (PowerShell)
   - `mkdir prisma/migrations/{ts}_payment_entity_id/`
   - Write `migration.sql` per Architecture above
4. Apply: `pnpm prisma migrate deploy`
5. `pnpm prisma generate`
6. `pnpm tsc --noEmit` → EXPECTED FAIL in `payment-service.ts`, `round-detail-client.tsx`, `tong-hop-client.tsx`, export route — these fix in P2/P5/P6.

## Todo List
- [x] Edit `prisma/schema.prisma` PaymentRoundItem + Entity reverse relation
- [x] Create `prisma/migrations/{ts}_payment_entity_id/migration.sql`
- [x] `pnpm prisma migrate deploy`
- [x] `pnpm prisma generate`
- [x] Verify via DB client: `\d payment_round_items` shows entityId + FK + index
- [x] `SELECT COUNT(*) FROM payment_rounds;` = 0

## Success Criteria
- `payment_round_items.projectScope` does not exist.
- `payment_round_items.entityId` INT NOT NULL with FK to `entities(id)`.
- Index `payment_round_items_roundId_entityId_idx` exists.
- `pnpm prisma generate` succeeds; generated client has `entityId: number` and `entity: Entity` relation on `PaymentRoundItem`.
- `pnpm tsc --noEmit` fails ONLY at expected sites (payment-service, round-detail-client, tong-hop-client, export route).

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Shadow-DB ordering rejects column swap | High | High | Manual migration dir + `migrate deploy` (validated in Sub-B P1) |
| NOT NULL add fails on existing rows | None | — | DELETE before ADD; table empty |
| FK ref nonexistent entity post-wipe | None | — | No rows exist post-DELETE |
| Other code paths still reference projectScope after migration | High | Medium | tsc errors are intentional gate → P2 fixes |

## Rollback
- `pnpm prisma migrate resolve --rolled-back {migration_name}`
- Restore column: `ALTER TABLE payment_round_items ADD COLUMN "projectScope" TEXT;` + revert schema.prisma.
- Data already wiped — rollback only restores structure, not records.

## Security
- DELETE limited to 2 tables, no cascade to Entity/Supplier/Project.
- Migration peer-reviewed before merge (no auto-apply CI).

## Next
P2 service rewrite consumes new `entityId` column.
