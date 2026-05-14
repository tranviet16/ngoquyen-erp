# Phase 03 — Server actions

## Context Links
- Actions hiện tại: `app/(app)/thanh-toan/actions.ts:1-62`
- Service mới: Phase 02 output

## Overview
- Priority: P2
- Status: completed
- Effort: 0.5h (actual 0.5h)
- Blocked by: Phase 02

## Description
Sync server actions với service mới. Add `refreshItemBalancesAction`. Đảm bảo type re-export khớp.

## Requirements
**Functional**
- `createRoundAction(input)`: input shape mới (không category)
- `upsertItemAction(input)`: input shape mới (có category, optional congNo/luyKe, override flag)
- New `refreshItemBalancesAction(itemId, roundId)` → revalidate detail page
- Optional: `refreshAllItemBalancesAction(roundId)` để wire nút header (gọi `getBalancesBulk` ở service hoặc loop). Recommend: implement minimal — loop in action, revalidate 1 lần.

## Architecture
- Action layer thuần passthrough → service. Tránh business logic.
- `revalidatePath` giữ pattern hiện tại.

## Related Code Files
**Modify**
- `app/(app)/thanh-toan/actions.ts`

## Implementation Steps
1. Update `createRoundAction` — input không còn category
2. Update `upsertItemAction` — input mới
3. Add `refreshItemBalancesAction(itemId: number, roundId: number)`:
   - `await svc.refreshItemBalances(itemId)`
   - `revalidatePath(/thanh-toan/ke-hoach/${roundId})`
4. (Optional Phase 04 needs) Add `refreshAllItemBalancesAction(roundId: number)`:
   - Load all item IDs (thông qua service helper hoặc inline `prisma` — prefer service)
   - Loop call `refreshItemBalances`
   - Revalidate 1 lần
5. Compile: `pnpm tsc --noEmit`

## Todo List
- [x] Update createRoundAction input type
- [x] Update upsertItemAction input type
- [x] Add refreshItemBalancesAction
- [x] Add refreshAllItemBalancesAction (round-level)
- [x] Compile clean ở actions layer

## Success Criteria
- `actions.ts` compile sạch
- Action `refreshItemBalancesAction` invoke service đúng
- Không có business logic trong action layer

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Loop refresh chậm với round nhiều items | Medium | Low | Phase này chấp nhận; nếu chậm, swap sang `getBalancesBulk` ở service |

## Security Considerations
- Service đã enforce role; action không thêm bypass

## Next Steps
- Phase 04 UI refactor
