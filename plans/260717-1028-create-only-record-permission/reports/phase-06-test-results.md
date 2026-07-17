# Test report — 2026-07-17 — create-only record permission

## Scope

Read-only verification after the create-only permission implementation. No source or existing test file was changed by QA.

## Results overview

| Command | Result | Details |
| --- | --- | --- |
| `corepack pnpm lint` | PASS with warning | Exit 0; 1 warning |
| `corepack pnpm test` | FAIL | 63 files / 674 tests passed; 5 files / 15 tests failed |
| `corepack pnpm test:integration` | FAIL | 8 files / 26 tests passed; 2 files / 4 tests failed; 5 tests skipped |
| `corepack pnpm test:e2e` | NOT RUN | Deferred while blocking regressions are repaired |
| `corepack pnpm build` | NOT RUN | Deferred while blocking regressions are repaired |
| `corepack pnpm prisma validate` | NOT RUN | Deferred while blocking regressions are repaired |
| `git diff --check` | NOT RUN | Deferred until concurrent implementation edits settle |

All commands emitted a non-blocking local pnpm configuration warning: `EPERM ... AppData\\Local\\pnpm\\config\\rc`.

## Lint

`corepack pnpm lint` exited 0. One warning remains:

- `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx:145`: `currentUser` is defined but unused (`@typescript-eslint/no-unused-vars`).

## Unit failures

`corepack pnpm test` exited 1 after 9.64s.

1. `lib/acl/__tests__/admin-level-callsite-inventory.test.ts` — 3 failures.
   - Its static inventory still expects 55 `requireRoleModuleAccess(..., "admin")` call sites and an `"admin"` module key.
   - Its create-action contract still expects `"edit"`; implementation now uses `"create"` for insert-only actions.
   - Likely cause: characterization fixture was not migrated to the accepted `view < comment < create < edit` model.
2. `test/unit/module-release-entrypoints.test.ts` — 1 failure.
   - `lib/cong-no-nc/labor-ledger-service.ts` has a tracked action whose rollout guard is not its first awaited operation.
   - Likely cause: entrypoint contract needs reconciliation with the intended guard ordering.
3. `test/unit/p0-server-action-contracts.test.ts` — 2 failures.
   - The unauthenticated-role assertion receives mojibake instead of the expected Vietnamese message.
   - `updateFinancePrLineOverride(7, null)` resolves when the mocked finance edit guard rejects.
   - Likely cause: test encoding and missing/reordered guard propagation respectively.
4. `lib/du-an/__tests__/project-service-acl-contract.test.ts` — 7 failures.
   - Each `update*` action in acceptance, cashflow, change-order, contract, estimate, schedule, and transaction services reads `projectId` before invoking `requireReleasedModuleRequest`.
   - Likely cause: the old static test requires a guard before the lookup, while scoped authorization needs the lookup to determine the project. Confirm/adjust the contract without weakening real authorization.
5. `test/unit/admin-create-user-action.test.ts` — 2 failures.
   - Both tests now stop at `requireActiveAdmin` with `Phiên đăng nhập đã hết hạn`.
   - Likely cause: unit test mock was not updated for the pre-existing admin guard.

## Integration failures

`corepack pnpm test:integration` exited 1 after 84.00s.

- `test/integration/payment-service.integration.test.ts`: all four lifecycle tests fail at `lib/payment/payment-service.ts:174` when creating `paymentRound`.
- `test/performance/n-plus-one.test.ts`: suite setup fails at `test/performance/seed-perf-data.ts:147`; its five tests are then skipped.

Exact database error in both cases: `The column payment_rounds.departmentId does not exist in the current database.`

Likely root cause: Prisma client/schema and service now require the immutable `departmentId` column, but the isolated test database has not received migration `20260717120000_add_payment_round_department_scope`. Apply the migration to the test database, then rerun this suite.

## Blocking assessment

The unit and integration failures are release blockers. Repair the contracts/test fixtures and migrate the test database before E2E, production build, Prisma validation, and final diff check are rerun.
