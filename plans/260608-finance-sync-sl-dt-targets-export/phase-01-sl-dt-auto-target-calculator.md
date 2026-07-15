# Phase 01 - SL-DT Auto Target Calculator

## Context Links

- `lib/sl-dt/compute.ts`
- `lib/sl-dt/report-service.ts`
- `app/(app)/sl-dt/chi-tieu/actions.ts`
- `lib/sl-dt/__tests__/compute.test.ts`

## Overview

Priority: high
Status: implemented on 2026-06-08

Create a pure calculator for monthly `slKeHoachKy` and `dtKeHoachKy` from the selected target milestone. No database migration in this phase.

## Requirements

- Use `targetMilestone` from the Chỉ tiêu row; fall back to the auto suggestion only when the row has no manual target milestone.
- Resolve `targetMilestone` to the matching cumulative payment-plan amount.
- `dtKeHoachKy = max(0, targetRevenueCumulative - prevDtThoLuyKe)`.
- `slKeHoachKy = max(0, min(estimateValue, targetRevenueCumulative) - prevSlLuyKeTho)`.
- Do not use current-period actuals (`slThucKyTho`, `dtThoKy`, `dtThoLuyKe`) to shrink period targets.
- Return a reason code and explanation for UI/admin audit.

## Architecture

- Add pure function and re-export through `lib/sl-dt/compute.ts`:
  - `suggestMonthlySlDtTargets(input, options?)`
  - returns `slTargetKy`, `dtTargetKy`, `targetRevenueCumulative`, `targetProductionCumulative`, `targetMilestoneIndex`, `reasonCode`.
- Keep all values as `number`.
- Add tests in `lib/sl-dt/__tests__/compute.test.ts`.

## Related Code Files

- Modify `lib/sl-dt/compute.ts`
- Create `lib/sl-dt/monthly-target-suggestion.ts`
- Modify `lib/sl-dt/__tests__/compute.test.ts`

## Implementation Steps

1. Add types and helper to build cumulative milestone amounts.
2. Find the cumulative amount for the selected target milestone.
3. Compute `dtTargetKy` from beginning revenue cumulative.
4. Compute `slTargetKy` from beginning production cumulative, capped by lot estimate.
5. Add regression tests proving current-period actuals do not reduce targets.

## Success Criteria

- Unit tests cover agreed examples.
- No existing compute behavior regresses.
- Function is pure and usable by later actions/UI.

## Validation Result

- `npm run test -- lib/sl-dt/__tests__/compute.test.ts`: pass, 23 tests.
- `npm run lint`: pass with existing warnings only.
- `npm run build`: pass.
- `npm run test`: pass, 47 files / 528 tests.

## Fix Note - 2026-06-10

- Corrected calculator from "next milestone/current actual driven" to "selected target milestone/beginning cumulative driven".
- Latest validation: `npm run test -- lib/sl-dt/__tests__/compute.test.ts` pass, 22 tests; `npm run build` pass.

## Fix Note - 2026-06-10 Closeout

- Final payment-plan milestone is revenue closeout against quyết toán.
- Final milestone revenue target is blocked until `hoSoQuyetToan = "Đã ký"`.
- When the final milestone is eligible, closeout revenue is calculated against `estimateValue` (Dự toán phần thô), not the payment-plan running total.
- Chỉ tiêu table exposes Hồ sơ QT so admin can set the closeout gate without switching to Tiến độ XD.
- Latest validation: `npm run test -- lib/sl-dt/__tests__/compute.test.ts` pass, 26 tests; focused `npm run lint` pass; `npm run build` pass.

## Fix Note - 2026-06-10 Latest QT and Completed Lots

- Chỉ tiêu report now reads latest non-empty Hồ sơ QT up to the selected month, not only the exact month row.
- If `estimateValue`, beginning SL cumulative, and beginning DT cumulative are already matched, both period targets are zero.
- Regression tests now cover real lot-shaped cases: 4B = 0, 7B = 0, and signed 5A = remaining revenue to Dự toán phần thô.
- Latest validation: `npm run test -- lib/sl-dt/__tests__/compute.test.ts` pass, 29 tests; focused `npm run lint` pass; `npm run build` pass.

## Fix Note - 2026-06-10 Empty Payment Plans

- Lots with a payment-plan row but no positive milestone amounts are skipped by auto-calculation instead of being counted as updated with zero targets.
- Real data check for 06/2026: Lô 12B has beginning SL/DT cumulative values but an empty payment plan, so no target can be derived until payment milestones are entered.
- Full-table simulation for 06/2026: 55 lots, 46 calculable, 9 skipped because payment-plan data is missing or empty.

## Security Considerations

- None beyond normal admin-only action usage in later phase.

## Next Steps

- Phase 02 data model after calculator is stable.
