# Phase 1 — Balance service

## Context Links

- Brainstorm: `plans/reports/brainstorm-260514-payment-refactor-and-cong-no-detail.md`
- Existing balance compute: `lib/ledger/ledger-aggregations.ts:232` `queryCurrentBalance`, `:104` `queryMonthlyByParty` (canonical SOP formula)
- Existing wrapper: `lib/ledger/ledger-service.ts:177` `currentBalance`
- Schema: `prisma/schema.prisma:611-670` (`LedgerTransaction`, `LedgerOpeningBalance:651`)

## Overview

- **Priority**: P1 (blocker for P3/P4 and Sub-B)
- **Status**: completed
- **Effort**: 2.5h
- **Owner files**: `lib/ledger/balance-service.ts` (new), `lib/ledger/__tests__/balance-service.test.ts` (new)

Thin, ledgerType-parameterized facade over the SOP balance formula. Sub-B consumes for `congNo`/`luyKe` auto-fill; P3/P4 consume `getBalancesBulk` for the detail report grid.

## Closed decisions (frozen)

- **Formula (SOP)**: `Công nợ = opening + Σ lay_hang − Σ thanh_toan`
- **`dieu_chinh` rows are IGNORED** — verified 0 rows in prod DB, SOP does not define this type.
- **Opening balance INCLUDED** (matches `queryCurrentBalance`/`queryMonthlyByParty` which both sum opening + tx delta).
- **Signatures stable** for Sub-B: `getOutstandingDebt`, `getCumulativePaid`, `getBalancesBulk` (names unchanged from earlier plan; semantics now include opening, still exclude `dieu_chinh`).

## Key Insights

- `queryMonthlyByParty` (ledger-aggregations.ts:104-228) already implements the SOP formula correctly: `closingTt = openingTt + layHangTt − thanhToanTt` (line 221) — re-use its CTE pattern for our bulk function.
- DO NOT re-use `queryCurrentBalance` directly because its return shape (`{tt, hd}`) differs and it accepts a different filter set; we need a focused, bulk-capable function.
- All monetary arithmetic stays in `Prisma.Decimal`; convert to `number` only at the API boundary.
- Index `(ledgerType, entityId, partyId, projectId, date)` (schema.prisma:646) covers our GROUP BY scan.

## Requirements

### Functional signatures

```ts
type BalanceKey = string; // keyOf(entityId, partyId, projectId)

function keyOf(entityId: number | null, partyId: number, projectId: number | null): BalanceKey;

async function getOutstandingDebt(args: {
  ledgerType: "material" | "labor";
  entityId?: number;        // optional filter
  partyId: number;          // required
  projectId?: number | null;
  asOf?: Date;              // default: now
}): Promise<Prisma.Decimal>;
// = opening.balanceTt
//   + Σ totalTt WHERE transactionType='lay_hang' AND date<=asOf
//   − Σ totalTt WHERE transactionType='thanh_toan' AND date<=asOf
// dieu_chinh rows IGNORED.

async function getCumulativePaid(args: {
  ledgerType: "material" | "labor";
  entityId?: number;
  partyId: number;
  projectId?: number | null;
  asOf?: Date;              // default: now (lifetime if omitted-as-now)
}): Promise<Prisma.Decimal>;
// = Σ totalTt WHERE transactionType='thanh_toan' AND date<=asOf
// Opening NOT included (opening is debt-side balance, not historical payments).

async function getBalancesBulk(args: {
  ledgerType: "material" | "labor";
  pairs: Array<{ entityId?: number | null; partyId: number; projectId?: number | null }>;
  asOf?: Date;
}): Promise<Map<BalanceKey, {
  outstanding: Prisma.Decimal;  // = opening + lay_hang − thanh_toan
  paid:        Prisma.Decimal;  // = thanh_toan (≤ asOf)
  opening:     Prisma.Decimal;  // exposed for debug + reconciliation
  layHang:     Prisma.Decimal;  // exposed; useful for report period vs cum split
  thanhToan:   Prisma.Decimal;
}>>;
// Single SQL roundtrip (one CTE join with opening + tx aggregates).
// Pairs deduplicated server-side. Empty pairs → empty Map, no DB hit.
// Missing pair in result Map is allowed; caller should default to zero.
```

