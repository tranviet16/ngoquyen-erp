# Phase 3 — `/cong-no-vt/chi-tiet` rewrite

## Context Links

- Current implementation (to REPLACE): `app/(app)/cong-no-vt/chi-tiet/page.tsx` (renders `DebtMatrix` pivot)
- Pattern reference: `app/(app)/cong-no-vt/bao-cao-thang/page.tsx`, `app/(app)/cong-no-vt/bao-cao-thang/bao-cao-thang-filter.tsx`
- Server-action pattern: `lib/cong-no-vt/material-ledger-service.ts:1-30`
- Reusable multi-select: `components/ledger/multi-select-filter.tsx` (supports search + paramName URL sync)
- Balance source: P1 `lib/ledger/balance-service.ts`
- ACL: P2 must land first

## Overview

- **Priority**: P1
- **Status**: completed
- **Effort**: 4h
- **Owner files**:
  - `lib/cong-no-vt/balance-report-service.ts` (new)
  - `app/(app)/cong-no-vt/chi-tiet/page.tsx` (rewrite)
  - `components/ledger/detail-report-table.tsx` (new, shared with P4)
  - `components/ledger/detail-report-filter.tsx` (new, shared with P4)
  - `app/api/cong-no/cascade-projects/route.ts` (new, shared with P4)

Replace `DebtMatrix` pivot with flat grouped table per closed decisions:
- 8 numeric cols (default `view=ca-hai`) — period + cumulative side-by-side.
- View toggle: `trong-thang` | `luy-ke` | `ca-hai`.
- Hide-zero default ON, header checkbox.
- Multi-select chủ thể; cascade multi-select dự án; single tháng.

## Closed decisions

See plan.md → "Closed decisions". Re-listed inline where relevant.

## Key Insights

- Page-level URL state is the source of truth — server reads `searchParams`, renders. Client filter component only pushes new URLs.
- Cascade dự án options must reflect ledger reality, not the full project list. Query: `DISTINCT projectId FROM ledger_transactions WHERE ledgerType='material' AND entityId IN ($entityIds) AND deletedAt IS NULL` UNION distinct projectIds from `ledger_opening_balances` (same filter). Empty entity selection → all projects via `prisma.project.findMany`.
- Cascade endpoint MUST be a server route (not RSC import) because filter component is `"use client"` and needs to refetch on entity change. Endpoint: `GET /api/cong-no/cascade-projects?ledgerType=material&entityIds=1,2`.
- DRY: Shared table/filter must accept `ledgerType` + `partyLabel` props; party data is rows-level (provided by service).
- `phatSinh T` = `Σ totalTt WHERE transactionType='lay_hang' AND date BETWEEN periodStart AND periodEnd`.
- `đã trả T` = `Σ totalTt WHERE transactionType='thanh_toan' AND date BETWEEN periodStart AND periodEnd`.
- `Nợ cuối T` = `opening + Σ lay_hang(≤periodEnd) − Σ thanh_toan(≤periodEnd)`.
- `phatSinh ∑` = `Σ totalTt WHERE transactionType='lay_hang'` (lifetime).
- `đã trả ∑` = `Σ totalTt WHERE transactionType='thanh_toan'` (lifetime).
- `Nợ ∑` = `opening + Σ lay_hang(lifetime) − Σ thanh_toan(lifetime)` — same as `getMaterialCurrentBalance` for that triple.
- Zero-row definition: row is "zero" iff **every currently-visible numeric column** = 0. Definition is `view`-dependent — server applies after computing all 6 numerics.
- Triples to display = union of (triples with any tx in period OR lifetime) ∩ entity/project filters. If `view=trong-thang` and `showZero=0`, server further drops rows whose 3 period cols are all zero.

## Requirements

### Functional

- Page `searchParams`: `year?`, `month?` (1-12), `entityIds?` (csv), `projectIds?` (csv), `view?` (`trong-thang|luy-ke|ca-hai`, default `ca-hai`), `showZero?` (`0|1`, default `0`).
- Guards: `requireModuleAccess("cong-no-vt.chi-tiet", { minLevel: "read", scope: "module" })`.
- Renders:
  - Filter bar: month single-select (year+month), entities multi-select, projects cascade multi-select, view radio group, hide-zero checkbox, Apply button.
  - Table: 3 group cols (Chủ thể | NCC | Công trình) + 3/3/6 numeric cols depending on `view`.
