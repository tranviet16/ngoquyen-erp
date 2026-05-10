---
phase: 3
title: "Migrate Cong No NC (Nhân công)"
status: pending
priority: P2
effort: "1-1.5d"
dependencies: [1]
---

# Phase 3: Migrate Cong No NC

## Overview

Mirror Phase 2 cho module Nhân công: `cong-no-nc/nhap-lieu` + `cong-no-nc/so-du-ban-dau`. Logic tương đương, chỉ đổi `supplier` → `contractor` và service module.

## Requirements

**Functional:** Như Phase 2, áp cho contractor (đội thi công) thay vì supplier.
**Non-functional:** Không đổi `lib/cong-no-nc/labor-ledger-service.ts` interface.

## Architecture

```
app/(app)/cong-no-nc/nhap-lieu/page.tsx
  └─ <CongNoNcNhapLieuGrid>
       └─ <DataGrid<LaborTransactionRow>>
            └─ handlers → labor-ledger-service actions

app/(app)/cong-no-nc/so-du-ban-dau/page.tsx
  └─ <CongNoNcOpeningGrid>
       └─ <DataGrid<LaborOpeningBalanceRow>>
```

## Related Code Files

**Create:**
- `components/cong-no-nc/nhap-lieu-grid.tsx`
- `components/cong-no-nc/opening-grid.tsx`

**Modify:**
- `app/(app)/cong-no-nc/nhap-lieu/page.tsx`
- `app/(app)/cong-no-nc/so-du-ban-dau/page.tsx`
- `lib/cong-no-nc/labor-ledger-service.ts` — thêm `bulkUpsertLaborTransactions`

**Delete (Phase 6):**
- `components/ledger/transaction-grid.tsx` (nếu cả VT và NC đã migrate)
- `components/ledger/opening-balance-client.tsx`
- Re-export shim files nếu có

## Implementation Steps

1. Copy structure từ Phase 2 `nhap-lieu-grid.tsx`, đổi:
   - `TransactionRow` → `LaborTransactionRow`
   - `supplier` → `contractor`
   - import service `lib/cong-no-nc/labor-ledger-service`
2. Map columns — labor có thể có cột khác (ngày công, định mức?) → kiểm tra schema Prisma
3. Thêm `bulkUpsertLaborTransactions` vào service
4. Lặp cho `so-du-ban-dau`
5. Compile + manual test trên dev server

## Success Criteria

- [ ] `/cong-no-nc/nhap-lieu` render `<DataGrid>`, edit/add/delete/paste hoạt động
- [ ] `/cong-no-nc/so-du-ban-dau` render `<DataGrid>`, hoạt động
- [ ] Báo cáo `/cong-no-nc` summary cập nhật đúng sau khi sửa data
- [ ] Không regression ở reports/chi-tiet đội

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Schema NC có field khác VT (e.g. `manDays`) | Đọc `prisma/schema.prisma` trước khi map columns |
| Service NC dùng pattern khác VT | Refactor sang cùng signature trong Phase này (nhưng giữ behavior) |

## Dependencies

Blocked by Phase 1. Có thể chạy song song với Phase 2.
