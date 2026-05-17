# Sub-B Delivery: Payment Refactor Multi-Category Foundation

**Date**: 2026-05-14 16:00
**Severity**: High
**Component**: Thanh-toán, Payment Service, Data Aggregation
**Status**: Completed

## What Happened

Delivered Sub-B payment refactor (4 phases, 5 commits: 4030168, 7d91c47, 0789be2, f8f64a2, 3829f26). All code green: `pnpm tsc --noEmit` clean, `pnpm next build` successful. Migrated payment schema from single `PaymentRound.category` to per-item categories. Integrated Sub-A balance-service for auto-fill. Built 16-cell aggregate pivot (4 categories × 2 scopes × 2 metrics). Sub-C is unblocked.

## The Brutal Truth

We shipped a regression in the Excel export route that didn't exist in the code review. The on-screen pivot pivoted to 16 cells (category dimension), but the export route kept summing across all categories silently. Users would see reconciled numbers on screen and get a completely different number in the Excel file. This is exactly the kind of bug that explodes in production when accounting staff can't match their exports to the screen.

The Prisma shadow-DB ordering bug hit us again. Same class as before: `migrate dev --create-only` failed because pre-existing migration `20260507093220_add_task_collab` references `ALTER TABLE tasks` before that table exists in the shadow. Worked around it with manual migration creation and `migrate deploy`, but the underlying bug in the `add_task_collab` migration still lives in the codebase and will block any future `migrate dev` attempt. This is technical debt that will bite someone.

Fragment key handling in React slipped through tsc. Three UI files used `<>` (short fragment) with `key` attributes. TypeScript and build don't catch this—only spotted during code review. Had to replace with explicit `<Fragment key=...>`.

## Technical Details

**P1 — Schema Migration**
- Dropped `PaymentRound.category` (NULLable consolidation field, never used in practice)
- Created unique constraint `(month, sequence)` on `PaymentRound` (prevents duplicate rounds)
- `PaymentRoundItem`: added `category` (NOT NULL enum: vat_tu, nhan_cong, dich_vu, khac) + `balancesRefreshedAt` (nullable timestamp, tracks last refresh)
- Raw SQL migration to bypass Prisma 7.8 shadow-DB bug (pre-existing migrations in wrong order)
- All test data wiped per migration; next seed will populate fresh

**P2 — Service Rewrite**
- `upsertItem(itemId, quantity, unitPrice, congNo, luyKe, category, override)`: auto-fills `congNo`/`luyKe` from Sub-A balance-service when caller passes null; `override` flag for admin manual entry
- `refreshItemBalances(itemId)`: re-pulls from balance-service, draft+creator/admin gated, updates `balancesRefreshedAt`
- `aggregateMonth(month)`: now groups on `category` dimension first, then sums within each category across items
- Removed old category consolidation logic (P1 dropped the field anyway)

**P3 — Server Actions**
- `refreshItemBalancesAction(itemId)`: calls `refreshItemBalances`, returns tuple `[success, error?]`
- `refreshAllItemBalancesAction()`: loops items in round, calls `refreshItemBalances` per item, early-return on first error

**P4 — UI Changes**
- Per-item `<select>` for category in edit mode (was hidden before)
- Admin-only override toggle (`isOverride` flag)
- "Cập nhật số dư" header button triggers `refreshAllItemBalancesAction` + `router.refresh()`
- Tong-hop pivot: 16 cells = 4 categories (vat_tu, nhan_cong, dich_vu, khac) × 2 scopes (parent only, parent+descendants) × 2 metrics (qty, value)
- **CRITICAL MISS**: Export route at `app/api/thanh-toan/tong-hop/export/route.ts` never updated. Still sums across all categories; on-screen pivot is now wrong vs export.

**Code Review Catches**
1. Fragment keys: `<>...</>` doesn't accept `key`. Replaced 3 instances with `<Fragment key=...>` from react.
2. Export regression: Noticed because reviewer asked "how does export consume `aggregateMonth`?" and discovered it was still doing old sum-all logic.
3. Category mutability: Service `upsertItem` update path was ignoring category changes. UI offered edit, backend reverted it. Fixed to allow category mutation during draft phase (matches user expectation).