- Sub-totals per entity and per (entity, party) — computed server-side, rendered as styled subtotal rows.
- Print + Excel export deferred to follow-up (note in todos).

### Non-functional

- ≤ 2 DB queries for report data (1 GROUP BY + 1 bulk-balance call; or 1 combined CTE — preferred).
- Cascade endpoint: 1 query.
- Name joins: 3 by-id `findMany` (entity, supplier, project) — acceptable.
- Decimal precision preserved via `serializeDecimals` before passing to client.
- AbortController for cascade fetch — latest-wins.

## Architecture

### Data flow

```
URL ?year&month&entityIds&projectIds&view&showZero
   │
   ▼
chi-tiet/page.tsx (server)
   ├─► requireModuleAccess("cong-no-vt.chi-tiet")
   ├─► parse searchParams (csv → number[])
   ├─► getMaterialDetailReport(filters)
   │     ├─► period bounds: [startOfMonth, endOfMonth] if month provided; else null
   │     ├─► one $queryRaw GROUPed by (entityId, partyId, projectId):
   │     │     - phat_sinh_t  = SUM(totalTt) FILTER (WHERE type='lay_hang'   AND date BETWEEN start AND end)
   │     │     - da_tra_t     = SUM(totalTt) FILTER (WHERE type='thanh_toan' AND date BETWEEN start AND end)
   │     │     - phat_sinh_cum= SUM(totalTt) FILTER (WHERE type='lay_hang')
   │     │     - da_tra_cum   = SUM(totalTt) FILTER (WHERE type='thanh_toan')
   │     │   LEFT JOIN ledger_opening_balances ob ON triple match → ob.balanceTt AS opening
   │     │   WHERE ledgerType='material' AND deletedAt IS NULL
   │     │     AND (entityIds IS NULL OR entityId = ANY($entityIds))
   │     │     AND (projectIds IS NULL OR projectId = ANY($projectIds))
   │     ├─► compute in JS:
   │     │     no_cuoi_t = opening + SUM(lay_hang ≤ end) − SUM(thanh_toan ≤ end)
   │     │     no_cum    = opening + phat_sinh_cum − da_tra_cum
   │     │     (note: no_cuoi_t needs ≤end aggregates → see "single query option" below)
   │     ├─► by-id batch fetch: entities, suppliers, projects
   │     ├─► drop zero rows per view (unless showZero)
   │     ├─► sort by entityName, partyName, projectName
   │     └─► compute subtotals
   ▼
<DetailReportTable
   view={view}
   showZero={showZero}
   rows={...}
   subtotals={...}
   partyLabel="NCC"
/>
```

### Single-query strategy for `no_cuoi_t`

Period sums alone don't give `no_cuoi_t`. Add two more FILTER aggregates in the SAME query:
```sql
SUM(totalTt) FILTER (WHERE type='lay_hang'   AND date<=$end) AS lay_hang_to_end
SUM(totalTt) FILTER (WHERE type='thanh_toan' AND date<=$end) AS thanh_toan_to_end
```
Then `no_cuoi_t = opening + lay_hang_to_end − thanh_toan_to_end`. Total: 6 FILTER aggregates in one GROUP BY → **1 query** for the entire report.

### Cascade endpoint

```
GET /api/cong-no/cascade-projects?ledgerType=material&entityIds=1,2,3
→ 200 { projects: [{id, name}] }
```
Auth: same module read access as the page.
Implementation:
```sql
SELECT DISTINCT "projectId" FROM ledger_transactions
WHERE "ledgerType"=$1 AND "deletedAt" IS NULL
  AND "entityId" = ANY($2::int[])
UNION
SELECT DISTINCT "projectId" FROM ledger_opening_balances
WHERE "ledgerType"=$1 AND "entityId" = ANY($2::int[])
```
Then `prisma.project.findMany({ where: { id: { in: [...] } } })` for names.

### File responsibilities

- `lib/cong-no-vt/balance-report-service.ts` (`"use server"`):
  - Export `getMaterialDetailReport({ year?, month?, entityIds?, projectIds?, view, showZero }) → { rows, subtotals, periodEnd }`.
  - Role gate: `requireRole(role, "viewer")`.
- `components/ledger/detail-report-table.tsx` (server component — no interactivity):
  - Props: `rows: DetailRow[]`, `subtotals: SubtotalRow[]`, `view`, `showZero`, `partyLabel`.
  - Renders columns conditionally per `view`. Rowspan for group columns.
