---
title: "Refactor Kế hoạch thanh toán: projectScope → entityId cascade"
description: "Drop projectScope enum, add entityId FK, implement Chủ thể→Công trình→NCC cascade chain across service, UI, aggregate pivot, Excel export."
status: completed
priority: P2
effort: 11h
actualEffort: 11h
completedDate: 2026-05-15
branch: main
tags: [refactor, payment, entity, cascade, schema-migration]
created: 2026-05-15
blockedBy: [project:260514-1200-payment-refactor-multi-category]
---

# Refactor Kế hoạch thanh toán — Entity Cascade

## Mục tiêu
Thay `PaymentRoundItem.projectScope` (enum `cty_ql|giao_khoan`) bằng `PaymentRoundItem.entityId` (FK `Entity`). Triển khai cascade chain **Chủ thể → Công trình → NCC** trong UI lập đợt; pivot Tổng hợp đổi từ 4×2 fixed sang 4×N entity dynamic; Excel export đồng bộ.

## Decisions (đã chốt với user)
1. **Wipe** `payment_round_items` + `payment_rounds` — không giữ legacy column.
2. NCC dropdown sau khi chọn entity+project: `DISTINCT supplier FROM ledger_transactions WHERE entityId=X AND projectId=Y AND ledgerType=<map(category)>`. Map: `vat_tu→material`, `nhan_cong→labor`, `dich_vu|khac→fallback all`.
3. Tong-hop pivot: 4 category × N entity per supplier (N = số entity active có rows trong tháng). Layout giãn theo entity. Excel mirror.
4. Mode: `/ck:plan --deep`.
5. **nhan_cong NCC source (2026-05-15)** — Giữ Supplier model; dropdown empty by design for labor (ledger labor dùng Contractor, payment chỉ link Supplier). P3 short-circuit return `[]` + header `X-Empty-Reason: labor-uses-contractor`. P5 hiển thị 2-line helper text. Contractor support → out of scope, plan riêng.
6. **Empty-state UX (2026-05-15)** — Helper text + admin-only `bypassCascade` checkbox (gated `{isAdmin && ...}`, mirror Override pattern). Bật → bỏ qua cascade fetch, dùng full suppliers prop. Không persist server-side. Non-admins phải đổi Chủ thể/Công trình.

## Phases

| # | File | Effort | Blocks | Status |
|---|------|--------|--------|--------|
| 1 | [phase-01-schema-migration.md](./phase-01-schema-migration.md) | 1.5h | P2..P7 | ✓ completed |
| 2 | [phase-02-service-rewrite.md](./phase-02-service-rewrite.md) | 2h | P3..P7 | ✓ completed |
| 3 | [phase-03-cascade-suppliers-endpoint.md](./phase-03-cascade-suppliers-endpoint.md) | 1h | P5 | ✓ completed |
| 4 | [phase-04-server-actions-sync.md](./phase-04-server-actions-sync.md) | 0.5h | P5 | ✓ completed |
| 5 | [phase-05-ui-refactor-round-detail.md](./phase-05-ui-refactor-round-detail.md) | 3h | P7 | ✓ completed |
| 6 | [phase-06-tong-hop-pivot-4xN.md](./phase-06-tong-hop-pivot-4xN.md) | 2.5h | P7 | ✓ completed |
| 7 | [phase-07-verification-smoke.md](./phase-07-verification-smoke.md) | 0.5h | — | ✓ completed |

## Key dependencies
- Sub-B `260514-1200-payment-refactor-multi-category` đã DONE → schema có `category` per-item, balancesRefreshedAt, refresh action.
- `lib/ledger/balance-service.ts:218` `getOutstandingDebt({ ledgerType, entityId?, partyId, projectId? })` — sẵn sàng nhận `entityId`.
- `app/api/cong-no/cascade-projects/route.ts:1-96` reference cho cascade-suppliers endpoint.
- Prisma 7.8 shadow-DB bug → manual SQL migration + `migrate deploy` (đã apply ở Sub-B P1).

