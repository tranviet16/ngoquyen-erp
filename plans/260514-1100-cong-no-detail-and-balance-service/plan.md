---
title: "Balance service + Báo cáo chi tiết công nợ (Sub-A)"
description: "Foundation: shared ledger balance service + redesigned /chi-tiet detail report for cong-no-vt and cong-no-nc, gated by new ACL submodule keys."
status: completed
priority: P1
effort: 10h
branch: main
tags: [ledger, cong-no, acl, balance-service, report]
created: 2026-05-14
completed: 2026-05-14
blocks: [project:260514-1200-payment-refactor-multi-category]
---

# Sub-A — Balance service + Báo cáo chi tiết công nợ

## Delivery Summary

✓ **All 4 phases completed** 2026-05-14. 

**P1**: `lib/ledger/balance-service.ts` + 14 unit tests (all green). SOP formula `opening + lay_hang − thanh_toan`, `dieu_chinh` excluded. 3 exports: `getOutstandingDebt`, `getCumulativePaid`, `getBalancesBulk` (single-query bulk API).

**P2**: ACL keys `cong-no-vt.chi-tiet` + `cong-no-nc.chi-tiet` registered in 4-file ritual (modules.ts, module-labels.ts, role-defaults.ts, app-sidebar.tsx). Sidebar updated with "Chi tiết" menu items. 

**P3**: `lib/cong-no-vt/balance-report-service.ts`, detail-report-table/filter components, cascade-projects API route, page rewrite. Flat 8-col grid with view toggle (trong-thang|luy-ke|ca-hai), hide-zero checkbox (default ON), multi-select entity/project filters.

**P4**: `lib/cong-no-nc/balance-report-service.ts`, page rewrite. Re-uses P3 shared components. Party label "Đội thi công" parameterized.

**Code review fixes**: C1 cascade route module-auth gate added. C2 end-of-month boundary exclusive (≤end_of_month_date→ <next_day) applied. `pnpm tsc --noEmit` green throughout. `pnpm test lib/ledger` 92/92 tests passing.

## Context

- Brainstorm: `plans/reports/brainstorm-260514-payment-refactor-and-cong-no-detail.md`
- Models: `prisma/schema.prisma:611-670` (`LedgerTransaction`, `LedgerOpeningBalance:651`)
- Existing balance compute: `lib/ledger/ledger-aggregations.ts:232` `queryCurrentBalance`, `:104` `queryMonthlyByParty` (canonical SOP formula reference)
- Existing service entry: `lib/ledger/ledger-service.ts:177` `currentBalance`
- Existing report wrappers: `lib/cong-no-vt/material-ledger-service.ts:262` `getMaterialCurrentBalance`, labor counterpart in `lib/cong-no-nc/labor-ledger-service.ts`
- Existing pages to REDESIGN (not create): `app/(app)/cong-no-vt/chi-tiet/page.tsx`, `app/(app)/cong-no-nc/chi-tiet/page.tsx`
- Report pattern reference: `app/(app)/sl-dt/bao-cao-dt/page.tsx`, `app/(app)/cong-no-vt/bao-cao-thang/page.tsx`
- Reusable multi-select: `components/ledger/multi-select-filter.tsx`
- ACL files: `lib/acl/modules.ts`, `lib/acl/module-labels.ts`, `lib/acl/role-defaults.ts`, `components/layout/app-sidebar.tsx`

## Closed decisions (frozen for this plan)

1. **Single flat bảng** grouped by (Chủ thể × NCC × Công trình) with a view toggle: `Trong tháng` | `Lũy kế` | `Cả hai` (default `Cả hai`).
2. **Zero-rows hidden by default**, header checkbox `Hiện cả dòng = 0` toggles. Zero-row = all currently-visible numeric columns = 0.
3. **Filters**:
   - Chủ thể: multi-select (re-use `MultiSelectFilter`)
   - Dự án: multi-select **cascade** — options restricted to projects that have ledger rows joining any selected chủ thể; empty chủ thể selection → all projects
   - Tháng: single select
4. **Formula = SOP** `Công nợ = opening + lay_hang − thanh_toan`. `dieu_chinh` is EXCLUDED everywhere in Sub-A (DB has 0 rows, verified). The form option "Điều chỉnh" in `components/ledger/transaction-form-dialog.tsx:29` is a SEPARATE follow-up cleanup (out of Sub-A scope — see Follow-ups).

## Architecture