- `components/ledger/detail-report-filter.tsx` (`"use client"`):
  - Props: `currentYear, currentMonth, currentView, currentShowZero, currentEntityIds, currentProjectIds, entities, ledgerType` (cascade endpoint chooses ledger filter).
  - Uses `MultiSelectFilter` for entity (paramName `entityIds`) and project (paramName `projectIds`).
  - On entity selection change: fetch `/api/cong-no/cascade-projects?ledgerType={...}&entityIds={...}` with AbortController; update project options state.
  - Apply button pushes consolidated URL.
- `app/api/cong-no/cascade-projects/route.ts`: GET handler.

### Types

```ts
type DetailRow = {
  entityId: number; entityName: string;
  partyId: number;  partyName: string;
  projectId: number | null; projectName: string | null;
  // period (T)
  phatSinhT: Prisma.Decimal;
  daTraT:    Prisma.Decimal;
  noCuoiT:   Prisma.Decimal;
  // cumulative (∑)
  phatSinhCum: Prisma.Decimal;
  daTraCum:    Prisma.Decimal;
  noCum:       Prisma.Decimal;
};

type SubtotalRow = {
  kind: "entity" | "entity-party";
  entityId: number;
  partyId?: number;
  // same 6 numeric fields
  phatSinhT: Prisma.Decimal; daTraT: Prisma.Decimal; noCuoiT: Prisma.Decimal;
  phatSinhCum: Prisma.Decimal; daTraCum: Prisma.Decimal; noCum: Prisma.Decimal;
};
```

## Related Code Files

**Create:**
- `lib/cong-no-vt/balance-report-service.ts`
- `components/ledger/detail-report-table.tsx`
- `components/ledger/detail-report-filter.tsx`
- `app/api/cong-no/cascade-projects/route.ts`

**Modify:**
- `app/(app)/cong-no-vt/chi-tiet/page.tsx` (rewrite contents)

**Read for context:**
- `app/(app)/cong-no-vt/bao-cao-thang/page.tsx` (async searchParams, filter wiring)
- `lib/cong-no-vt/material-ledger-service.ts` (role gate, revalidate)
- `components/ledger/multi-select-filter.tsx` (props + URL sync)
- `lib/ledger/balance-service.ts` (P1)

**Verify-before-edit (grep):**
- `DebtMatrix` import sites — confirm only the 2 chi-tiet pages drop the import.

**Delete:** none.

## Implementation Steps

1. Pre-check: grep `DebtMatrix` callers — document.
2. Build `app/api/cong-no/cascade-projects/route.ts`:
   - GET handler; auth via module read; parse `ledgerType`, `entityIds` csv.
   - Run union query; resolve names; return JSON.
3. Build `lib/cong-no-vt/balance-report-service.ts`:
   - `"use server"`.
   - `getMaterialDetailReport({ year?, month?, entityIds?, projectIds? })`.
   - Compute `periodStart`/`periodEnd`. If `month` absent, period = lifetime → period cols equal cumulative cols (acceptable for `view=ca-hai`).
   - Run 1 GROUP BY query with 6 FILTER aggregates + opening LEFT JOIN.
   - Batch fetch names.
   - Compute 6 numerics per triple.
   - Drop zero rows based on `view` (server takes `view`+`showZero` as inputs).
   - Compute subtotals (entity, entity-party).
   - Sort by names; nulls last.
4. Build `components/ledger/detail-report-table.tsx`:
   - Server-renderable; pure rendering.
   - Conditional columns per `view`.
   - Rowspan for entity + party group cells.
   - `vi-VN` formatting; right-align numerics.
5. Build `components/ledger/detail-report-filter.tsx`:
   - `"use client"`. Use `MultiSelectFilter` for entities + projects.
   - On entity change: fetch cascade endpoint with `AbortController`; replace project options.
   - View `<RadioGroup>` with 3 options. Hide-zero `<Checkbox>`.
   - Year + month selects (year list = current ± 3).
   - Apply button → `router.push` consolidated URL.
