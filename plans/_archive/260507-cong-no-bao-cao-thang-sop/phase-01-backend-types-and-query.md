---
phase: 1
title: "Backend: types + queryMonthlyByParty"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Backend types + monthly-by-party query

## Overview

Thay `MonthlyReportRow` bằng `MonthlyByPartyRow`, viết `queryMonthlyByParty(ledgerType, year, month, entityId)` join opening balance + carry-forward + period aggregation theo SOP.

## Requirements

- **Functional**: query trả về 1 row per `partyId`, có `openingTt/Hd`, `layHangTt/Hd` (đã gộp dieu_chinh dương), `thanhToanTt/Hd` (đã gộp |dieu_chinh âm|), `closingTt/Hd = opening + lay - tra`. Resolve `partyName` ở service layer (supplier hoặc contractor tuỳ ledgerType).
- **Non-functional**: 1 round-trip SQL, không N+1.

## Architecture

### Type — `lib/ledger/ledger-types.ts`

```ts
export interface MonthlyByPartyRow {
  partyId: number;
  partyName: string;        // resolved at service layer
  openingTt: Prisma.Decimal;
  openingHd: Prisma.Decimal;
  layHangTt: Prisma.Decimal;   // gộp dieu_chinh dương
  layHangHd: Prisma.Decimal;
  thanhToanTt: Prisma.Decimal; // gộp |dieu_chinh âm|
  thanhToanHd: Prisma.Decimal;
  closingTt: Prisma.Decimal;   // open + lay - tra
  closingHd: Prisma.Decimal;
}
```

Xóa `MonthlyReportRow` (sẽ remove sau khi tất cả consumer migrate ở phase 2/5).

### Query — `lib/ledger/ledger-aggregations.ts`

Thêm `queryMonthlyByParty(ledgerType, year, month, entityId)`. Pseudo:

```sql
WITH first_of_month AS (SELECT make_date($year, $month, 1) AS d),
     last_of_month  AS (SELECT (make_date($year, $month, 1) + interval '1 month' - interval '1 day')::date AS d),

opening AS (
  -- partyId → opening = ob.balance + Σ(prior_tx) by sign rules
  SELECT party_id,
         COALESCE(SUM(tt_signed), 0) AS open_tt,
         COALESCE(SUM(hd_signed), 0) AS open_hd
  FROM (
    -- opening balance row(s) for this entity+ledger
    SELECT "partyId" AS party_id, "balanceTt" AS tt_signed, "balanceHd" AS hd_signed
    FROM ledger_opening_balances
    WHERE "ledgerType" = $type AND "entityId" = $entityId

    UNION ALL

    -- prior transactions: lay_hang +, thanh_toan -, dieu_chinh raw
    SELECT "partyId",
           CASE "transactionType"
             WHEN 'lay_hang' THEN "totalTt"
             WHEN 'thanh_toan' THEN -"totalTt"
             ELSE "totalTt"  -- dieu_chinh: raw sign
           END,
           CASE "transactionType"
             WHEN 'lay_hang' THEN "totalHd"
             WHEN 'thanh_toan' THEN -"totalHd"
             ELSE "totalHd"
           END
    FROM ledger_transactions
    WHERE "ledgerType" = $type
      AND "entityId" = $entityId
      AND "deletedAt" IS NULL
      AND date < (SELECT d FROM first_of_month)
  ) all_prior
  GROUP BY party_id
),

period AS (
  SELECT "partyId" AS party_id,
    -- lay_hang bucket: lay_hang full + dieu_chinh dương
    COALESCE(SUM(CASE
      WHEN "transactionType" = 'lay_hang' THEN "totalTt"
      WHEN "transactionType" = 'dieu_chinh' AND "totalTt" > 0 THEN "totalTt"
      ELSE 0 END), 0) AS lay_tt,
    -- same for HD
    COALESCE(SUM(CASE
      WHEN "transactionType" = 'lay_hang' THEN "totalHd"
      WHEN "transactionType" = 'dieu_chinh' AND "totalHd" > 0 THEN "totalHd"
      ELSE 0 END), 0) AS lay_hd,
    -- thanh_toan bucket: thanh_toan full + |dieu_chinh âm|
    COALESCE(SUM(CASE
      WHEN "transactionType" = 'thanh_toan' THEN "totalTt"
      WHEN "transactionType" = 'dieu_chinh' AND "totalTt" < 0 THEN -"totalTt"
      ELSE 0 END), 0) AS tra_tt,
    COALESCE(SUM(CASE
      WHEN "transactionType" = 'thanh_toan' THEN "totalHd"
      WHEN "transactionType" = 'dieu_chinh' AND "totalHd" < 0 THEN -"totalHd"
      ELSE 0 END), 0) AS tra_hd
  FROM ledger_transactions
  WHERE "ledgerType" = $type
    AND "entityId" = $entityId
    AND "deletedAt" IS NULL
    AND date >= (SELECT d FROM first_of_month)
    AND date <= (SELECT d FROM last_of_month)
  GROUP BY "partyId"
)

SELECT party_id,
       COALESCE(o.open_tt, 0) AS open_tt,
       COALESCE(o.open_hd, 0) AS open_hd,
       COALESCE(p.lay_tt, 0) AS lay_tt,
       COALESCE(p.lay_hd, 0) AS lay_hd,
       COALESCE(p.tra_tt, 0) AS tra_tt,
       COALESCE(p.tra_hd, 0) AS tra_hd
FROM opening o
FULL OUTER JOIN period p USING (party_id)
WHERE COALESCE(o.open_tt, 0) <> 0
   OR COALESCE(o.open_hd, 0) <> 0
   OR COALESCE(p.lay_tt, 0) <> 0
   OR COALESCE(p.lay_hd, 0) <> 0
   OR COALESCE(p.tra_tt, 0) <> 0
   OR COALESCE(p.tra_hd, 0) <> 0
ORDER BY party_id;
```

Map `closingTt = open_tt + lay_tt - tra_tt` ở JS (giữ Prisma.Decimal precision). `partyName` chưa resolve — phase 2 join.

## Related Code Files

- Modify: `lib/ledger/ledger-types.ts` (replace interface)
- Modify: `lib/ledger/ledger-aggregations.ts` (add queryMonthlyByParty, mark queryMonthlyReport for removal in phase 5)

## Implementation Steps

1. Edit `ledger-types.ts`: thêm `MonthlyByPartyRow` (giữ `MonthlyReportRow` tạm, xoá ở phase 5 sau khi Excel migrate xong)
2. Edit `ledger-aggregations.ts`: thêm `queryMonthlyByParty` với SQL trên, return `Omit<MonthlyByPartyRow, 'partyName'>[]` (partyName fill ở service)
3. `npx tsc --noEmit` để validate

## Success Criteria

- [ ] `MonthlyByPartyRow` defined
- [ ] `queryMonthlyByParty` compiles + return type matches
- [ ] No regression: `queryMonthlyReport` còn callable (chưa xoá)
- [ ] Typecheck passes

## Risk

- **Sign of `dieu_chinh` in real data**: confirmed raw-sign in research, nhưng phase 5 vẫn phải verify với psql data.
- **Opening balance composition**: opening row có thể chưa tồn tại cho mọi (entity, party) — query phải tolerate qua FULL OUTER JOIN + COALESCE.
