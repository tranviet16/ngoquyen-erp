# Table-sort coverage manifest

Gate date: 2026-08-20. Canonical occurrence inventory: [table inventory](../research/table-inventory.md). Canonical loader, default-order, relation, and per-column evidence: [live trace](../scout/manifest-trace.md).

## Reproducible population

```powershell
$dt=rg -n -F '<DataTable' app components -g '*.tsx'; $dt.Count; ($dt|%{($_-split ':')[0]}|sort -Unique).Count
$dg=rg -n -F '<DataGrid' app components -g '*.tsx'; $dg.Count; ($dg|%{($_-split ':')[0]}|sort -Unique).Count
$raw=rg -n '<table(?:\s|>)' app components -g '*.tsx'; $raw.Count; ($raw|%{($_-split ':')[0]}|sort -Unique).Count
```

| Family | Live count | Production scope | Adapter phase |
|---|---:|---:|---:|
| `DataTable` | 8 renders / 8 files | 7 server pages + 1 full client array | 3 |
| `DataGrid` | 25 renders / 25 files | 24 production + 1 demo | 4 |
| Raw `<table>` | 45 / 38 files | 44 / 37 files after excluding `components/ui/table.tsx` | 5–7 |

## Closed ownership

- Seven enhanced `DataTable` callers: page 20 with allowlisted URL sort; defaults and exact specs are in the trace.
- Legacy project-detail `DataTable`: full caller array; source array order is default.
- Production `DataGrid`: **19 full/aggregate active arrays, one single-parent/full-child array, three fixed server-limited arrays, and one dormant/export-only renderer**. The exhaustive 24-row appendix names every loader, cap, default, column, displayed FK/select label, computed accessor, and exclusion.
- Expense raw table: `listJournalEntries`, server page 50, default `date desc,createdAt desc`.
- Coordination forms raw table: `listForms`, server page 20, default `createdAt desc`.
- Import history: fixed latest 50 without count/pager; this is a disclosed capped dataset, not a full set.
- Remaining raw tables: full matching arrays, grouped reports, matrices, or a single-record report exactly as classified in the trace.

## Shared contract

- Cycle: `default → asc → desc → default`; a column change starts at ascending.
- Clearing restores the actual owner order: `ResourceSpec.defaultSort`, query order, caller array order, or leaf order within a report group.
- Sort by displayed meaning: option/FK label, numeric currency, date timestamp, and explicit computed accessor.
- Stable non-mutating sort; null/empty last in both directions.
- Exclude checkbox, STT, action, group, subtotal/footer, and pivot-header structures.
- Server pages sort through URL/loader. Fixed-limit grids must either retain explicitly capped semantics or gain server sorting/pagination; client sorting must not be described as global database sorting.

## Phase ownership

| Phase | Complete occurrence set |
|---:|---|
| 3 | All 8 `DataTable` renders |
| 4 | All 25 `DataGrid` renders, with demo as manual fixture and the 24 production rows governed by the exhaustive appendix |
| 5 | Flat HTML plus expense/coordination server adapters and disclosed fixed-limit imports |
| 6 | Group/tree tables: ledger reports, obligation report, project estimates/material balance, SL-DT hierarchy |
| 7 | Matrix/nested tables: permissions, payment pivot, debt/monthly reports, reconciliation detail |
| 8 | Re-count, occurrence reconciliation, tests, accessibility, and responsive/manual verification |

## Gate state

- [x] Live counts reproducible
- [x] Every occurrence assigned a family and phase
- [x] All 24 production `DataGrid` upstreams classified, including the dormant renderer
- [x] Every production `DataGrid` column has scalar/display/computed semantics or an explicit exclusion
- [x] Every paginated or fixed-limit source has an exact loader, default order, and limit
- [ ] Fresh reviewer spot-check of at least 15 live-code claims
