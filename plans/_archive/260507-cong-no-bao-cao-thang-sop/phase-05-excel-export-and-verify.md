---
phase: 5
title: "Excel export refactor + smoke verify with real data"
status: pending
priority: P2
effort: "1.5h"
dependencies: [4]
---

# Phase 5: Excel export + verification

## Overview

Refactor `lib/export/templates/cong-no-monthly.ts` đồng bộ shape SOP. Verify với psql data thực tế. Cleanup `MonthlyReportRow` cũ + `queryMonthlyReport` cũ.

## Requirements

- Excel output 1 sheet, layout khớp SOP (10 cột + dòng tổng), title row chứa "Tháng X/YYYY — Chủ thể: ZZZ"
- Sign convention `dieu_chinh` verified với data thực qua psql
- Old `MonthlyReportRow` + `queryMonthlyReport` removed
- Filename: `bao-cao-thang-{vt|nc}-{entityIdSlug}-{MM}-{YYYY}.xlsx`

## Architecture

### Excel template — `lib/export/templates/cong-no-monthly.ts`

```ts
import { queryMonthlyByParty } from "@/lib/ledger/ledger-aggregations";
import { prisma } from "@/lib/prisma";

const COLUMNS: SheetColumn[] = [
  { header: "STT", key: "stt", width: 6 },
  { header: "Danh Mục", key: "partyName", width: 30 },
  { header: "Phải Trả Đầu Kỳ (TT)", key: "openingTt", width: 20, numFmt: "#,##0" },
  { header: "PS Phải Trả (TT)", key: "layHangTt", width: 20, numFmt: "#,##0" },
  { header: "PS Đã Trả (TT)", key: "thanhToanTt", width: 20, numFmt: "#,##0" },
  { header: "Phải Trả Cuối Kỳ (TT)", key: "closingTt", width: 20, numFmt: "#,##0" },
  { header: "Phải Trả Đầu Kỳ (HĐ)", key: "openingHd", width: 20, numFmt: "#,##0" },
  { header: "PS Phải Trả (HĐ)", key: "layHangHd", width: 20, numFmt: "#,##0" },
  { header: "PS Đã Trả (HĐ)", key: "thanhToanHd", width: 20, numFmt: "#,##0" },
  { header: "Phải Trả Cuối Kỳ (HĐ)", key: "closingHd", width: 20, numFmt: "#,##0" },
];

export async function buildCongNoMonthlyExcel(
  ledgerType: LedgerType,
  year: number,
  month: number,
  entityId: number
): Promise<Buffer> {
  const rawRows = await queryMonthlyByParty(ledgerType, year, month, entityId);
  // Resolve party names
  const partyIds = rawRows.map(r => r.partyId);
  const parties = ledgerType === 'material'
    ? await prisma.supplier.findMany({ where: { id: { in: partyIds }, deletedAt: null }, select: { id: true, name: true } })
    : await prisma.contractor.findMany({ where: { id: { in: partyIds }, deletedAt: null }, select: { id: true, name: true } });
  const partyMap = new Map(parties.map(p => [p.id, p.name]));
  const entity = await prisma.entity.findUnique({ where: { id: entityId }, select: { name: true } });

  const rows = rawRows
    .map(r => ({ ...r, partyName: partyMap.get(r.partyId) ?? `#${r.partyId}` }))
    .sort((a, b) => a.partyName.localeCompare(b.partyName, 'vi'));

  const dataRows = rows.map((r, i) => ({
    stt: i + 1,
    partyName: r.partyName,
    openingTt: r.openingTt.toNumber(),
    layHangTt: r.layHangTt.toNumber(),
    thanhToanTt: r.thanhToanTt.toNumber(),
    closingTt: r.closingTt.toNumber(),
    openingHd: r.openingHd.toNumber(),
    layHangHd: r.layHangHd.toNumber(),
    thanhToanHd: r.thanhToanHd.toNumber(),
    closingHd: r.closingHd.toNumber(),
  }));

  // Append total row
  const total = dataRows.reduce((acc, r) => ({
    stt: '', partyName: 'TỔNG',
    openingTt: acc.openingTt + r.openingTt,
    layHangTt: acc.layHangTt + r.layHangTt,
    thanhToanTt: acc.thanhToanTt + r.thanhToanTt,
    closingTt: acc.closingTt + r.closingTt,
    openingHd: acc.openingHd + r.openingHd,
    layHangHd: acc.layHangHd + r.layHangHd,
    thanhToanHd: acc.thanhToanHd + r.thanhToanHd,
    closingHd: acc.closingHd + r.closingHd,
  }), { stt: '', partyName: 'TỔNG', openingTt:0, layHangTt:0, thanhToanTt:0, closingTt:0, openingHd:0, layHangHd:0, thanhToanHd:0, closingHd:0 });

  const wb = createWorkbook();
  const label = ledgerType === "material" ? "Vật tư" : "Nhân công";
  addSheet(wb, "Báo cáo tháng", COLUMNS, [...dataRows, total], {
    title: `Báo cáo tháng Công nợ ${label} — Tháng ${month}/${year} — Chủ thể: ${entity?.name ?? `#${entityId}`}`,
  });
  return workbookToBuffer(wb);
}
```

### Export route — `app/api/export/excel/route.ts`

Update params validation cho template `cong-no-monthly`: thêm `month` + `entityId` required.

### Pages — pass month/entityId vào ExcelExportButton

```tsx
<ExcelExportButton
  template="cong-no-monthly"
  params={{ ledgerType: "material", year, month, entityId }}
  filename={`cong-no-vt-thang-${month}-${year}.xlsx`}
  ...
