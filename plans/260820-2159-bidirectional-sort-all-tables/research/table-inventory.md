# Table inventory and bidirectional-sort scope

Inventory date: 2026-08-20. Scope: `app/**/*.tsx` and `components/**/*.tsx`. This is a read-only plan artifact; no source code was changed.

## Reproducible counts

```powershell
$dt=rg -n -F '<DataTable' app components -g '*.tsx'; $dt.Count; ($dt|%{($_-split ':')[0]}|sort -Unique).Count
$dg=rg -n -F '<DataGrid' app components -g '*.tsx'; $dg.Count; ($dg|%{($_-split ':')[0]}|sort -Unique).Count
$raw=rg -n '<table(?:\s|>)' app components -g '*.tsx'; $raw.Count; ($raw|%{($_-split ':')[0]}|sort -Unique).Count
```

- `DataTable`: **8 render occurrences / 8 files**: seven URL/server-paginated callers and one legacy client-array caller.
- `DataGrid`: **27 textual matches / 25 files**: 25 JSX renders, of which 24 are production and one is the demo. The extra two matches are generic type declarations at `components/ledger-grid/transaction-grid.tsx:122` and `components/ledger-grid/opening-grid.tsx:80`.
- Raw `<table`: **45 occurrences / 38 files**; excluding the primitive `components/ui/table.tsx` leaves **44 business tables / 37 files**.

Package evidence is `package.json:35-66`: Next `16.2.10`, React `19.2.4`, Glide Data Grid `6.0.4-alpha24`.

## Shared families

| Family | Data ownership | Required sort adapter |
|---|---|---|
| `components/data-table.tsx` and `components/data-table/**` | Seven server pages use URL query + `ResourceSpec`; project detail owns a client array | Server allowlist/`orderBy` for paginated callers; stable semantic client sort for the legacy caller |
| `components/data-grid/data-grid.tsx`, `use-grid-view.ts`, `apply-filter-sort.ts` | Caller array, but three callers receive fixed server caps | Stable copy-sort with typed/display accessors; capped sets must either disclose capped semantics or gain server sorting |
| Raw HTML tables | Mix of full arrays, reports, fixed server caps, and server pages | Flat, grouped/tree, matrix, or server adapter according to the live trace |

Common contract: `default → asc → desc → default`; clearing restores the owner's source order. Text/select/FK sort by displayed label, numeric/currency by number, date by timestamp, computed columns by an explicit accessor. Null/empty values remain last in both directions. Checkbox, STT, actions, group labels, subtotal/footer rows, and pivot headers are excluded.

## `DataTable` inventory

| Caller | Live source and default |
|---|---|
| `components/tai-chinh/loan-list-client.tsx` | server page 20; `startDate desc`; `lib/tai-chinh/loans/table-spec.ts:86-91` |
| `app/(app)/du-an/du-an-list-client.tsx` | server page 20 after ACL; `createdAt desc`; `lib/master-data/du-an/table-spec.ts:70-75` |
| `app/(app)/master-data/contractors/contractors-client.tsx` | server page 20; `name asc`; `lib/master-data/contractors/table-spec.ts:33-38` |
| `app/(app)/master-data/entities/entities-client.tsx` | server page 20; `createdAt desc`; `lib/master-data/entities/table-spec.ts:42-47` |
| `app/(app)/master-data/suppliers/suppliers-client.tsx` | server page 20; `name asc`; `lib/master-data/suppliers/table-spec.ts:40-45` |
| `app/(app)/master-data/items/items-client.tsx` | server page 20; `code asc`; `lib/master-data/items/table-spec.ts:54-59` |
| `app/(app)/master-data/projects/projects-client.tsx` | server page 20; `createdAt desc`; `lib/master-data/projects/table-spec.ts:63-68` |
| `app/(app)/master-data/projects/[id]/project-detail-client.tsx` | full category array from the detail loader; source array order |

