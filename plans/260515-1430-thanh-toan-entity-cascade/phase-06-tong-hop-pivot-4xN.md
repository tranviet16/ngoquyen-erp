# Phase 06 — Tong-hop pivot: 4 category × N entity

---
status: completed
priority: P2
effort: 2.5h
actualEffort: 2.5h
blockedBy: [phase-01, phase-02]
---

## Context Links
- Client: `app/(app)/thanh-toan/tong-hop/tong-hop-client.tsx:1-232`
- Page: `app/(app)/thanh-toan/tong-hop/page.tsx`
- Export: `app/api/thanh-toan/tong-hop/export/route.ts:1-225`
- Service: `aggregateMonth` in `payment-service.ts:490` (post-P2 returns `entityId + entityName`)

## Overview
- Priority: P2
- Status: completed
- Effort: 2.5h
- Blocked by: P1, P2

## Description
Pivot layout changes from fixed `4 category × 2 scope` (16 cells per supplier) to dynamic `4 category × N entity` (N = distinct entities present in `aggregateMonth` rows for the month). Excel export mirrors. Layout expands horizontally per entity present.

## Key insights
- Old `SCOPES: ProjectScope[] = ['cty_ql', 'giao_khoan']` constant (tong-hop-client.tsx:17) → DELETED.
- New layout derives entity list FROM the `rows: AggregateRow[]` data: `const entities = uniqueBy(rows, 'entityId').sort((a,b) => a.entityName.localeCompare(b.entityName, 'vi'))`.
- `CellKey` template literal type: `${category}_${entityId}_${'deNghi'|'duyet'}` (entityId is number — stringified at runtime). Use plain `Record<string, number>` since template-literal types with arbitrary numbers don't help.
- Column count per supplier row = `2 (fixed: STT+supplier) + N*4 (category groups: 4 cats × N entities × 2 metrics? NO — re-read decision)`.

**Layout decision re-read**: User said "4 category × N entity per supplier". This is 4 categories grouped, each containing N entity sub-cols × 2 metrics (deNghi/duyet) = `4 * N * 2` data cells. Plus totals (2). Total cols = `2 + 4*N*2 + 2`.

Alternative interpretation: "Each cell is (category, entity)". That gives `4 * N` cells, each cell showing deNghi+duyet stacked OR only one metric. Less likely — old layout had separate deNghi/duyet columns. **Going with: 4 categories × (N entities × 2 metrics) = same shape as before but `scope` replaced by `entity` with dynamic N.**

- Excel layout (export/route.ts:72-80): `COL_FIXED = 2`, `COLS_PER_CAT = SCOPES.length * 2 = 4`, `COL_TOTALS_START = 2 + 4*4 = 18`. After refactor: `COLS_PER_CAT = N * 2`, `COL_TOTALS_START = 2 + 4 * N * 2`. Total cols = `COL_TOTALS_START + 2`.
- `getActor()` is the only auth in `aggregateMonth` (line 491). Export route checks session at `export/route.ts:83-86`. Adequate.

## Requirements

**Functional — client (tong-hop-client.tsx)**
- Remove `SCOPES`, `SCOPE_LABEL`, `ProjectScope` imports.
- Derive entities from rows:
  ```ts
  function uniqueEntities(rows: AggregateRow[]): { id: number; name: string }[] {
    const m = new Map<number, string>();
    for (const r of rows) m.set(r.entityId, r.entityName);
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a,b) => a.name.localeCompare(b.name, 'vi'));
  }
  ```
- `CellKey` → `${PaymentCategory}_${number}_${'deNghi'|'duyet'}` template type OR plain string.
- `makeCells(entities)` accepts entity list; produces zero-filled map.
- `buildPivot` reads `r.entityId` instead of `r.projectScope`.
- Render: outer category groups (4); inner entity sub-cols (N each); inside each entity: 2 metric cols.
- Sticky cols: STT (col 0) and Đơn vị TT (col 1) — keep.
- Empty state: if `entities.length === 0` (no rows), show "Chưa có đợt nào được duyệt trong tháng này." — keep existing.

