---
phase: 1
title: "Backend — query breakdown + filter NCC"
status: pending
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 1: Backend — query breakdown + filter NCC

## Overview
Mở rộng `queryDebtMatrix` trả về 4 nhóm số (đầu kỳ / lấy hàng / trả tiền / cuối kỳ) × (TT, HĐ) cho mỗi cell `(entity, party)`. Thêm filter `partyIds` để giới hạn theo NCC.

## Requirements
- **Functional:**
  - Trả về cell với 8 metric: `openTt, openHd, layTt, layHd, traTt, traHd, closeTt, closeHd`.
  - `closeTt = openTt + layTt - traTt`, `closeHd = openHd + layHd - traHd` (tính ở SQL hoặc JS đều OK; làm SQL cho consistency).
  - Filter optional: `partyIds?: number[]` — empty/undefined = all.
- **Non-functional:**
  - Decimal converted to `number` ở server before crossing RSC boundary (giống precedent).
  - Một query duy nhất (không N+1).

## Architecture

### Query SQL mới
```sql
WITH ob AS (
  SELECT "entityId", "partyId",
    SUM("balanceTt") AS open_tt,
    SUM("balanceHd") AS open_hd
  FROM ledger_opening_balances
  WHERE "ledgerType" = $1
    AND ($2::int[] IS NULL OR "partyId" = ANY($2))
  GROUP BY "entityId", "partyId"
),
tx AS (
  SELECT "entityId", "partyId",
    COALESCE(SUM("totalTt") FILTER (WHERE "transactionType" = 'lay_hang'), 0) AS lay_tt,
    COALESCE(SUM("totalHd") FILTER (WHERE "transactionType" = 'lay_hang'), 0) AS lay_hd,
    COALESCE(SUM("totalTt") FILTER (WHERE "transactionType" = 'thanh_toan'), 0) AS tra_tt,
    COALESCE(SUM("totalHd") FILTER (WHERE "transactionType" = 'thanh_toan'), 0) AS tra_hd
  FROM ledger_transactions
  WHERE "ledgerType" = $1
    AND "deletedAt" IS NULL
    AND ($2::int[] IS NULL OR "partyId" = ANY($2))
  GROUP BY "entityId", "partyId"
)
SELECT
  COALESCE(ob."entityId", tx."entityId") AS entity_id,
  COALESCE(ob."partyId", tx."partyId") AS party_id,
  COALESCE(ob.open_tt, 0) AS open_tt,
  COALESCE(ob.open_hd, 0) AS open_hd,
  COALESCE(tx.lay_tt, 0) AS lay_tt,
  COALESCE(tx.lay_hd, 0) AS lay_hd,
  COALESCE(tx.tra_tt, 0) AS tra_tt,
  COALESCE(tx.tra_hd, 0) AS tra_hd,
  COALESCE(ob.open_tt, 0) + COALESCE(tx.lay_tt, 0) - COALESCE(tx.tra_tt, 0) AS close_tt,
  COALESCE(ob.open_hd, 0) + COALESCE(tx.lay_hd, 0) - COALESCE(tx.tra_hd, 0) AS close_hd
FROM ob FULL OUTER JOIN tx
  ON ob."entityId" = tx."entityId" AND ob."partyId" = tx."partyId"
ORDER BY party_id, entity_id;
```

> **Lưu ý dieu_chinh**: User confirm material ledger không có. Nếu đột nhiên xuất hiện, sẽ KHÔNG được tính vào lay/tra/close — silent drop. Acceptable vì current data toàn lay_hang/thanh_toan, và validation khi nhập tay enforces 3 types. Nếu sau này cần, thêm logic +/- theo dấu.

### Type changes
```ts
// lib/ledger/ledger-aggregations.ts
export interface MatrixCell {
  openTt: number; openHd: number;
  layTt: number; layHd: number;
  traTt: number; traHd: number;
  closeTt: number; closeHd: number;
}

export interface MatrixRow {
  partyId: number;
  partyName: string;
  cells: Record<string, MatrixCell>; // key = String(entityId)
  // Per-row totals across all entities
  totals: MatrixCell;
}
```
Convert `Prisma.Decimal` → `Number(...)` ngay trong loop aggregation (không để Decimal lọt qua boundary).

## Related Code Files
- Modify: `lib/ledger/ledger-aggregations.ts` (queryDebtMatrix → SQL mới + grouping mới + types)
- Modify: `lib/ledger/ledger-service.ts` (signature `detailedDebtMatrix(filter: { entityIds?: number[]; partyIds?: number[] })`)
- Modify: `lib/cong-no-vt/material-ledger-service.ts` (forward `partyIds` filter)
- Modify: `lib/cong-no-nc/labor-ledger-service.ts` nếu có (kiểm tra trong phase 3)

## Implementation Steps
1. Thay SQL trong `queryDebtMatrix` bằng version mới (4 nhóm × 2 = 8 metric).
2. Đổi `MatrixRawRow` interface: thêm `open_tt, open_hd, lay_tt, lay_hd, tra_tt, tra_hd, close_tt, close_hd` (số → numeric → JS number qua `Number(...)`).
3. Đổi `MatrixCell` + `MatrixRow` interface (export `MatrixCell`).
4. Aggregation loop: cộng dồn 8 metric vào `row.totals` (thay 2 metric như trước).
5. Thêm tham số `partyIds?: number[]` — pass tới `$queryRaw` qua `Prisma.sql` hoặc `ANY()` array literal. Nếu empty/undefined → bỏ điều kiện.
6. Update signature `LedgerService.detailedDebtMatrix` + caller.
7. `material-ledger-service.ts`: server action `getMaterialDebtMatrix(filter?: { partyIds?: number[] })` forward.
8. Compile-check: `npx tsc --noEmit -p .`

## Success Criteria
- [ ] `queryDebtMatrix("material", { partyIds: [N] })` trả về chỉ hàng cho NCC N.
- [ ] Mỗi cell có đủ 8 metric, tất cả là `number` (không phải Decimal).
- [ ] `closeTt === openTt + layTt - traTt` (verify với 1 sample).
- [ ] Bỏ filter (`{}`) → behavior giống cũ về scope dữ liệu.
- [ ] tsc pass.

## Risk Assessment
- **Risk**: `Prisma.sql` template cho array param có cú pháp Prisma 7 thay đổi.
  **Mitigation**: Test ngay với `partyIds: [1]` trước khi viết generic. Nếu khó dùng `ANY($2)`, dùng `IN (${Prisma.join(partyIds)})` qua `Prisma.sql` template.
- **Risk**: Decimal precision khi `+`/`-` ở SQL (numeric → JS number truncation cho VND lớn).
  **Mitigation**: VND không có decimal phần lẻ; max ~10^12 vẫn an toàn trong JS number (53-bit precision = ~9×10^15). OK.
