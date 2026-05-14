---
title: "Payment refactor — multi-category per round + auto-fill balances"
description: "Một đợt thanh toán chứa nhiều category, congNo/luyKe auto-fill snapshot từ balance-service, có nút refresh khi draft."
status: completed
priority: P2
effort: 8h
actualEffort: 8h
completedDate: 2026-05-14
branch: main
tags: [payment, refactor, schema-migration, balance-service]
created: 2026-05-14
blockedBy: [project:260514-1100-cong-no-detail-and-balance-service]
---

# Plan — Payment refactor (Sub-B)

## Context
- Brainstorm: `plans/reports/brainstorm-260514-payment-refactor-and-cong-no-detail.md`
- Depends on Sub-A: `lib/ledger/balance-service.ts` (`getOutstandingDebt`, `getCumulativePaid`, `getBalancesBulk`)
- **Sub-A formula update (2026-05-14)**: balance-service now uses SOP formula `Công nợ = opening + Σ lay_hang − Σ thanh_toan`. Function signatures UNCHANGED, but returned values differ from the earlier brainstorm:
  - `getOutstandingDebt` now INCLUDES `LedgerOpeningBalance.balanceTt`.
  - `dieu_chinh` rows are EXCLUDED from all calculations (DB has 0 such rows; SOP doesn't define this type).
  - Implication for Sub-B: `upsertItem` auto-fill produces `congNo` consistent with `/cong-no-vt/chi-tiet` "Nợ ∑" column and with `getMaterial/LaborCurrentBalance`. No Sub-B code change needed.
- Existing schema: `prisma/schema.prisma:561-605` (PaymentRound, PaymentRoundItem)
- Existing service: `lib/payment/payment-service.ts:1-356`
- Existing actions: `app/(app)/thanh-toan/actions.ts:1-62`
- UI: `app/(app)/thanh-toan/ke-hoach/round-list-client.tsx`, `ke-hoach/[id]/round-detail-client.tsx`, `tong-hop/tong-hop-client.tsx`

## Goal
- Một `PaymentRound` chứa items thuộc nhiều `category` khác nhau (vat_tu/nhan_cong/dich_vu/khac).
- `congNo` + `luyKe` auto-fill từ `balance-service` lúc create item (snapshot frozen), có thể refresh khi round status='draft'.
- Tong-hop pivot mở rộng: 4 category × 2 scope = 8 cột số liệu per supplier + totals.

## Phases

| # | File | Status | Effort | Description |
|---|------|--------|--------|-------------|
| 01 | [phase-01-schema-migration.md](phase-01-schema-migration.md) | completed | 1.5h | Drop `PaymentRound.category` + unique key; add `PaymentRoundItem.category` + `balancesRefreshedAt`; wipe data |
| 02 | [phase-02-service-rewrite.md](phase-02-service-rewrite.md) | completed | 2.5h | Service consume balance-service; remove category from CreateRoundInput; add `refreshItemBalances`; rewrite `aggregateMonth` pivot |
| 03 | [phase-03-server-actions.md](phase-03-server-actions.md) | completed | 0.5h | Add `refreshItemBalancesAction`; sync types in actions.ts |
| 04 | [phase-04-ui-refactor.md](phase-04-ui-refactor.md) | completed | 3.5h | Round list create dialog; round detail (category col + auto-fill + refresh btn + override toggle); tong-hop 8-col pivot |

## Dependencies
- Phase 01 → 02 (service needs new schema fields)
- Phase 02 → 03 (action needs new service exports)
- Phase 03 → 04 (UI binds new actions/shapes)
- Sub-A balance-service MUST be green before Phase 02

## Delivery Summary (2026-05-14)

**Status**: All 4 phases completed. TSC clean, `next build` green, no lint errors.

**3 Review Fixes Applied**:
1. **C1 Export Pivot**: Fixed `aggregateMonth` return shape — map category values correctly in AggregateRow
2. **M1 React Fragment Keys**: Added missing keys in round detail item table rows + tong-hop pivot cell render loop
3. **N1 Category Mutable in Draft**: Removed accidental freeze of category field; now editable for draft items when override enabled

**Deliverables**:
- Schema migration (raw SQL, wipe payload_rounds → add category/balancesRefreshedAt to PaymentRoundItem)
- Service rewrite (auto-fill congNo/luyKe from balance-service; refreshItemBalances; aggregateMonth with category dimension)
- Server actions (createRoundAction, upsertItemAction, refreshItemBalancesAction, refreshAllItemBalancesAction)
- UI 3-screen refactor (round list: drop category dialog; round detail: category col + override + refresh btn; tong-hop: 8-cell pivot)

**Testing**: Manual smoke test passed (create round → 2 items multi-category → approve → tong-hop displays 8 cells + totals correctly).

## Success Criteria
- 1 round chứa items đa category, mỗi item duyệt độc lập per existing flow
- Khi tạo item: chọn supplier + project → `congNo`, `luyKe` auto-fill khớp với báo cáo chi tiết (cong-no-vt|nc) cùng (party, project)
- Nút "Cập nhật số dư" trên round detail header (draft only) → re-pull tất cả items; cập nhật `balancesRefreshedAt`
- Admin có toggle "Override" để chỉnh tay `congNo`/`luyKe`
- Tong-hop hiển thị đúng 8 cột × supplier + totals; sum khớp với items approved/closed
- Compile sạch (`tsc --noEmit`), migration apply OK, không còn ref tới `PaymentRound.category`

## Risks
- Prisma 7 shadow-DB ordering bug khi drop column + drop unique cùng lúc → raw SQL migration script (see Phase 01)
- Sub-A trễ → Phase 02 unblock. Mitigation: stub balance-service interface để typecheck.
- Existing items sau wipe = 0, OK.

## Rollback
- Mỗi phase commit riêng. Phase 01 revert qua `prisma migrate resolve --rolled-back` + restore schema từ git.
- Phase 02-04 thuần code revert qua `git revert`.
