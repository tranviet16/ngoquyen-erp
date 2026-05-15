# Phase 02 — Service rewrite: entityId in service layer

---
status: completed
priority: P2
effort: 2h
actualEffort: 2h
blockedBy: [phase-01]
---

## Context Links
- Service file: `lib/payment/payment-service.ts:1-527`
- Balance service: `lib/ledger/balance-service.ts:218` `getOutstandingDebt({ ledgerType, entityId?, partyId, projectId? })`
- Current bug: `payment-service.ts:161-163` does NOT pass `entityId` → cross-entity balance bleed.
- Sub-B P2 reference: `plans/260514-1200-payment-refactor-multi-category/phase-02-service-rewrite.md`

## Overview
- Priority: P2
- Status: completed
- Effort: 2h
- Blocked by: P1

## Description
Rewrite types and SQL in `payment-service.ts`: replace `projectScope` with `entityId` in `UpsertItemInput`, `AggregateRow`, `autoFillBalances`, `refreshItemBalances`, `aggregateMonth` raw SQL, `getRound` include, write paths. Fix cross-entity balance bug by passing `entityId` to `getOutstandingDebt`/`getCumulativePaid`.

## Key insights
- `UpsertItemInput` at `payment-service.ts:35-50` — replace `projectScope: ProjectScope` with `entityId: number`.
- `autoFillBalances` at `payment-service.ts:149-170` — add `entityId` param; pass into balance-service calls (line 161-162). **THIS FIXES A LATENT BUG.**
- `upsertItem` UPDATE path (line 197): `updateData.projectScope` → `updateData.entityId`.
- `upsertItem` CREATE override path (line 231): same.
- `upsertItem` CREATE normal path (line 266): same + autoFillBalances signature change.
- `refreshItemBalances` (line 283-314): item.entityId fetched; pass into autoFillBalances.
- `getRound` (line 103-120): include `entity: { select: { id, name } }`.
- `aggregateMonth` raw SQL (line 490-526): `i."projectScope"` → `i."entityId"`; GROUP BY entityId; JOIN entities table; return `entityId` + `entityName`.
- Export type alias `ProjectScope` (line 9): DELETE.
- Export type `AggregateRow` (line 481-488): replace `projectScope` with `entityId: number; entityName: string`.

## Requirements
**Functional**
- `UpsertItemInput` shape:
  ```ts
  interface UpsertItemInput {
    id?: number;
    roundId: number;
    supplierId: number;
    entityId: number;        // NEW (required)
    projectId: number | null;
    category: PaymentCategory;
    congNo?: number | null;
    luyKe?: number | null;
    soDeNghi: number;
    note?: string;
    override?: boolean;
  }
  ```
- `autoFillBalances(category, entityId, supplierId, projectId)` — pass `entityId` to both `getOutstandingDebt` and `getCumulativePaid`.
- `AggregateRow`:
  ```ts
  interface AggregateRow {
    supplierId: number;
    supplierName: string;
    category: PaymentCategory;
    entityId: number;
    entityName: string;
    soDeNghi: number;
    soDuyet: number;
  }
  ```
- `aggregateMonth` SQL joins `entities` and groups by `entityId`:
  ```sql
  SELECT
    i."supplierId" AS supplier_id, s.name AS supplier_name,
    i.category AS category,
    i."entityId" AS entity_id, e.name AS entity_name,
    COALESCE(SUM(i."soDeNghi"), 0) AS so_de_nghi,
    COALESCE(SUM(i."soDuyet"), 0)  AS so_duyet
  FROM payment_round_items i
  JOIN payment_rounds r ON r.id = i."roundId"
  JOIN suppliers s ON s.id = i."supplierId"
  JOIN entities  e ON e.id = i."entityId"
  WHERE r."month" = ${month}
    AND r.status IN ('approved', 'closed')
    AND r."deletedAt" IS NULL
  GROUP BY i."supplierId", s.name, i.category, i."entityId", e.name
  ORDER BY s.name, i.category, e.name;
  ```

**Non-functional**
- No N+1: aggregateMonth single query.
- Decimal→number at boundary unchanged.
- `ProjectScope` type alias REMOVED from exports.

## Architecture / Data flow
```
UI NewItemRow
  → upsertItemAction({ entityId, supplierId, projectId, category, ... })
    → svc.upsertItem
      → if create+!override → autoFillBalances(category, entityId, supplierId, projectId)
        → getOutstandingDebt({ ledgerType, entityId, partyId: supplierId, projectId })
        → getCumulativePaid({ ledgerType, entityId, partyId: supplierId, projectId })
      → prisma.paymentRoundItem.create({ data: { entityId, ... } })
```

## Related Code Files
**Modify**
- `lib/payment/payment-service.ts` (whole file — type, SQL, write paths)

**Delete**: none

## Implementation Steps
1. Remove `export type ProjectScope = ...` (line 9).
2. Update `UpsertItemInput` (line 35-50): swap `projectScope` for `entityId: number`.
3. Update `autoFillBalances` signature (line 149-170): add `entityId: number` param; pass into both balance-service calls.
4. Update `upsertItem`:
   - UPDATE branch (line 197): `if (input.entityId !== undefined) updateData.entityId = input.entityId;`
   - CREATE override (line 231): `entityId: input.entityId,` in data.
   - CREATE normal (line 266): same; autoFillBalances call with `input.entityId`.
5. Update `refreshItemBalances` (line 283-314):
   - Fetch `item.entityId` (already auto-included in `findUnique`).
   - Call `autoFillBalances(category, item.entityId, item.supplierId, item.projectId)`.
6. Update `getRound` include (line 107-118): add `entity: { select: { id: true, name: true } }`.
7. Update `AggregateRow` (line 481-488): swap `projectScope` for `entityId + entityName`.
8. Update `aggregateMonth` raw SQL (line 490-526) per Architecture.
9. Update return map (line 518-525): `entityId: Number(r.entity_id), entityName: r.entity_name`.
10. `pnpm tsc --noEmit` → expect errors now only in UI/export/actions (P4-P6 fixes).

## Todo List
- [x] Remove `ProjectScope` type export
- [x] Update `UpsertItemInput`
- [x] Update `autoFillBalances` (fix entityId bug)
- [x] Update `upsertItem` create+update branches
- [x] Update `refreshItemBalances`
- [x] Update `getRound` include entity
- [x] Update `AggregateRow` + `aggregateMonth` SQL
- [x] tsc check

## Success Criteria
- No references to `projectScope` in `lib/payment/payment-service.ts`.
- `autoFillBalances` passes `entityId` to balance-service (verifiable by grep).
- Compile errors remain ONLY in UI (P5), tong-hop (P6), export route (P6), actions (P4 trivially).

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Forget to pass entityId at one call site | Med | High (silent wrong balance) | Grep `getOutstandingDebt\|getCumulativePaid` in repo → only this file should call them within payment scope |
| aggregateMonth GROUP BY drift vs UI pivot key | Med | High (pivot misalignment) | P6 reads `entityId+entityName` from AggregateRow directly; shared shape |
| Missing entity in dropdown causes FK violation on insert | Low | Medium | P5 dropdown sources from `entities WHERE deletedAt IS NULL`, FK NOT NULL enforces |

## Rollback
- Revert file via git; schema rollback per P1.

## Security
- No new endpoints; reuses existing auth/role checks (canCreate, canApprove).
- `autoFillBalances` runs server-side; entity isolation now correctly enforced.

## Next
- P3 cascade-suppliers endpoint
- P4 actions.ts type sync (trivial — re-exports)