The seven server callers pass through `lib/table/query-params.ts:26-55,144-153,221-239`, which validates sort keys and owns `skip/take/orderBy`. Full relation/display details and computed exclusions are recorded in [the live trace](../scout/manifest-trace.md#seven-enhanced-datatable-upstreams).

## `DataGrid` inventory

The exhaustive appendix in [the live trace](../scout/manifest-trace.md#exhaustive-production-datagrid-appendix) is the canonical inventory. It contains, for each of the 24 production renders:

1. exact renderer and column declaration lines;
2. exact page loader/action and service/query lines;
3. full, aggregate, single-parent/full-child, fixed-limit, or dormant classification;
4. source default order; and
5. every declared column mapped to scalar, numeric, date, displayed option/FK label, or explicit computed accessor.

Closure is **19 full/aggregate active arrays + one single-parent/full-child + three fixed-limit arrays + one dormant/export-only renderer = 24**. The fixed limits are ledger transactions (200), journal entries (200), and expense classifications (2000). The demo is `app/(app)/__demo/data-grid/page.tsx:97` and is a manual fixture, not production acceptance.

## Raw HTML inventory

| Occurrences | Source class | Adapter/exclusions |
|---|---|---|
| `components/ledger/{opening-balance-client,monthly-report,debt-matrix,detail-report-table}.tsx` | full/report | Flat opening rows sort client-side; report leaf rows sort within groups; headers/subtotals fixed |
| `components/tai-chinh/{cash-account-client,pr-client,loan-due-list-card}.tsx` | full | Flat client sort; totals fixed |
| `components/tai-chinh/expense-filter-client.tsx` | server page 50 | URL/server sort; never sort only the current slice |
| `components/tai-chinh/obligation-report-table.tsx` | grouped report | Sort within category; category rows/totals fixed |
| `components/van-hanh/member-table.tsx` | full | Scalar/computed metric client sort |
| `app/(app)/admin/phong-ban/department-client.tsx` (2) | full | Independently sort departments and members; no invented department hierarchy |
| `app/(app)/admin/import/page.tsx` | latest 50 | Sort only within the explicitly disclosed latest-50 set, or add server sort |
| `app/(app)/admin/import/[runId]/page.tsx` | complete JSON error array of one run | Preserve array default; client sort row/message |
| `app/(app)/admin/permissions/{roles/roles-client,module-permission-grid,projects/project-permission-panel}.tsx`, `admin/nguoi-dung/user-grants-client.tsx` | full | Sort principal rows; module/project column groups fixed |
| `app/(app)/thanh-toan/tong-hop/tong-hop-client.tsx` | pivot report | Preserve dynamic entity-column order; optional row sort only |
| `app/(app)/thanh-toan/ke-hoach/{round-list-client,[id]/round-detail-client}.tsx` | full | Sort round/item rows; footer sums fixed |
| `app/(app)/vat-tu-ncc/[supplierId]/{bao-gia,chot-ky,doi-chieu}/**-client.tsx`, reconciliation detail page | full/report/snapshot | Flat client sort where safe; signed snapshot/group/subtotal semantics fixed |
| `app/(app)/vat-tu-ncc/[supplierId]/kiem-tra-khop/kiem-tra-khop-client.tsx` (3) | full consistency-query partitions | Independently sort each violation set |
| `app/(app)/du-an/[id]/{dinh-muc,du-toan,du-toan-dieu-chinh}/**-client.tsx` | grouped/full | Sort leaves within categories; subtotal/parent fixed |
| `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx` (3) | grouped/report plus displayed 50-row member slice | Sort the source before presentation slicing; group-aware main tables |
| `app/(app)/tai-chinh/bao-cao-thanh-khoan/page.tsx` (2) | report | Sort data rows; totals fixed |
| `app/(app)/van-hanh/phieu-phoi-hop/list-client.tsx` | server page 20 | URL/server sort via `listForms` |
| `app/(app)/van-hanh/phieu-phoi-hop/thong-ke-sla/page.tsx` (2) | grouped report | Sort metrics/detail independently; preserve aggregation |
| `app/(app)/sl-dt/{bao-cao-sl/page,bao-cao-dt/page,chi-tieu/chi-tieu-client}.tsx` | hierarchical report | Sort lot leaves within phase/group; subtotal/group/grand rows fixed |
| `app/(app)/sl-dt/{tien-do-nop-tien/payment-plan-client,tien-do-xd/tien-do-xd-client}.tsx` | full | Client sort lot leaves; inserted phase/group headers fixed |

Exact loaders, limits, default orders, relation/FK provenance, and displayed computed fields for every formerly unresolved HTML entry are closed in [the live trace](../scout/manifest-trace.md#previously-unresolved-html-tables--exact-live-sources).

## Implementation gates

- Do not treat absence of a pagination prop as proof of a full database set.
- Do not sort a server page or fixed-limit result as though it represented all matching rows.
- Do not expose sort on a computed/render-only column until its accessor or server mapping is explicit.
- Re-run the three count commands after implementation and reconcile every occurrence against this inventory.
