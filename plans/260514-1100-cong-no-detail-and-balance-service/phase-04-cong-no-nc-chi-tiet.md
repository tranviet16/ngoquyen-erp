# Phase 4 — `/cong-no-nc/chi-tiet` rewrite

## Context Links

- Current implementation (to REPLACE): `app/(app)/cong-no-nc/chi-tiet/page.tsx`
- Pattern reference: `app/(app)/cong-no-nc/bao-cao-thang/page.tsx`
- Server-action pattern: `lib/cong-no-nc/labor-ledger-service.ts`
- Shared components from P3: `components/ledger/detail-report-table.tsx`, `components/ledger/detail-report-filter.tsx`
- Shared cascade endpoint from P3: `app/api/cong-no/cascade-projects/route.ts` (accepts `ledgerType` query param)
- Balance source: P1 `lib/ledger/balance-service.ts`
- ACL: P2 (`cong-no-nc.chi-tiet` key)

## Overview

- **Priority**: P1
- **Status**: completed
- **Effort**: 2h
- **Owner files**:
  - `lib/cong-no-nc/balance-report-service.ts` (new)
  - `app/(app)/cong-no-nc/chi-tiet/page.tsx` (rewrite)

Structural twin of P3 for the labor ledger. Re-uses table + filter + cascade route from P3. Differences only in: party model (`Contractor`), party label (`"Đội thi công"`), `ledgerType: "labor"`, ACL key (`cong-no-nc.chi-tiet`).

## Closed decisions

Inherits from plan.md → "Closed decisions": flat table, 8 numeric cols default, view toggle (`trong-thang|luy-ke|ca-hai`), hide-zero default ON, multi-select entities, cascade multi-select projects, single month. SOP formula `opening + lay_hang − thanh_toan`; `dieu_chinh` excluded.

## Key Insights

- DRY hard requirement: NO duplicate UI logic. If P3 hardcodes "NCC" anywhere, fix in P3 before P4 starts — `partyLabel` prop must drive all party-name display.
- Cascade endpoint from P3 must accept `ledgerType` query param (already specified in P3) → P4 passes `ledgerType=labor`.
- `DetailRow` type is exported by P3's `lib/cong-no-vt/balance-report-service.ts`. P4 imports it; no redeclare. (If P3 review prefers, promote to `lib/ledger/detail-report-types.ts` — decide during P3.)
- `Contractor` schema parity: same `deletedAt` pattern as `Supplier` (verify before service code).

## Requirements

### Functional

- Page accepts identical `searchParams`: `year?, month?, entityIds?, projectIds?, view?, showZero?`.
- Guards: `requireModuleAccess("cong-no-nc.chi-tiet", { minLevel: "read", scope: "module" })`.
- Renders shared filter (with `ledgerType="labor"` so cascade endpoint scopes correctly) and shared table with `partyLabel="Đội thi công"`.
- Columns identical to P3: 3 group cols + 3/3/6 numeric cols depending on `view`.

### Non-functional

- 1 GROUP BY query for report (6 FILTER aggregates + opening LEFT JOIN) — same budget as P3.
- 1 cascade fetch when entity multi-select changes.
- Decimal precision preserved.

## Architecture

Identical data flow to P3 with the substitutions:

| Aspect | P3 (vật tư) | P4 (nhân công) |
|--------|-------------|----------------|
| `ledgerType` arg | `"material"` | `"labor"` |
| Party model | `Supplier` | `Contractor` |
| Party label prop | `"NCC"` | `"Đội thi công"` |
| ACL key | `cong-no-vt.chi-tiet` | `cong-no-nc.chi-tiet` |
| Service function | `getMaterialDetailReport` | `getLaborDetailReport` |

```ts
// lib/cong-no-nc/balance-report-service.ts
export async function getLaborDetailReport(
  filters: { year?: number; month?: number; entityIds?: number[]; projectIds?: number[]; view: View; showZero: boolean }
): Promise<{ rows: DetailRow[]; subtotals: SubtotalRow[]; periodEnd: Date | null }>;
```

`DetailRow`, `SubtotalRow`, `View` imported from P3 service (or shared types file if P3 promoted).

## Related Code Files

**Create:**
- `lib/cong-no-nc/balance-report-service.ts`

**Modify:**
- `app/(app)/cong-no-nc/chi-tiet/page.tsx` (rewrite contents)

**Read for context:**
- `lib/cong-no-nc/labor-ledger-service.ts` (role gate, revalidate)
- P3 outputs: service + shared components + cascade route