/>
```

### Verification — psql smoke

```bash
psql -d $DB -c "
  SELECT \"transactionType\", COUNT(*),
         SUM(CASE WHEN \"totalTt\" > 0 THEN 1 ELSE 0 END) AS pos,
         SUM(CASE WHEN \"totalTt\" < 0 THEN 1 ELSE 0 END) AS neg
  FROM ledger_transactions
  WHERE \"deletedAt\" IS NULL AND \"transactionType\" = 'dieu_chinh'
  GROUP BY \"transactionType\";
"
```

Expect: nếu có rows neg → confirm sign convention dùng đúng (negative = giảm phải trả).

Pick 1 (entity, party, month) có data → manual verify:
- Get opening balance from `ledger_opening_balances`
- Sum prior tx
- Sum period tx by bucket
- Compute closing
- Compare với UI/Excel output

### Cleanup

- Remove `MonthlyReportRow` from `ledger-types.ts`
- Remove `queryMonthlyReport` from `ledger-aggregations.ts`
- Remove `monthlyReport` method from `LedgerService`

## Related Code Files

- Modify: `lib/export/templates/cong-no-monthly.ts` (full rewrite)
- Modify: `app/api/export/excel/route.ts` (params validation)
- Modify: 2 page files (pass month/entityId to ExcelExportButton)
- Modify: `lib/ledger/ledger-types.ts` (remove old)
- Modify: `lib/ledger/ledger-aggregations.ts` (remove old query)
- Modify: `lib/ledger/ledger-service.ts` (remove old method)

## Implementation Steps

1. Refactor `cong-no-monthly.ts` template
2. Update `/api/export/excel/route.ts` to accept + validate `month`, `entityId`
3. Update 2 ExcelExportButton callers
4. Run psql sign-convention check
5. Manual end-to-end verify: pick 1 (entity, party, period) with known opening + tx, recompute by hand, compare UI/Excel
6. Delete old `MonthlyReportRow`, `queryMonthlyReport`, `LedgerService.monthlyReport`
7. `npx tsc --noEmit`
8. UI sanity: open both pages, change month/entity, download Excel

## Success Criteria

- [ ] Excel output mở được, đúng layout SOP
- [ ] Filename khớp pattern
- [ ] psql verification pass — không có data inconsistency với sign convention
- [ ] Manual recompute match UI ± 0
- [ ] Old types/queries fully removed (grep `MonthlyReportRow` returns 0 matches)
- [ ] Typecheck clean
- [ ] Both pages render with no console errors

## Risk

- **psql discovers `dieu_chinh` data with unexpected signs** → adjust SQL CASE in Phase 1 query, redo phases 4/5
- **Real customer data with no opening balance for some parties** → query already handles (FULL OUTER JOIN COALESCE 0)
- **Excel export route caching old params shape** → clear `.next/` and restart dev