**Functional — export (export/route.ts)**
- Same entity derivation.
- Dynamic `COLS_PER_CAT = N * 2`.
- `COL_TOTALS_START = COL_FIXED + CATEGORIES.length * COLS_PER_CAT`.
- Header row 1 (category labels): each spans `N*2` cols.
- Header row 2 (entity × metric): for each category, repeat `N` entities × (Đề nghị, Duyệt).
- Body rows + footer: iterate same shape.
- Merges: category header merge `r:hdr1, c:start → c:start + N*2 - 1` for each cat.
- Column widths: 6, 30 for STT+supplier; 18 for data cells × `N*4*2`... wait `4 * N * 2`; 20 for total cols (×2).

**Non-functional**
- Layout drift between UI and Excel: factor shared helper `buildEntityList(rows)` (duplicate logic for now — KISS; both files inline since AggregateRow already typed).
- Performance: N expected small (<20 in practice). No virtualization.

## Architecture / Data flow
```
page.tsx → aggregateMonth(month) → rows: AggregateRow[]
  rows: [{ supplierId, supplierName, category, entityId, entityName, soDeNghi, soDuyet }, ...]
client buildPivot(rows):
  entities = uniqueEntities(rows)
  per supplier: cells[`${cat}_${entityId}_${metric}`]
  render: for each category in CATEGORIES, for each entity in entities, 2 cells (deNghi, duyet)
```

## Related Code Files
**Modify**
- `app/(app)/thanh-toan/tong-hop/tong-hop-client.tsx`
- `app/api/thanh-toan/tong-hop/export/route.ts`
- `app/(app)/thanh-toan/tong-hop/page.tsx` — likely no changes (passes rows through)

**Delete**: none

## Implementation Steps
1. **tong-hop-client.tsx**:
   - Remove `SCOPES`, `SCOPE_LABEL`, `ProjectScope` import.
   - Add `Entity = { id: number; name: string }` local type.
   - Add `uniqueEntities(rows)` helper.
   - Update `CellKey` to `${PaymentCategory}_${number}_${'deNghi'|'duyet'}` (or `string`).
   - Update `makeCells(entities)` signature.
   - Update `buildPivot(rows)` to seed cells via `uniqueEntities(rows)`.
   - Update header JSX:
     - Row 1: category `colSpan={entities.length * 2}`.
     - Row 2: for each cat, for each entity → 2 `<th>` (entityName — Đề nghị / entityName — Duyệt).
   - Update body+footer JSX iteration: cat → entity → 2 cells.
   - Update `grandTotals` accumulator: iterate over entities (passed list).
   - Sticky col offsets unchanged.
2. **export/route.ts**:
   - Same removals.
   - Derive `entities` from rows.
   - Recompute `COLS_PER_CAT`, `COL_TOTALS_START`, `totalCols`.
   - Rebuild headerRow1, headerRow2 dynamically.
   - Rebuild `pivotCells(p)` to iterate entities.
   - Merges loop uses dynamic `COLS_PER_CAT`.
   - Column widths: 2 fixed + `4 * N * 2` data + 2 totals.
   - Filename unchanged.
3. tsc + manual: open `/thanh-toan/tong-hop?month=2026-05`, verify N entities render; click Export Excel; open file.

## Todo List
- [x] tong-hop-client.tsx pivot refactor
- [x] export/route.ts pivot refactor (mirror)
- [x] Test: month with 0 rows (empty state)
- [x] Test: month with 1 entity (collapsed table still valid)
- [x] Test: month with 3+ entities
- [x] Test: Excel opens in Excel/LibreOffice, merges correct

## Success Criteria
- UI renders dynamic columns based on entities present in month data.
- Excel export opens cleanly; category headers merge over correct entity span.
- Grand totals row sums correctly across all entity cells.
- Sticky STT + Đơn vị TT columns work on horizontal scroll.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| UI ≠ Excel layout drift | High | Med | Same entity derivation logic in both files; review side-by-side |
| N huge (50+ entities) → unusable table | Low | Med | YAGNI now; pivot horizontal scroll already supported |
| Empty month → render crash on `entities.length=0` colSpan | Med | Med | Keep existing empty-state branch BEFORE table render |
| Excel merges overlap (off-by-one) | Med | High (file corrupt) | Unit-test mentally: cat 0 starts at col 2, span 2N; cat 1 starts at col 2+2N |
| Decimal serialization across RSC boundary | Low | Med | `aggregateMonth` already returns `Number(...)` (P2 line 518-525) |

## Rollback
- Revert both files via git. No DB/data dependency.

## Security
- Export route session check unchanged.
- No new endpoints.

## Next
P7 verification + smoke.