**Verify-before-edit:**
- P3 shared components accept `partyLabel` and `ledgerType` props cleanly with no hardcoded "NCC"/"material".
- `Contractor` model has `deletedAt` field.

**Delete:** none.

## Implementation Steps

1. Wait for P3 to land (or work in parallel only after shared component contracts are stubbed and merged).
2. Confirm P3 shared components are party-agnostic — grep `"NCC"` and `"material"` in `components/ledger/detail-report-*.tsx`; expected zero matches.
3. Confirm P3 cascade route accepts `ledgerType=labor` parameter without code changes.
4. Create `lib/cong-no-nc/balance-report-service.ts`:
   - `"use server"`.
   - Mirror P3's `getMaterialDetailReport` with substitutions: `ledgerType: 'labor'`, party name fetch from `prisma.contractor.findMany`.
   - Export `getLaborDetailReport(filters)` returning `{ rows: DetailRow[], subtotals: SubtotalRow[], periodEnd }`.
5. Rewrite `app/(app)/cong-no-nc/chi-tiet/page.tsx`:
   - Drop `getLaborDebtMatrix` + `DebtMatrix` imports.
   - Parse async `searchParams`.
   - `requireModuleAccess("cong-no-nc.chi-tiet", { minLevel: "read", scope: "module" })`.
   - Load: entities + initial projects (cascade query for current entity selection or all projects via `prisma.project.findMany`).
   - Call `getLaborDetailReport`; render header "Công nợ chi tiết – Nhân công" + filter (`ledgerType="labor"`, `partyLabel="Đội thi công"`) + table (`partyLabel="Đội thi công"`).
6. Integration test mirroring P3:
   - Seed labor ledger rows (entity + 2 contractors + 2 projects + opening + mixed `lay_hang`/`thanh_toan`).
   - Assert 6 numerics per triple.
   - Assert hide-zero behavior under each view.
   - Reconciliation: `noCum` matches `getLaborCurrentBalance` for the triple.
7. `pnpm tsc --noEmit`; manual smoke at `/cong-no-nc/chi-tiet`.

## Todo List

- [ ] Confirm P3 shared components are party-agnostic (no "NCC"/"material" literals)
- [ ] Confirm `DetailRow` export location (P3 service vs shared types file)
- [ ] Verify `Contractor` has `deletedAt`
- [ ] Build `lib/cong-no-nc/balance-report-service.ts`
- [ ] Rewrite `chi-tiet/page.tsx` (labor)
- [ ] Page-level `requireModuleAccess("cong-no-nc.chi-tiet")`
- [ ] Integration test `getLaborDetailReport`
- [ ] Reconcile `noCum` with `getLaborCurrentBalance`
- [ ] `pnpm tsc --noEmit` green
- [ ] Manual smoke: view toggle, hide-zero, multi-entity, cascade dự án

## Success Criteria

- `/cong-no-nc/chi-tiet?year=2026&month=5` renders flat table with party label "Đội thi công".
- Default `view=ca-hai` → 3 group cols + 6 numeric cols.
- Hide-zero default ON; checkbox toggles.
- Multi-entity + cascade project filters work; cascade endpoint queries with `ledgerType=labor`.
- `noCum` reconciles with `getLaborCurrentBalance`.
- ACL gates work.
- No duplicated code with P3 beyond unavoidable party/ledgerType substitutions (diff check: only ledgerType arg, party model, label string differ from P3 service).

## Risk Assessment

| Risk | L | I | Mitigation |
|------|---|---|------------|
| P3 components leak "NCC" or "material" literal | Low | Low | Pre-flight grep; gate P4 start on clean grep |
| `Contractor` missing `deletedAt` | Low | Low | Schema check (verified pattern parity) |
| Copy-paste drift from P3 service | Med | Med | Code review checklist: diff must show only ledgerType, party model, label |
| Labor role-default coverage | Med | Low | P2 includes `cong-no-nc.chi-tiet` in `CANBO_VT_EDIT_MODULES` parity |
| Cascade endpoint not honoring `ledgerType=labor` | Low | Med | P3 spec mandates query param; P4 verifies before page wire |

## Security Considerations

Same as P3 — page guard + service role check + parameterized queries.

## Next Steps

- Once P4 green: Sub-A complete. Notify Sub-B that `lib/ledger/balance-service.ts` is canonical; semantics include `opening`, exclude `dieu_chinh`.
- Flag follow-up to PO: form cleanup for `dieu_chinh` option in `components/ledger/transaction-form-dialog.tsx:29` (out of Sub-A scope).