```
lib/ledger/balance-service.ts                  (NEW — thin facade)
   ├─ getOutstandingDebt({ledgerType, entityId?, partyId, projectId?, asOf?})
   │     = opening + Σ lay_hang(≤asOf) − Σ thanh_toan(≤asOf)
   ├─ getCumulativePaid({ledgerType, entityId?, partyId, projectId?, asOf?})
   │     = Σ thanh_toan(≤asOf) — lifetime if asOf omitted
   └─ getBalancesBulk({ledgerType, pairs[], asOf?})
         single GROUP BY + opening LEFT JOIN → Map<key, {outstanding, paid, opening, layHang, thanhToan}>

lib/cong-no-vt/balance-report-service.ts       (NEW)
lib/cong-no-nc/balance-report-service.ts       (NEW)
   └─ getDetailReport({year, month, projectIds?, entityIds?}) →
        rows: [{entityId, partyId, projectId, phatSinhT, daTraT, noCuoiT, phatSinhCum, daTraCum, noCum}]

app/(app)/cong-no-vt/chi-tiet/page.tsx         (REWRITE)
app/(app)/cong-no-nc/chi-tiet/page.tsx         (REWRITE)
components/ledger/detail-report-table.tsx      (NEW — flat 8-col table + view toggle + hide-zero toggle)
components/ledger/detail-report-filter.tsx     (NEW — month + cascade entity/project multi-select)
app/api/cong-no/cascade-projects/route.ts      (NEW — server endpoint feeding cascade filter)
```

### Data flow

1. URL `/cong-no-vt/chi-tiet?year&month&entityIds=1,2&projectIds=5&view=both&showZero=0`
2. Layout guard `cong-no-vt` (read) + page-level `requireModuleAccess("cong-no-vt.chi-tiet", read)`
3. Page reads filter state from `searchParams`. Filter component fetches cascade project list via client effect when chủ thể changes (or via server prefetch in page if entityIds present).
4. Page calls `getMaterialDetailReport({year, month, entityIds, projectIds})` →
   - Query A: `GROUP BY (entityId, partyId, projectId)` over `ledger_transactions` joined with `ledger_opening_balances`, returning period sums (T) AND lifetime sums (cum) in one shot using `FILTER (WHERE date BETWEEN ...)` aggregates.
   - Query B: by-id `findMany` for entity/party/project names.
5. Server filters out zero-rows (using current `view` mode to decide which cols count) UNLESS `showZero=1`.
6. Render `<DetailReportTable view={view} showZero={showZero} rows={...}/>`.

## Columns (per view mode)

| View | Columns rendered (after group cols Chủ thể | NCC | Công trình) |
|------|--------------------------------------------------------------------|
| `trong-thang` | Phát sinh T, Đã trả T, Nợ cuối T |
| `luy-ke` | Phát sinh ∑, Đã trả ∑, Nợ ∑ |
| `ca-hai` (default) | Phát sinh T, Đã trả T, Nợ cuối T, Phát sinh ∑, Đã trả ∑, Nợ ∑ (8 numeric cols total) |

Nợ cuối T = `opening + Σ lay_hang(≤end-of-month) − Σ thanh_toan(≤end-of-month)`.
Nợ ∑ = `opening + Σ lay_hang(lifetime) − Σ thanh_toan(lifetime)` (asOf omitted).

## Phases

| # | File | Owns | Effort | Status |
|---|------|------|--------|--------|
| 1 | [phase-01-balance-service.md](./phase-01-balance-service.md) | `lib/ledger/balance-service.ts`, unit tests | 2.5h | completed |
| 2 | [phase-02-acl-and-nav.md](./phase-02-acl-and-nav.md) | `lib/acl/{modules,module-labels,role-defaults}.ts`, `app-sidebar.tsx` | 1.5h | completed |
| 3 | [phase-03-cong-no-vt-chi-tiet.md](./phase-03-cong-no-vt-chi-tiet.md) | `lib/cong-no-vt/balance-report-service.ts`, `app/(app)/cong-no-vt/chi-tiet/page.tsx`, `components/ledger/detail-report-{table,filter}.tsx`, cascade route | 4h | completed |
| 4 | [phase-04-cong-no-nc-chi-tiet.md](./phase-04-cong-no-nc-chi-tiet.md) | `lib/cong-no-nc/balance-report-service.ts`, `app/(app)/cong-no-nc/chi-tiet/page.tsx` | 2h | completed |

## Dependency graph

```
P1 (balance-service) ──┬─► P3 (cong-no-vt chi-tiet)
                       └─► P4 (cong-no-nc chi-tiet)
P2 (ACL + nav) ────────┴─► P3, P4
```

P4 imports shared table/filter/cascade-route from P3 → P4 starts after P3 lands (parallel possible if shared components stubbed first).

## File ownership matrix

| File | Phase | Notes |
|------|-------|-------|
| `lib/ledger/balance-service.ts` | P1 | new |
| `lib/acl/modules.ts` | P2 | edit |
| `lib/acl/module-labels.ts` | P2 | edit |
| `lib/acl/role-defaults.ts` | P2 | edit |
| `components/layout/app-sidebar.tsx` | P2 | edit |
| `components/ledger/detail-report-table.tsx` | P3 | new (P4 consumes) |
| `components/ledger/detail-report-filter.tsx` | P3 | new (P4 consumes) |
| `app/api/cong-no/cascade-projects/route.ts` | P3 | new (P4 consumes — ledgerType query param) |
| `lib/cong-no-vt/balance-report-service.ts` | P3 | new |
| `app/(app)/cong-no-vt/chi-tiet/page.tsx` | P3 | rewrite |
| `lib/cong-no-nc/balance-report-service.ts` | P4 | new |
| `app/(app)/cong-no-nc/chi-tiet/page.tsx` | P4 | rewrite |

