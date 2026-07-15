---
phase: 3
title: Migrate ledger grids
status: completed
priority: P1
effort: 4h
dependencies:
  - 1
---

# Phase 3: Migrate ledger grids

## Overview

Migrate 2 ledger grids (`transaction-grid`, `opening-grid`) sang ColumnDef v3 với FK config. Update `apply-filter-sort.ts` accessor để handle nested FK path `row[fk.relation]?.[fk.sortField]`. In-memory only (ledger không URL-driven).

## Requirements

- Functional:
  - Mọi data column ledger có sort indicator + filter widget.
  - FK columns (entity, party, project, item) sort theo tên join + filter dropdown.
  - 16 cột transaction grid: ~11 sort thiếu + 6 filter thiếu được enable.
  - 7 cột opening grid: 4 sort thiếu + 3 filter thiếu được enable.
- Non-functional:
  - Edit/paste/add row KHÔNG vỡ — verify mỗi grid sau migrate.
  - Eager-join verify: ledger query phải `include: { entity, party, project, item }`.

## Architecture

### `apply-filter-sort.ts` accessor (extend)

```ts
function getCellValue<T>(row: T, col: DataGridColumn<T>) {
  if (col.fk) {
    return (row as any)[col.fk.relation]?.[col.fk.sortField];
  }
  return (row as any)[col.id];
}
```

### Ledger column ví dụ

```ts
const COLUMNS: DataGridColumn<TxRow>[] = [
  { id: "date", title: "Ngày", kind: "date" },
  { id: "transactionType", title: "Loại", kind: "select", filterOptions: TX_TYPES },
  { id: "entityId", title: "Đơn vị", kind: "fk",
    fk: { relation: "entity", sortField: "name", options: entityOptions } },
  { id: "partyId", title: "Đối tác", kind: "fk",
    fk: { relation: "party", sortField: "name", options: partyOptions } },
  // ...
];
```

## Related Code Files

- Modify: `components/data-grid/types.ts` — `DataGridColumn` có `fk?: { relation, sortField, options? }`.
- Modify: `components/data-grid/apply-filter-sort.ts` — `getCellValue` + `getCellText` handle `col.fk`.
- Modify: `components/ledger-grid/transaction-grid.tsx` — COLUMNS đầy đủ `kind` + `fk`.
- Modify: `components/ledger-grid/opening-grid.tsx` — tương tự.
- Verify: ledger page loaders có `include: { entity, party, project, item }`.

## Implementation Steps

1. Extend `DataGridColumn` type với `fk` field.
2. Update `apply-filter-sort.ts`:
   - `getCellValue` (mới hoặc extend `compareValues` call site): nếu `col.fk` → `row[fk.relation]?.[fk.sortField]`.
   - `getCellText` cho text filter: FK → join name.
3. Refactor `transaction-grid.tsx`: 16 cột với `kind` + 4 `fk`.
4. Refactor `opening-grid.tsx`: 7 cột với 3 `fk`.
5. Verify ledger loader có eager `include` cho mọi FK relation referenced.
6. Manual smoke per grid: sort FK, filter FK, edit, paste, add, delete.
7. `npx tsc --noEmit && npm run lint`.

## Success Criteria

- [ ] 2 ledger grids cover toàn bộ data column.
- [ ] FK sort theo tên join hoạt động.
- [ ] FK filter dropdown hiển thị options.
- [ ] Edit/paste/add/delete không vỡ.
- [ ] tsc + lint xanh.

## Risk Assessment

- **Eager-join missing**: nếu loader chưa `include`, `row.entity` undefined → silent fail. Add include nếu thiếu.
- **Options count lớn** (entity ~vài trăm): cap 200; document. Future: search combobox.
- **Edit vs filter view race**: pending edit đẩy vào full rows, view memoized rerender. Verify không stale.
- **Sort path Phase 2 (excel-feel-tables) regression**: 32 existing tests phải vẫn pass.
