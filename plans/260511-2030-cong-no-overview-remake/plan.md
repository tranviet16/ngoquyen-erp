---
title: Cong-no overview remake (VT + NC)
description: >-
  Remake 2 trang tổng quan `/cong-no-vt` và `/cong-no-nc` thành operational
  landing (KPI + Top 5 NCC/đội nợ nhiều nhất) + DRY shared shell.
status: completed
priority: P2
created: 2026-05-11T00:00:00.000Z
---

# Cong-no overview remake (VT + NC)

## Overview
2 trang tổng quan đang duplicate ~95% code, hiển thị bảng raw 10 cột (đã có ở sub-page chi-tiet), không có insight/drill-down. Remake thành **operational landing**: 2 KPI tổng + Top 5 NCC/đội nợ nhiều nhất, click drill-down sang chi-tiet. DRY bằng shared shell `components/ledger/ledger-overview-shell.tsx` + 2 thin wrapper.

**Context:** [brainstorm-summary.md](./reports/brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Implementation](./phase-01-implementation.md) | Completed |

## Dependencies
None.

## Pre-flight findings

### `service.summary()` — cumulative balance, no period
✅ `MaterialLedgerService.getMaterialSummary` và `LaborLedgerService.getLaborSummary` wrap `LedgerService.summary({entityId?, partyId?, projectId?})` trả `SummaryRow[]` với `balanceTt/balanceHd` tích lũy (không filter period). Dùng trực tiếp cho Top 5 — aggregate JS phía page (<100 rows party).
→ **KHÔNG cần API mới**.

### Drill-down `?partyId=` graceful
⚠️ `app/(app)/cong-no-vt/chi-tiet/page.tsx` và `cong-no-nc/chi-tiet/page.tsx` chỉ parse `searchParams = { entity?: string }`. Link `${basePath}/chi-tiet?partyId=X` vẫn navigate được (param dư bị ignore), hiển thị full list.
→ MVP chấp nhận. Nâng cấp `chi-tiet` parse partyId là follow-up.

### `EmptyState` component
✅ `components/ui/empty-state.tsx` — `{icon?: LucideIcon, title?, description?, action?, compact?}`. Dùng cho Top 5 rỗng.

### Suppliers / Contractors source
✅ 2 trang hiện tại đã query `prisma.supplier.findMany()` / `prisma.contractor.findMany()` để build name map. Tiếp tục pattern này ở thin wrapper, pass `Map<number, string>` vào shell.