## Bug fix piggyback
`lib/payment/payment-service.ts:161` `autoFillBalances` hiện KHÔNG truyền `entityId` xuống balance-service → outstanding lookup sai (cross-entity bleed). Phase 02 fix luôn.

## Risk overview
| Risk | Likelihood | Impact | Mitigation phase |
|------|------------|--------|------------------|
| Shadow-DB migration fail | High | High | P1: raw SQL + migrate deploy |
| Cross-entity balance bleed (current bug) | Confirmed | High | P2: truyền entityId vào autoFillBalances |
| Cascade race (entity-change while supplier dropdown fetching) | Med | Med | P5: AbortController per fetch |
| Excel layout drift vs UI | Med | Low | P6: shared layout constants (`buildEntityCols()`) |
| Suppliers filter trống (no ledger txn) → UX dead-end | Med | Med | P5: helper text + admin-only `bypassCascade` toggle (fallback full suppliers). nhan_cong always empty by design — same UX. |

## File ownership (no overlap)
- P1: `prisma/schema.prisma`, `prisma/migrations/*`
- P2: `lib/payment/payment-service.ts`
- P3: `app/api/thanh-toan/cascade-suppliers/route.ts` (new)
- P4: `app/(app)/thanh-toan/actions.ts`
- P5: `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx`, `app/(app)/thanh-toan/ke-hoach/[id]/page.tsx`
- P6: `app/(app)/thanh-toan/tong-hop/tong-hop-client.tsx`, `app/(app)/thanh-toan/tong-hop/page.tsx`, `app/api/thanh-toan/tong-hop/export/route.ts`
- P7: cross-cutting verification only

## Delivery Summary (2026-05-15)

**Status**: All 7 phases completed. TSC clean, `next build` green, no lint errors. Merged to main.

**Code-Review Fixes Applied**:
1. **C1 Code Field**: Fixed code field reference in payment-service.ts
2. **C2 Widened ACL**: Widened access control checks for payment operations  
3. **M1 Unmount Cleanup**: Fixed React unmount issues in round-detail-client.tsx
4. **M3 Skip Cascade for "all"**: Skip cascade fetch for dich_vu/khac (ledgerType='all') — endpoint returns full suppliers list fallback
5. **N6/M10 Placeholder Removed**: Removed stale placeholder logic from UI components
6. **M8 Export Early Return**: Added early return check in export route for empty data guard

**Deliverables**:
- Schema migration (drop projectScope column; add entityId INT NOT NULL FK to entities; index on (roundId, entityId))
- Service rewrite (autoFillBalances threads entityId; aggregateMonth pivots by entityId+entityName; getRound includes entity relation; fixed cross-entity bleed bug by passing entityId to balance-service)
- Cascade API endpoint (GET /api/thanh-toan/cascade-suppliers returns distinct suppliers by entityId+projectId+ledgerType; labor category short-circuits to empty array with X-Empty-Reason header; dich_vu/khac falls back to all suppliers)
- Round-detail UI 3-phase cascade (category → entity → project → supplier); admin-only "Bỏ cascade" bypass toggle; 2-line empty-state helper text for labor category
- Tong-hop pivot rewrite (4 category × N entity dynamic layout; derives entity list from data; Excel export mirrors with dynamic merges + column widths)

**Testing**: Manual smoke passed (create round → pick entity cascade → suppliers populate for selected entity/project → item saves with correct congNo from that entity's ledger; tong-hop renders correct entity columns; Excel exports cleanly with correct merges).

**Deferred Follow-up**: C3 (server-side cascade integrity validation on save) marked as future enhancement — current model relies on FK + existing actor checks.

## Success criteria
- `\d payment_round_items` không còn `projectScope`; có `entityId INT NOT NULL` + FK + index `(roundId, entityId)`.
- Tạo round → chọn category → entity dropdown → project filter theo entity → supplier filter theo (entity, project, ledgerType) → save → congNo/luyKe auto-fill ĐÚNG entity.
- Tong-hop tháng X render 4×N entity cells; Excel export mở Excel không lỗi, merges đúng.
- `pnpm tsc --noEmit` + `pnpm next build` PASS.
