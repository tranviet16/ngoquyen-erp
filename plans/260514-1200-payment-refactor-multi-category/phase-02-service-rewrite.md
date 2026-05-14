# Phase 02 — Service rewrite

## Context Links
- Service hiện tại: `lib/payment/payment-service.ts:1-356`
- Sub-A balance-service: `lib/ledger/balance-service.ts` (export `getOutstandingDebt`, `getCumulativePaid`, `getBalancesBulk`)
  - Formula: `outstanding = opening + Σ lay_hang − Σ thanh_toan`. `dieu_chinh` EXCLUDED. Opening INCLUDED.
  - `paid = Σ thanh_toan (lifetime)` — opening not included on paid side.
  - Signatures unchanged from earlier draft; values now align with SOP.
- Schema sau Phase 01

## Overview
- Priority: P2
- Status: completed
- Effort: 2.5h (actual 2.5h)
- Blocked by: Phase 01 + Sub-A green

## Description
Rewrite `payment-service.ts`:
- `CreateRoundInput` bỏ `category`
- `UpsertItemInput` thêm `category`; create path auto-fill `congNo`+`luyKe` từ balance-service (snapshot frozen)
- New `refreshItemBalances(itemId)` (draft only)
- `aggregateMonth` đổi shape: thêm dimension `category`

## Requirements
**Functional**
- `createRound({month, note?})` → `sequence = lastSeq(month) + 1` (không filter category)
- `upsertItem`:
  - Create: nếu caller không truyền `congNo`/`luyKe` (hoặc truyền `null`), gọi balance-service → snapshot
  - Create: `category` BẮT BUỘC
  - Update: KHÔNG re-pull balance (snapshot frozen); chỉ update các field người dùng đổi
- `refreshItemBalances(itemId)`:
  - Validate round.status='draft'
  - Validate actor là creator hoặc admin
  - Re-pull `getOutstandingDebt(supplierId, projectId)` + `getCumulativePaid(supplierId, projectId)`
  - Set `balancesRefreshedAt = now()`
- `aggregateMonth(month)` trả về rows có thêm `category` (4 × 2 × supplier)

**Non-functional**
- Caller có thể truyền `overrideCongNo`/`overrideLuyKe` để admin override (KHÔNG gọi balance-service)
- KHÔNG N+1 trong refresh batch — nếu mở rộng cho whole-round refresh, dùng `getBalancesBulk`

## Architecture

**Types update**
```
CreateRoundInput { month, note? }              // category removed
UpsertItemInput {
  id?, roundId, supplierId, projectScope, projectId,
  category,                                    // NEW required
  congNo?: number | null,                      // optional — null/undefined → auto-fill on create
  luyKe?: number | null,                       // same
  soDeNghi, note?,
  override?: boolean                           // admin-only: skip auto-fill, accept raw values
}
AggregateRow { supplierId, supplierName, category, projectScope, soDeNghi, soDuyet }
```

**Auto-fill flow (create path)**
1. Nếu `input.override === true`: require admin role → use raw input.congNo/luyKe
2. Else if `input.congNo` undefined hoặc null:
   - `outstanding = await getOutstandingDebt(supplierId, projectId)`
   - `cumPaid    = await getCumulativePaid(supplierId, projectId)`
   - `congNo = outstanding; luyKe = cumPaid; balancesRefreshedAt = now()`
3. Else: use raw input values (giữ backward path cho UI gửi explicit values)

**aggregateMonth raw SQL** — thêm `i.category` vào GROUP BY:
```sql
SELECT i.supplierId, s.name, i.category, i.projectScope,
       SUM(i.soDeNghi), SUM(i.soDuyet)
FROM payment_round_items i
JOIN payment_rounds r ON r.id = i.roundId
JOIN suppliers s ON s.id = i.supplierId
WHERE r.month = $1 AND r.status IN ('approved','closed') AND r.deletedAt IS NULL
GROUP BY i.supplierId, s.name, i.category, i.projectScope
```

## Related Code Files
**Modify**
- `lib/payment/payment-service.ts`
  - `CreateRoundInput`, `UpsertItemInput`, `AggregateRow`
  - `listRounds`: bỏ `category` filter (sẽ filter ở item layer nếu cần — không trong scope phase này)
  - `createRound`: bỏ category logic
  - `upsertItem`: thêm auto-fill branch
  - `aggregateMonth`: thêm category dimension
  - New: `refreshItemBalances(itemId: number)`

**Read for context**
- `lib/ledger/balance-service.ts` (Sub-A)
- `lib/rbac.ts` (isAdmin)

## Implementation Steps
1. Import từ balance-service: `getOutstandingDebt`, `getCumulativePaid`
2. Update `CreateRoundInput` — strip `category`
3. Update `createRound`:
   - Bỏ filter category, sequence = last(month).seq + 1
   - Bỏ `category` khỏi `prisma.paymentRound.create({ data })`
4. Update `UpsertItemInput` — add `category`, optional `congNo/luyKe`, `override?`
5. Update `upsertItem`:
   - Validate `category ∈ {vat_tu, nhan_cong, dich_vu, khac}` khi create
   - Auto-fill branch theo Architecture
   - Override require admin (throw if non-admin)
   - Update path: chỉ patch các field gửi vào (KHÔNG ép refresh balance)
6. Implement `refreshItemBalances(itemId)`:
   - Load item + round; validate draft + creator/admin
   - Re-pull balances; update `congNo`, `luyKe`, `balancesRefreshedAt`
7. Update `listRounds`: remove `category` filter param
8. Update `aggregateMonth`:
   - Mở rộng raw SQL như trên
   - Map `category` vào return type
9. Compile: `pnpm tsc --noEmit` — kỳ vọng FAIL ở `actions.ts` + UI clients (fix sau)

## Todo List
- [x] Remove `category` from `CreateRoundInput` + `createRound`
- [x] Add `category` to `UpsertItemInput`
- [x] Implement auto-fill branch in `upsertItem`
- [x] Implement `override` admin-only path
- [x] Implement `refreshItemBalances`
- [x] Rewrite `aggregateMonth` raw SQL with category dimension
- [x] Remove `category` from `listRounds`
- [x] `tsc --noEmit` — verify only downstream errors remain

## Success Criteria
- `payment-service.ts` không còn ref tới `PaymentRound.category`
- `upsertItem` create không truyền `congNo` → đọc đúng giá trị từ balance-service
- `refreshItemBalances` chỉ chạy được khi round.status='draft'; non-draft throw clear error
- `aggregateMonth` return shape mới có `category`
- Compile errors chỉ còn ở actions/UI (sẽ fix Phase 03-04)

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| balance-service interface lệch | Medium | High | Lock interface với Sub-A trước; smoke test trên 1 row |
| Update path vô tình re-pull balance | Low | Medium | Branch rõ ràng theo presence của `input.id` |
| Override không enforce admin | Low | High | Throw early; unit test scenario |
| aggregate SQL miss category trong GROUP BY | Low | Medium | Code review checklist |

## Security Considerations
- `override` BẮT BUỘC enforce `isAdmin(actor.role)` — không tin client flag
- `refreshItemBalances` enforce creator hoặc admin (cùng pattern với `upsertItem`)

## Next Steps
- Phase 03 wire server actions
