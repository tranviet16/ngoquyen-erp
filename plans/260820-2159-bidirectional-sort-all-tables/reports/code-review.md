# Code review — bidirectional sort implementation (re-review)

Date: 2026-08-20  
Scope: current sort-related diff; excluded pre-existing SOP spreadsheets, Docker Compose, and unrelated changelog content. Source review was read-only.

## Verdict

**PASS — no blocker or major correctness finding remains.**

The previous blocker and major findings were re-checked against live code and are resolved. Shared client sorting remains stable, immutable, and null-last in both directions. Server sorting now preserves complete filtered/authorized result semantics before pagination where displayed labels differ from stored values.

The final accessibility consistency item was closed after re-review by adding current-state and next-action accessible labels to both route-local server headers.

## Previous findings — resolution

### Resolved — Prisma relation-count ordering

- Project count columns now use `categories._count` in both the canonical spec and rendered column definition.
- `buildPrismaArgs` produces `{ categories: { _count: "asc" } }`.
- `lib/table/__tests__/query-params.test.ts` asserts the exact Prisma object shape.
- Result: the former runtime blocker is closed.

### Resolved — displayed-label sorting for enhanced DataTables

- `deriveResourceSpec` now derives a trusted raw-value rank from displayed select/FK option labels.
- Entity, item, project/ACL-project, and loan pages detect display-order sorts, load the full already-filtered and already-authorized set, establish deterministic `id` source order, apply stable semantic label rank, then slice the requested page.
- ACL remains in the `where` clause for `/du-an`; deleted-row and search/filter predicates remain unchanged on all reviewed pages.
- Loan computed `_pending` retains its complete-set sort-before-slice adapter.
- Result: enum/select columns now order by what users see instead of raw storage values, without current-page-only sorting.

### Accepted verified decision — DataGrid default-on and capped-set semantics

- Product decision is explicitly “all data columns sortable; exclusions only for non-data columns.”
- The global `sortable !== false` behavior implements that decision consistently.
- Fixed-cap sources are disclosed as capped-dataset views; they do not claim global database ordering.
- No new evidence shows row-index mutation authority, persisted business-order changes, or data exposure. The earlier concern is therefore withdrawn.

### Resolved — DataTable print/PDF header labels

- `SortHeader` now hides its button for print and renders a `hidden print:inline` header label.
- This matches the existing `SortableTableHead` print behavior and avoids the global print rule that hides buttons.

### Resolved — department table mobile overflow

- The first department table wrapper now uses `overflow-x-auto` with `min-w-[600px]`, matching the second occurrence.
- Right-side columns/actions remain reachable on narrow screens.

### Resolved — server link accessible state/action

- Shared `ServerSortableTableHead` now announces current state and next action via `aria-label`, retains `aria-sort` on `<th>`, a native keyboard-activatable link, focus ring, and 44px target.
- The route-local `SortHead` and `AmountSortHead` now expose the same current-state and next-action `aria-label` contract while retaining `aria-sort`, keyboard activation, focus styling, and correct three-state behavior.

## Re-checked occurrence matrix

| # | Occurrence / contract | Result |
|---:|---|---|
| 1 | Shared state/comparator | PASS — default clone, stable ties, null-last asc/desc |
| 2 | Enhanced DataTable — contractors | PASS — deterministic server pagination |
| 3 | Enhanced DataTable — suppliers | PASS — scalar displayed values |
| 4 | Enhanced DataTable — entities | PASS — displayed-label complete-set sort before slice |
| 5 | Enhanced DataTable — items | PASS — displayed-label complete-set sort before slice |
| 6 | Enhanced DataTable — projects count | PASS — valid `categories._count` order shape |
| 7 | Enhanced DataTable — ACL project list | PASS — display ordering after ACL filtering |
| 8 | Enhanced DataTable — loans | PASS — label and computed pending sorts cover full filtered set |
| 9 | Legacy project-detail DataTable | PASS — immutable full-array display-aware sort |
| 10 | DataGrid core | PASS — approved default-on, three-state, DOM keyboard equivalent |
| 11 | Obligation period DataGrid | PASS — computed numeric accessors |
| 12 | Loan schedule DataGrid | PASS — stable ID-based presentation sort |
| 13 | Import history | PASS — explicitly capped latest-50 semantics |
| 14 | Import error detail | PASS — complete JSON array |
| 15 | Expense journal | PASS — authorized complete-set derived sort before page slice |
| 16 | Coordination list | PASS — ACL retained, complete-set sort before page slice |
| 17 | Department list | PASS — display accessors and mobile scrolling |
| 18 | Department user list | PASS — independent table state |
| 19 | Module permission matrix | PASS — dynamic columns fixed, displayed permission accessors |
| 20 | Project permission nested table | PASS — fixed grant-all parent and sorted leaf rows |
| 21 | User grants nested rows | PASS — expanded child remains attached to stable parent key |
| 22 | Payment summary pivot | PASS — fixed dynamic columns and grand totals |
| 23 | Ledger detail grouped report | PASS — leaf-only within-group sort |
| 24 | Obligation grouped report | PASS — fixed categories/subtotals |
| 25 | Reconciliation detail | PASS — unsigned leaf sort; signed legal order preserved; ACL intact |
| 26 | SLA summary/detail | PASS — independent URL states and admin/director gate intact |

## Verification

```text
pnpm exec vitest run \
  test/unit/sortable-table-rows.test.ts \
  test/unit/data-grid-sort.test.ts \
  test/unit/sort-header.test.ts \
  lib/table/__tests__/semantic-compare.test.ts \
  lib/table/__tests__/sort-cycle.test.ts \
  lib/table/__tests__/group-sort.test.ts \
  lib/table/__tests__/query-params.test.ts \
  lib/table/__tests__/derive-spec.test.ts

Test Files: 8 passed
Tests: 93 passed

pnpm exec tsc --noEmit
Exit: 0
```

## Security and mutation audit

- URL sort fields remain allowlisted.
- Full-set display sorting reuses the same search/filter/deleted-row/ACL predicates as counts.
- No SQL string interpolation or authorization broadening was introduced.
- Client adapters clone source arrays; group/matrix structures and persisted records are not mutated.
- Reviewed edit/delete paths continue to address stable row IDs rather than visual indices.

**Status:** DONE  
**Summary:** Re-reviewed all prior findings and 26 representative occurrences/contracts. Former blocker and major issues are resolved; focused tests and TypeScript pass.  
**Concerns/Blockers:** None. The final minor accessible-name consistency follow-up was resolved; targeted TypeScript, ESLint, and diff checks pass.