## Cross-cutting risks

| Risk | L | I | Mitigation |
|------|---|---|------------|
| Cascade filter race: user toggles entity quickly → stale project options arrive after newer request | Med | Low | Filter component uses `AbortController`; latest-wins by request id. |
| `LedgerOpeningBalance` join doubles rows if ledger has no transactions but opening exists | Med | Med | Use FULL OUTER JOIN on `(entityId,partyId,projectId)` triples; zero-fill missing tx aggregates. P1 unit test covers opening-only triple. |
| Zero-row filter mismatch UX: server filters by `view`, but client toggles `view` → re-fetch needed | Med | Low | View + showZero live in `searchParams` → server re-renders on change. No client-only filtering shortcut. |
| 8-col table too wide on narrow screens | Low | Low | `overflow-x-auto` wrapper; sticky group cols. |
| Multi-select for projects with many options laggy | Low | Low | Cascade pre-filters; `MultiSelectFilter` already supports search input. |
| ACL fallback drift for new submodule keys | High | Med | P2 mirrors parent module access in `CANBO_VT_EDIT_MODULES`. |

## Backwards compatibility

- ACL additive: existing `cong-no-vt`/`cong-no-nc` access unchanged. New submodule keys default via role-defaults.
- Routes preserved (`/chi-tiet` URL). Content changes shape.
- `DebtMatrix` (`components/ledger/debt-matrix.tsx`) NOT deleted — confirm no other callers in P3.
- Sub-B already imports `getOutstandingDebt`/`getCumulativePaid`/`getBalancesBulk` — names unchanged; semantics shift to include `opening` and exclude `dieu_chinh`. Sub-B plan note flagged.

## Rollback strategy

- P1: file additive; revert leaves no orphan callers (until P3/P4 ship).
- P2: revert 4 ACL files; `canAccess()` returns null for unknown keys safely.
- P3/P4: page rewrites git-reversible; old `DebtMatrix` import still resolves on revert.
- Cascade API route: deletion safe — only filter component consumes.

## Test matrix

| Layer | Phase | Coverage |
|-------|-------|----------|
| Unit | P1 | `getOutstandingDebt` w/ asOf cutoff; opening-only triple; ledgerType isolation; `dieu_chinh` rows IGNORED; `getBalancesBulk` single-query; missing-pair zero-fill. |
| Unit | P2 | `getDefaultModuleLevel("canbo_vt", "cong-no-vt.chi-tiet") === "edit"`; `MODULE_LEVELS` shape. |
| Integration | P3, P4 | E2E: seed 1 entity × 2 parties × 2 projects × mixed `lay_hang`+`thanh_toan`+opening → assert all 6 numeric columns match SOP formula. Cascade: select entity A → projects filtered. Zero-row hide vs show. View toggle column count. |
| Reconcile | P3, P4 | Nợ ∑ must equal `getMaterialCurrentBalance` / `getLaborCurrentBalance` for the same (entity, party, project) triple. |

## Success criteria

- `balance-service.ts` exports 3 functions; all ledgerType-parameterized; formula = `opening + lay_hang − thanh_toan`; `dieu_chinh` excluded; unit-tested.
- `getBalancesBulk(100 pairs)` issues exactly 1 SQL query (counted via `prisma.$on('query')`).
- ACL grid (`/admin/permissions`) shows 2 new submodule keys with VN labels.
- Sidebar shows "Chi tiết" under both Công nợ vật tư and Công nợ nhân công for users with access.
- `/cong-no-vt/chi-tiet?year=2026&month=5` renders the flat table with view toggle (3 modes), hide-zero checkbox (default ON), multi-select chủ thể, cascade multi-select dự án, single-select tháng.
- Default view `Cả hai` shows 3 group cols + 6 numeric cols (Phát sinh T, Đã trả T, Nợ cuối T, Phát sinh ∑, Đã trả ∑, Nợ ∑).
- Same for `/cong-no-nc/chi-tiet` (party label "Đội thi công").
- Reconciliation: Nợ ∑ matches existing `getMaterial/LaborCurrentBalance` (which uses SOP formula).
- Sub-B imports `getOutstandingDebt`/`getCumulativePaid`/`getBalancesBulk` unchanged; values now include opening + exclude `dieu_chinh`.

## Open questions

All 4 prior open questions are CLOSED — see "Closed decisions" above.

## Follow-ups (out of Sub-A scope — flag for PO)

- **Form cleanup**: remove `{ value: "dieu_chinh", label: "Điều chỉnh" }` from `components/ledger/transaction-form-dialog.tsx:29`. Reason: SOP does not define `dieu_chinh`; DB has 0 such rows; Sub-A formula excludes it; keeping the form option creates a data path that would silently drift from reports. Defer to a separate ticket so PO can confirm and we can audit any UI/import paths that still emit it (`lib/import/adapters/cong-no-vat-tu.adapter.ts`, schemas).
- **Migration check**: confirm via prod query `SELECT COUNT(*) FROM ledger_transactions WHERE transaction_type='dieu_chinh' AND deleted_at IS NULL` before form-cleanup ticket lands.
