---
phase: 3
title: "Page wiring: month picker + auto-select entity"
status: pending
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: Page wiring

## Overview

Update 2 page (`cong-no-vt/bao-cao-thang` + `cong-no-nc/bao-cao-thang`) để pass `month` vào service và auto-select entity đầu tiên có giao dịch khi `entityId` chưa có trong URL.

## Requirements

- Filter UI: month + year picker (dùng `MonthYearPicker` đã có) + entity dropdown (required, không có "Tất cả")
- Default: tháng/năm hiện tại + entity đầu tiên có giao dịch ledger trong tháng đó (fallback: entity đầu tiên alphabet)
- Khi user đổi entity → URL update + refetch
- searchParams: `?month=5&year=2026&entityId=12`

## Architecture

### Auto-select entity logic

Service helper `lib/ledger/ledger-service.ts`:

```ts
async firstEntityWithActivity(year: number, month: number): Promise<number | null> {
  const r = await prisma.$queryRaw<{ entityId: number }[]>`
    SELECT "entityId" FROM ledger_transactions
    WHERE "ledgerType" = ${this.ledgerType}
      AND "deletedAt" IS NULL
      AND EXTRACT(YEAR FROM date) = ${year}
      AND EXTRACT(MONTH FROM date) = ${month}
    GROUP BY "entityId"
    ORDER BY MIN(date) ASC
    LIMIT 1
  `;
  if (r[0]) return r[0].entityId;
  // fallback: any entity from opening balances
  const ob = await prisma.ledgerOpeningBalance.findFirst({
    where: { ledgerType: this.ledgerType },
    orderBy: { entityId: 'asc' },
    select: { entityId: true },
  });
  return ob?.entityId ?? null;
}
```

### Page (vt example)

```tsx
// app/(app)/cong-no-vt/bao-cao-thang/page.tsx
interface Props {
  searchParams: Promise<{ year?: string; month?: string; entityId?: string }>;
}

export default async function BaoCaoThangPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;

  let entityId = params.entityId ? parseInt(params.entityId, 10) : NaN;
  if (!Number.isFinite(entityId) || entityId <= 0) {
    const fallback = await firstMaterialEntityWithActivity(year, month);
    if (fallback == null) {
      return <EmptyState ... />;
    }
    redirect(`/cong-no-vt/bao-cao-thang?year=${year}&month=${month}&entityId=${fallback}`);
  }

  const [rows, entities, currentEntity] = await Promise.all([
    getMaterialMonthlyReport(year, month, entityId),
    prisma.entity.findMany({ where: { deletedAt: null }, select: {id, name}, orderBy: {name:'asc'} }),
    prisma.entity.findUnique({ where: { id: entityId }, select: {id, name} }),
  ]);

  return (
    <div>
      <header>...title + ExcelExportButton + PrintButton...</header>
      <BaoCaoThangFilter year={year} month={month} entityId={entityId} entities={entities} />
      <MonthlyReport
        rows={serializeDecimals(rows)}
        entityName={currentEntity?.name ?? `#${entityId}`}
        year={year} month={month}
        partyLabel="NCC"
      />
    </div>
  );
}
```

NC page tương tự với `firstLaborEntityWithActivity`, `partyLabel="Đội thi công"`.

### Filter component

`bao-cao-thang-filter.tsx` (vt) + `-nc.tsx`: chuyển từ year-only sang `MonthYearPicker` + entity `<select>` required (no "Tất cả" option).

## Related Code Files

- Modify: `lib/ledger/ledger-service.ts` (add firstEntityWithActivity)
- Modify: `lib/cong-no-vt/material-ledger-service.ts` (export wrapper firstMaterialEntityWithActivity)
- Modify: `lib/cong-no-nc/labor-ledger-service.ts` (export wrapper firstLaborEntityWithActivity)
- Modify: `app/(app)/cong-no-vt/bao-cao-thang/page.tsx`
- Modify: `app/(app)/cong-no-nc/bao-cao-thang/page.tsx`
- Modify: `app/(app)/cong-no-vt/bao-cao-thang/bao-cao-thang-filter.tsx`
- Modify: `app/(app)/cong-no-nc/bao-cao-thang/bao-cao-thang-filter-nc.tsx`

## Implementation Steps

1. Add `firstEntityWithActivity` to `LedgerService`, expose wrapper in cong-no-vt + cong-no-nc service files
2. Refactor 2 page.tsx — handle month, redirect when entityId missing
3. Refactor 2 filter components — month/year picker + required entity dropdown
4. Pass `entityName`, `year`, `month`, `partyLabel` props to `MonthlyReport` (UI changes in phase 4)
5. Confirm `serializeDecimals` wraps `rows`

## Success Criteria

- [ ] Visit `/cong-no-vt/bao-cao-thang` (no params) → redirect to URL with month/year/entityId
- [ ] Visit with custom `?month=4&year=2026` → resolves entityId from data
- [ ] Empty state if no data anywhere
- [ ] Same for `/cong-no-nc/bao-cao-thang`
- [ ] Typecheck passes

## Risk

- **Redirect loop**: nếu fallback function trả entity nhưng entity không có data trong period → query trả [] nhưng vẫn render. OK — empty table acceptable.
- **Race**: URL redirect bằng next/navigation `redirect()` server-side, không có race.