### Non-functional

- **One Prisma `$queryRaw` per public call** (verified via `prisma.$on('query')` test).
- **ledgerType isolation**: passing `'material'` must NEVER include `'labor'` rows.
- **No N+1**: bulk function MUST NOT iterate.
- **`dieu_chinh` exclusion** documented in JSDoc + unit test.

## Architecture

```
caller (P3 page / Sub-B payment-service)
   │
   ▼
lib/ledger/balance-service.ts
   │  Prisma.$queryRaw — CTE: opening LEFT JOIN tx aggregates
   ▼
PostgreSQL — ledger_transactions + ledger_opening_balances
```

### Internal helpers (private)

- `buildPairUnnest(pairs)` → parameterized `unnest(int[], int[], int[]) AS p(entity_id, party_id, project_id)`.
- `keyOf(entityId, partyId, projectId)` → canonical string with `'null'` sentinel.

### Bulk SQL sketch

```sql
WITH p AS (
  SELECT * FROM unnest($1::int[], $2::int[], $3::int[])
       AS p(entity_id, party_id, project_id)
),
ob AS (
  SELECT "entityId", "partyId", "projectId", "balanceTt"
  FROM ledger_opening_balances
  WHERE "ledgerType" = $4
),
tx AS (
  SELECT "entityId", "partyId", "projectId",
    COALESCE(SUM("totalTt") FILTER (WHERE "transactionType"='lay_hang'   AND "date"<=$5), 0) AS lay_hang,
    COALESCE(SUM("totalTt") FILTER (WHERE "transactionType"='thanh_toan' AND "date"<=$5), 0) AS thanh_toan
  FROM ledger_transactions
  WHERE "ledgerType" = $4 AND "deletedAt" IS NULL
  GROUP BY "entityId","partyId","projectId"
)
SELECT p.entity_id, p.party_id, p.project_id,
       COALESCE(ob."balanceTt",0) AS opening,
       COALESCE(tx.lay_hang,0)    AS lay_hang,
       COALESCE(tx.thanh_toan,0)  AS thanh_toan
FROM p
LEFT JOIN ob ON ob."entityId"=p.entity_id AND ob."partyId"=p.party_id
            AND ob."projectId" IS NOT DISTINCT FROM p.project_id
LEFT JOIN tx ON tx."entityId"=p.entity_id AND tx."partyId"=p.party_id
            AND tx."projectId" IS NOT DISTINCT FROM p.project_id
```

Then compute `outstanding = opening + lay_hang − thanh_toan`, `paid = thanh_toan` in JS using `Prisma.Decimal`.

## Related Code Files

**Create:**
- `lib/ledger/balance-service.ts`
- `lib/ledger/__tests__/balance-service.test.ts`

**Read for context:**
- `lib/ledger/ledger-aggregations.ts` (CTE patterns; opening join shape; `IS NOT DISTINCT FROM` usage)
- `lib/ledger/ledger-service.ts` (LedgerType, decimal conventions)

**Modify / Delete:** none.

## Implementation Steps

1. Create `lib/ledger/balance-service.ts`:
   - Imports: `Prisma`, `prisma`, `LedgerType`.
   - Export `keyOf`, `BalanceKey`.
   - Export `getOutstandingDebt`: implemented as a thin call into a private `_singlePair()` that wraps the same CTE for one pair (or simpler — call `getBalancesBulk([single])` and `.get(key)`).
   - Export `getCumulativePaid`: same approach but returns only `paid`. (Reuse `getBalancesBulk` to keep ONE SQL path; document the slight over-fetch — still 1 query.)
   - Export `getBalancesBulk`: full CTE shown above.
   - JSDoc each function with formula + `dieu_chinh excluded` + `opening included` + `caller responsible for auth`.