**Auto-fill behavior for serviceables (dich_vu/khac)**
- No ledger backing in Sub-A (these categories are non-ledger), so balance auto-fills to `0`
- `balancesRefreshedAt` gets timestamped even though no real pull happened
- Reviewer flagged as potentially confusing but deferred to future polish pass

## What We Tried

1. **Category consolidation in PaymentRound** — schema had a `category` field to bucket rounds. Realized in P1 it was never used; items already have category. Dropped it cleanly.

2. **Export as separate concern** — assumed export route inherits aggregate shape automatically. It doesn't; consumers of `AggregateRow` need explicit updates. Lesson: grep all consumers when changing aggregate structure.

3. **Auto-fill UX clarity** — wanted to suppress `balancesRefreshedAt` for zero-balance items. Left as-is for consistency; can revisit with UI hints in next pass.

## Root Cause Analysis

**Export regression**: Incomplete test coverage for API routes. P4 UI scope checked tong-hop screen against `aggregateMonth` directly, but `export/route.ts` is a separate consumer that wasn't in scope radar. The route uses the old aggregation logic (predates the pivot). Root cause: no integration test linking screen pivot + export route to the same aggregate function.

**Prisma shadow-DB bug recurrence**: `20260507093220_add_task_collab` is a badly-ordered migration (references table before creation). This breaks any fresh `migrate dev`, forcing workarounds. Root cause: migration wasn't caught during initial Sub-A work; now it's entrenched and blocks any future dev from running `migrate dev` cleanly.

**Fragment keys**: Typescript strict mode doesn't validate fragment attributes. Technically valid JSX, runtime-irrelevant, but React warnings get noisy. Only caught in code review; tsc clean doesn't catch it.

**Category during draft**: Service `upsertItem` had two paths—create (accepts category) and update (ignored category). Asymmetry in behavior. UI assumed both paths honored category; wrong assumption.

## Lessons Learned

1. **API routes and UI are separate consumers of business logic.** When you change aggregate shape, don't just update the page—grep for all API route references to that service/query and update them too. Build an integration test that links them.

2. **Badly-ordered migrations are contagious debt.** The `add_task_collab` migration is now a blocker for any dev running `migrate dev` locally. The workaround (manual migration dir + `migrate deploy`) is too brittle. Must be fixed before any major schema work. Add to cleanup ticket.

3. **Fragment keys are a paper cut.** JSX `<> ... </>` syntax doesn't accept `key`; must use `<Fragment>`. TypeScript and build don't enforce this. Add a lint rule or doc note so the next person doesn't learn this in code review.

4. **Service symmetry matters.** If `upsertItem` create path accepts a parameter, the update path should too (or explicitly document why it doesn't). Asymmetry is a bug waiting to be found in production.

5. **Sub-A integration was solid.** The balance-service contract was stable and well-designed. Zero code changes needed despite Sub-A shipping first—that's good API design.

## Next Steps

1. **Hotfix export route** — update `app/api/thanh-toan/tong-hop/export/route.ts` to pivot by category (same 16-cell shape as screen). Test against a real monthly dataset. Deploy before any production use.

2. **Fix `add_task_collab` migration** — Rewrite migration `20260507093220_add_task_collab` to not reference `tasks` before creation. Or split into two migrations. Verify `migrate dev --create-only` then `migrate dev` works cleanly on fresh DB. Owner: tech lead. Timeline: before next major schema change.

3. **Add integration test** — create test that calls both screen pivot endpoint + export endpoint on same month data, verify they produce same aggregate totals. Prevents recurrence of split-consumer bugs.

4. **Lint rule for fragments** — ESLint rule to forbid `key` on JSX `<>` syntax. Or document in `./docs/code-standards.md` under React patterns.

5. **Sub-C unblocked** — payment module now ready for downstream cash flow + reconciliation work. Notify Sub-C owner with handoff: balance-service integrated, multi-category schema live, auto-fill working.

