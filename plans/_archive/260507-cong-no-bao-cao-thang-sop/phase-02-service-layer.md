---
phase: 2
title: "Service layer: getXxxMonthlyReport(year, month, entityId)"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Service layer signature change + party name resolution

## Overview

Đổi signature `getMaterialMonthlyReport` và `getLaborMonthlyReport` thành `(year, month, entityId)` (entityId required). Resolve `partyName` từ `supplier.name` (VT) hoặc `contractor.name` (NC).

## Requirements

- `entityId` bắt buộc (page sẽ auto-select trước khi gọi)
- `partyName` join 1 round-trip, không N+1
- Sort: theo `partyName` ASC (theo SOP, NCC list theo tên)

## Architecture

### `lib/ledger/ledger-service.ts`

```ts
async monthlyByParty(year: number, month: number, entityId: number): Promise<Omit<MonthlyByPartyRow, 'partyName'>[]> {
  return queryMonthlyByParty(this.ledgerType, year, month, entityId);
}
```

### `lib/cong-no-vt/material-ledger-service.ts`

```ts
export async function getMaterialMonthlyReport(year: number, month: number, entityId: number): Promise<MonthlyByPartyRow[]> {
  const rows = await service.monthlyByParty(year, month, entityId);
  if (rows.length === 0) return [];
  const partyIds = rows.map(r => r.partyId);
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: partyIds }, deletedAt: null },
    select: { id: true, name: true },
  });
  const map = new Map(suppliers.map(s => [s.id, s.name]));
  return rows
    .map(r => ({ ...r, partyName: map.get(r.partyId) ?? `NCC #${r.partyId}` }))
    .sort((a, b) => a.partyName.localeCompare(b.partyName, 'vi'));
}
```

### `lib/cong-no-nc/labor-ledger-service.ts`

Giống trên nhưng dùng `prisma.contractor` và prefix `Đội #`.

## Related Code Files

- Modify: `lib/ledger/ledger-service.ts` (add monthlyByParty method, remove monthlyReport hoặc keep tới phase 5)
- Modify: `lib/cong-no-vt/material-ledger-service.ts` (replace getMaterialMonthlyReport)
- Modify: `lib/cong-no-nc/labor-ledger-service.ts` (replace getLaborMonthlyReport)

## Implementation Steps

1. Add `monthlyByParty` to `LedgerService` class
2. Update `getMaterialMonthlyReport` signature + implementation
3. Update `getLaborMonthlyReport` signature + implementation
4. **DO NOT delete old monthlyReport yet** — Excel template still uses it (phase 5)
5. `npx tsc --noEmit` — expect 4 errors (2 page + 2 export caller mismatches), document for phase 3/5

## Success Criteria

- [ ] Service exports new signature
- [ ] Party name resolved + sorted Vietnamese collation
- [ ] Old `getXxxMonthlyReport` references at consumer sites visible as TS errors (signaling phase 3 work)

## Risk

- Vietnamese sort: `localeCompare(b.partyName, 'vi')` — verify with names có dấu (Đại Cương, Đoàn Kết)
