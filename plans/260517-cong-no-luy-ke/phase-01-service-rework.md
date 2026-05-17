---
phase: 1
title: Service rework
status: completed
priority: P1
effort: 3h
dependencies: []
---

# Phase 1: Service rework

## Overview

Rebuild `getMaterialDetailReport` in `lib/cong-no-vt/balance-report-service.ts` as a pure
cumulative report producing 8 numeric fields per row (TT + HĐ), including `dieu_chinh`.

## Requirements

- Functional: report = cumulative version of báo cáo tháng. Per (Chủ thể × NCC × Công trình)
  row, 8 fields: `{openingTt, phatSinhTt, daTraTt, cuoiKyTt}` + `{openingHd, phatSinhHd, daTraHd, cuoiKyHd}`.
- Functional: `dieu_chinh` included — positive `totalTt`→phát sinh, negative→đã trả (`-totalTt`);
  same independently for `totalHd`. Mirrors `queryMonthlyByParty` `period` CTE exactly.
- Functional: `year/month` = cutoff. All sums filtered `date < periodEndExclusive`. When absent,
  no upper bound (sentinel max date, as today).
- Functional: Đầu kỳ = `balanceTt`/`balanceHd` from `ledger_opening_balances` only.
- Non-functional: single `$queryRaw`, FULL OUTER JOIN ob/tx — keep current shape.

## Architecture

`DetailReportFilters`: drop `view`. Keep `ledgerType, year, month, entityIds, projectIds, showZero`.

`DetailRow` (and `SubtotalRow`) numeric fields become the 8 above (strings, Decimal→`toFixed(0)`).
Drop `ViewMode` type, `phatSinhT/daTraT/noCuoiT/phatSinhCum/daTraCum/noCum`.

SQL `tx` CTE — replace the 6 TT-only FILTER aggregates with 4 cumulative-to-cutoff aggregates
× 2 (TT, HĐ). Each uses a `CASE` so `dieu_chinh` is sign-split:

```
phat_sinh_tt = SUM(CASE
  WHEN transactionType='lay_hang' THEN totalTt
  WHEN transactionType='dieu_chinh' AND totalTt > 0 THEN totalTt
  ELSE 0 END) FILTER (WHERE date < periodEndExclusive)
da_tra_tt = SUM(CASE
  WHEN transactionType='thanh_toan' THEN totalTt
  WHEN transactionType='dieu_chinh' AND totalTt < 0 THEN -totalTt
  ELSE 0 END) FILTER (WHERE date < periodEndExclusive)
```

Repeat for `phat_sinh_hd`/`da_tra_hd` with `totalHd`. `ob` CTE adds `balanceHd`.

TS compute: `cuoiKyTt = openingTt + phatSinhTt − daTraTt` (likewise HĐ). Zero-filter: row is
zero when all 8 fields are "0".

## Related Code Files

- Modify: `lib/cong-no-vt/balance-report-service.ts` (types, SQL, compute, subtotals)
- Modify: `lib/cong-no-nc/balance-report-service.ts` (drop `view` from `LaborDetailReportFilters`,
  re-export updated types)

## Implementation Steps

1. Update `DetailReportFilters` — remove `view`; remove `ViewMode` export.
2. Rewrite `DetailRow` / `SubtotalRow` numeric fields to the 8 TT/HĐ fields.
3. Rewrite `RawRow` interface + `ob`/`tx` CTEs: add `balanceHd`, replace aggregates with the
   4 cumulative sign-split sums × 2.
4. Rewrite the per-row compute loop: build 8 strings, `cuoiKy = opening + phatSinh − daTra`.
5. Update zero-filter to check all 8 fields.
6. Update `zeroSubtotalNumerics`/`accumulateRow`/`computeSubtotals` to the 8 fields.
7. Update `lib/cong-no-nc/balance-report-service.ts`: drop `view` from `LaborDetailReportFilters`.
8. Run `npx tsc --noEmit` — fix call-site type errors (P2/P3 will catch the rest).

## Success Criteria

- [ ] `getMaterialDetailReport` returns 8-field rows; no `view` param.
- [ ] `dieu_chinh` rows alter phát sinh/đã trả per sign.
- [ ] A (entity,party,project) triple's cumulative numbers equal báo cáo tháng's cumulative
      sum for the same cutoff month.
- [ ] `tsc --noEmit` passes for the two service files.

## Risk Assessment

- Header comment "dieu_chinh EXCLUDED per plan.md closed decisions" is now reversed — update it
  and the file-top doc comment to avoid misleading future readers.
- `dieu_chinh` sign convention must match `queryMonthlyByParty` byte-for-byte or báo cáo tháng
  and lũy kế will still diverge — copy the CASE expressions verbatim.