2. Unit tests `lib/ledger/__tests__/balance-service.test.ts`:
   - Seed via Prisma in `beforeEach`: 1 entity, 2 parties, 2 projects, mix of `lay_hang`/`thanh_toan`/`dieu_chinh` rows + opening balances in both `material` and `labor`.
   - **Test A — `dieu_chinh` ignored**: seed dieu_chinh of 1000; expect outstanding unchanged.
   - **Test B — opening included**: seed opening=500, lay_hang=300, thanh_toan=100 → outstanding=700.
   - **Test C — asOf cutoff**: future-dated lay_hang excluded.
   - **Test D — ledgerType isolation**: material call with only labor data → outstanding = opening only (material side) or 0 if no material opening.
   - **Test E — single query**: `getBalancesBulk(100 distinct pairs)` issues exactly 1 query (Prisma `$on('query')` counter).
   - **Test F — empty pairs**: returns empty Map, zero queries.
   - **Test G — missing pair**: a pair with no opening + no tx returns either absent OR `{opening:0, layHang:0, thanhToan:0, outstanding:0, paid:0}` — pick "present with zeros" for safer callers; document choice.
   - **Test H — `getCumulativePaid` excludes opening**: opening=500, thanh_toan=200 → paid=200.
   - **Test I — `IS NOT DISTINCT FROM` projectId NULL**: opening with `projectId=NULL` matches pair with `projectId=null` but not pair with `projectId=5`.
3. `pnpm tsc --noEmit`; `pnpm test lib/ledger`.

## Todo List

- [ ] Create `lib/ledger/balance-service.ts` with 3 public functions
- [ ] Implement single CTE-based bulk path; `getOutstandingDebt`/`getCumulativePaid` delegate to it
- [ ] JSDoc: SOP formula, `dieu_chinh` exclusion, opening inclusion, auth-caller-responsibility
- [ ] Write 9 unit tests (A–I)
- [ ] Verify single-query assertion (Test E) counts top-level statements only
- [ ] `pnpm tsc --noEmit` green
- [ ] `pnpm test lib/ledger` green

## Success Criteria

- File exists with 3 exported functions matching the signatures above.
- All 9 tests pass.
- `tsc --noEmit` zero errors.
- `getBalancesBulk` proven single-query (Test E).
- JSDoc documents formula and `dieu_chinh` exclusion on each public function.
- Reconciliation: `getOutstandingDebt` for any (entity, party, project) equals `queryMonthlyByParty.closingTt` for the latest month with activity (sanity check in Test J — optional).

## Risk Assessment

| Risk | L | I | Mitigation |
|------|---|---|------------|
| `IS NOT DISTINCT FROM` syntax differs in Prisma raw | Low | Med | Pattern present in PG; covered by Test I; fallback to `(a IS NULL AND b IS NULL) OR a=b` if needed |
| `unnest` of nullable int[] for projectId | Med | Med | Use `int4[]` with `NULL` values; PG supports nullable element. Test G/I covers. |
| Decimal precision loss to number | Low | Med | Return `Prisma.Decimal`; caller converts at edge |
| Test E false-positive (1 visible query but N internal) | Low | Low | Use `$on('query')` listener; counts statements only |
| Opening row with `projectId=NULL` accidentally matches all-project pair | Med | High | Test I asserts strict null-equality semantics |

## Security Considerations

- All queries parameterized — no SQL injection surface.
- No auth check inside this lib — caller (server action/page) responsible. Documented in file header.

## Next Steps

- P2 (ACL) runs in parallel; no shared files.
- P3 and P4 unblock when this lands.
- Sub-B Phase 02 unblocks (same signatures — no Sub-B code change required, only the value semantics shift).