6. Rewrite `app/(app)/cong-no-vt/chi-tiet/page.tsx`:
   - Replace imports of `getMaterialDebtMatrix`, `DebtMatrix`, old `MultiSelectFilter` usage.
   - Parse async `searchParams` (Next 16 pattern from `bao-cao-thang/page.tsx:14`).
   - `requireModuleAccess("cong-no-vt.chi-tiet", { minLevel: "read", scope: "module" })`.
   - Load: entities (`prisma.entity.findMany`), initial projects via cascade query for current entity selection (or all projects if no entity filter).
   - Call `getMaterialDetailReport`; render header + filter + table.
7. `pnpm tsc --noEmit`; manual smoke at `/cong-no-vt/chi-tiet?year=2026&month=5`.
8. Integration test for `getMaterialDetailReport`:
   - Seed entity + 2 suppliers + 2 projects + opening + mix of `lay_hang`/`thanh_toan` in 2 months.
   - Assert 6 numerics per triple.
   - Assert hide-zero drops a triple whose period cols all = 0 (when `view=trong-thang`).
   - Assert reconciliation: `noCum` of a triple equals `getMaterialCurrentBalance` for that triple.

## Todo List

- [ ] Grep `DebtMatrix` callers; document
- [ ] Build `/api/cong-no/cascade-projects` route + auth gate
- [ ] Build `lib/cong-no-vt/balance-report-service.ts` (single-query, 6 FILTER aggregates + opening LEFT JOIN)
- [ ] Build shared `detail-report-table.tsx` (view-aware column rendering, subtotals, hide-zero)
- [ ] Build shared `detail-report-filter.tsx` (cascade w/ AbortController, multi-selects, view radio, hide-zero check)
- [ ] Rewrite `chi-tiet/page.tsx` with `requireModuleAccess`
- [ ] Integration test: seed + assert 6 numerics + reconciliation w/ `getMaterialCurrentBalance`
- [ ] Cascade race test (manual): rapid entity toggling → no stale options
- [ ] `pnpm tsc --noEmit` green
- [ ] Manual smoke: empty filters, multi-entity, cascade narrows projects, view toggle changes column count, hide-zero toggle changes row count

## Success Criteria

- `/cong-no-vt/chi-tiet?year=2026&month=5` renders flat table:
  - 3 group cols + 6 numeric cols (`view=ca-hai` default).
  - Toggle to `trong-thang` → 3 group + 3 period numeric.
  - Toggle to `luy-ke` → 3 group + 3 cum numeric.
- Hide-zero default ON drops triples with all-zero visible numerics; checkbox toggles to show all.
- Multi-select Chủ thể: selecting 2 entities filters rows + cascades projects.
- Cascade Dự án: options reflect only projects that exist in ledger for selected entities; empty entity → all projects.
- Subtotals per entity and per (entity, party) match sum of their rows.
- `noCum` reconciles with `getMaterialCurrentBalance` for any displayed triple.
- A canbo_vt user without `cong-no-vt.chi-tiet` access (admin override) hits 403 on direct URL.
- Page report queries ≤ 1 (Prisma query log) + 1 cascade fetch when entity changes.

## Risk Assessment

| Risk | L | I | Mitigation |
|------|---|---|------------|
| Hidden `DebtMatrix` consumers break | Low | Med | Pre-grep step; keep file intact |
| 6 FILTER aggregates slow on large dataset | Low | Med | Existing composite index `(ledgerType, entityId, partyId, projectId, date)` covers; benchmark in test seed (e.g., 10k tx, expect <200ms) |
| Cascade race condition | Med | Low | `AbortController` per fetch + request id tracker |
| `view=ca-hai` table too wide | Med | Low | `overflow-x-auto` + sticky 3 group cols |
| Server zero-row filter using stale `view` (URL not updated yet) | Low | Med | Filter Apply button pushes single consolidated URL → atomic |
| Opening balance with `projectId=NULL` mis-joins | Med | High | Use `IS NOT DISTINCT FROM` in LEFT JOIN (covered by P1 Test I) |
| Forgot to pass `view` to server when computing zero-row filter | Med | Med | Service signature accepts `view` explicitly; not derived |

## Security Considerations

- Page-level `requireModuleAccess` enforces submodule-scoped read.
- Cascade route enforces same module read.
- Server action role gate.
- All raw SQL parameterized.

## Next Steps

- P4 mirrors with `ledgerType='labor'`, `partyLabel="Đội thi công"`, `Contractor` model, `cong-no-nc.chi-tiet` ACL key.
- Sub-B unaffected by UI changes — only consumes balance-service.
