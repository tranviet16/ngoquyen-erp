# Researcher 01 — `dieu_chinh` sign convention

## Verdict: RAW SIGN (no transformation)

- `dieu_chinh` `totalTt`/`totalHd` stored with **literal sign**
- POSITIVE → increases payable (extra debt to pay)
- NEGATIVE → decreases payable (debt write-off / refund)
- No constraint, no separate direction column

## Evidence

- `prisma/schema.prisma:540–576` — `LedgerTransaction.totalTt`/`totalHd` are `Decimal(18, 2)`, no check constraint
- `lib/ledger/ledger-aggregations.ts:203` — `queryCurrentBalance` only negates `thanh_toan`, treats `dieu_chinh` as raw
- `lib/ledger/ledger-aggregations.ts:87–88, 169` — `querySummary` and `queryMonthlyReport` use `+ dieu_chinh_tt` (raw add)
- `lib/import/adapters/cong-no-vat-tu.adapter.ts:188–199` — import writes amount as-is, sign comes from Excel source

## SQL pattern for monthly-by-party

Split `dieu_chinh` by sign into `lay_hang` / `thanh_toan` buckets per SOP:

```sql
COALESCE(SUM(CASE
  WHEN "transactionType" = 'lay_hang' THEN "totalTt"
  WHEN "transactionType" = 'dieu_chinh' AND "totalTt" > 0 THEN "totalTt"
  ELSE 0
END), 0) AS lay_hang_tt,

COALESCE(SUM(CASE
  WHEN "transactionType" = 'thanh_toan' THEN "totalTt"
  WHEN "transactionType" = 'dieu_chinh' AND "totalTt" < 0 THEN -"totalTt"
  ELSE 0
END), 0) AS thanh_toan_tt
```

Same shape for `totalHd`. Closing = `opening + lay_hang - thanh_toan`.

## Edge cases

- Mixed-sign within period: handled natively by sum
- NULL: schema defaults to 0, no nulls
- Opening balance: comes from `ledger_opening_balances` + carry-forward of all tx prior to month start (not from `dieu_chinh` directly)
