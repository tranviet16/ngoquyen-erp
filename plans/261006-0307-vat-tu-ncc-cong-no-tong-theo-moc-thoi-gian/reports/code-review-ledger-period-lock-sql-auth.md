# Code review: ledger period lock, SQL window, auth (uncommitted changes, 2026-10-06)

Scope: uncommitted diff plus untracked files. Focus: concurrency and period lock, SQL window semantics, auth on server actions and export route, period bounds, date normalization. This was a read-only review. The DB was down, so integration tests were not run.

## Findings

### 1. Critical (pre-existing, outside the diff): labor server actions accept `authorized` and skip ACL
- `lib/cong-no-nc/labor-ledger-service.ts:77-85` (`patchLaborTransaction`) and `:199-207` (`patchLaborOpeningBalance`). Both functions are exported from a `"use server"` file and take `(id, patch, client = prisma, authorized = false)`.
- How it fails: a client calls the action with `(id, patch, undefined, true)`. `undefined` makes `client` fall back to the root `prisma`, and `authorized = true` skips `requireReleasedModuleRequest`. The session check is skipped too, so anyone who has the action ID can edit labor ledger rows or opening balances. Red-team finding #2 fixed this only for material (`material-ledger-service.ts:99-112`).
- Fix: do the same split as material. Keep a non-exported `...Internal(client, id, patch)` helper, give the exported action the signature `(id, patch)` with the guard first, and have the bulk upsert call the internal helper. The NC no-behavior-change rule does not cover a security fix.

### 2. High: re-close and delivery delete can move or delete an event dated inside a signed period
- `lib/ledger/ledger-service.ts:256-313`. `upsertFromDelivery` calls `assertPeriodOpen` only for the new `input.date`. When an event already exists (`:306-311`), it overwrites that event's `date` without checking the old date.
- `lib/vat-tu-ncc/delivery-service.ts:113-137`. `softDeleteDelivery` checks the delivery's date, then soft-deletes the linked event without checking the event's date.
- `updateDelivery` (`delivery-service.ts:78-108`) never re-syncs or invalidates the linked event, so the event's date and amount can differ from the delivery.
- Scenario:
  1. Delivery D is dated 20/5 and is closed in period k (27/4–26/5, unsigned), creating an event dated 20/5.
  2. D is edited to 05/6. This is allowed because k is unsigned. The event keeps 20/5.
  3. k is signed. The missing-delivery check only looks at deliveries dated in k, and D is no longer one of them. The snapshot includes D's event.
  4. Closing k+1 (27/5–26/6) calls `upsertFromDelivery(D, 05/6)`. The lock check passes for 05/6, and the code rewrites the event's date from 20/5 to 05/6, inside signed period k.
  5. Result: k's frozen closing includes D. The dynamic opening of k+1 no longer includes D, but k+1 counts D in its window, so closing(k) ≠ opening(k+1).
- The same root cause means editing qty or price after close leaves a stale event, and signing freezes the stale amount.
- Fix:
  - In `upsertDeliveryRow`, when `existing` is found, read its `date`/`partyId` and `assertPeriodOpen` that date as well.
  - In `softDeleteDelivery`, call `assertPeriodOpen` on the event date.
  - In `updateDelivery`, either refuse to change date, qty, price or project while a live event exists (the user must re-close), or soft-delete the event so the sign check flags the delivery as unposted.

### 3. Medium: inclusive upper bounds remain in reconciliation and supplier balance, and write paths do not normalize dates
- Inclusive bounds:
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:118`: `date: { gte: from, lte: to }`.
  - `reconciliation-derive-service.ts:271`: `BETWEEN ${from} AND ${to}`.
  - `lib/vat-tu-ncc/supplier-balance.ts:30`: `date <= ${asOf}`, called with `from - 1 day`.
  - `lib/ledger/ledger-service.ts:112`: `list` uses `lte dateTo`.
- Write paths accept any string:
  - `lib/cong-no-vt/schemas.ts:20` and `lib/vat-tu-ncc/schemas.ts:6` validate the date only as `z.string().min(1)`.
  - `ledger-service.ts:151,206` and `delivery-service.ts` store `new Date(input.date)` without normalizing.
- Scenario: an editor sends `date: "2026-05-27T10:00:00Z"`, or a future caller passes a timestamp. `assertPeriodOpen` normalizes the value to 27/5 and treats the row as inside the period. But reconciliation bounds use `lte 27/5 00:00` for the period ending 27/5 and `<= 27/5 00:00` for the next period's opening, so the row never appears in any reconciliation. Window reports (`< to+1`) do count it, so they disagree with reconciliation. This breaks the plan rule that every query uses an exclusive upper bound.
- Fix:
  - Use `date: { gte: from, lt: addDays(to, 1) }`, `t.date >= from AND t.date < to+1`, and `date < ${from}` (pass `from`, not `dayBefore`).
  - Normalize dates on write in `createRow`/`updateRow`/`upsertDeliveryRow`/delivery create and update with `toBusinessDateUtc(new Date(input.date))`, or validate with a strict `YYYY-MM-DD` regex plus `parseIsoDateUtc`. If you use the regex, change `patchMaterialTransactionInternal`'s `current.date.toISOString()` to `.slice(0, 10)`.

### 4. Medium: multi-supplier transactions take advisory locks in non-ascending order (deadlock, 40P01)
- `lockSuppliers` sorts only within one call. Several paths take more locks later in the same transaction:
  - `bulkUpsertMaterialTransactions` (`material-ledger-service.ts:169-177`) and `bulkUpsertMaterialOpeningBalances` (`:266-273`) lock per row, in row order.
  - `patchMaterialOpeningBalanceInternal` locks `current.partyId` (`:228`), then `setOpeningBalance` locks the new `partyId` (`:242`).
  - `LedgerService.update` and `softDelete` re-lock after a re-read (`ledger-service.ts:184,237`).
- Scenario: bulk A has rows [NCC 7, NCC 3] and bulk B has rows [NCC 3, NCC 7]. Or a bulk holds NCC 7 while `closeRound` locks [3, 7] in ascending order. Postgres aborts one transaction after `deadlock_timeout`, and the user's whole batch rolls back with a raw error.
- Fix: before the loop, collect every partyId involved (existing rows' partyId plus incoming partyId) and lock them in one `lockSuppliers` call. Do the same in the opening-balance patch (lock both the current and the new partyId in one call). Later re-locks then hit locks already held.

### 5. Medium: more interactive transactions, combined with the audit extension's root client, risk timeouts and pool starvation
- Every material ledger and delivery write now runs in `prisma.$transaction` (default `timeout` 5 s) and blocks on `pg_advisory_xact_lock` while holding a pooled connection.
- The `$extends` audit hooks (`lib/prisma.ts` update/create/delete) run `safeReadBefore(base…)` and `writeAuditRow(base.$transaction…)` on the root client, so each audited write inside a tx needs a second pool connection. `resolveCurrentUserId` may also query the DB through the session lookup. `pg.Pool` defaults to max 10.
- Scenario A (timeout): `commitPeriodClose` (`period-close-service.ts:248`) does about 10 round trips per delivery. These are the delivery update with before-read, audit and session, plus lock, period check, findFirst, and the event update or create with audit. A supplier with a few hundred deliveries in a period exceeds 5 s and gets P2028, so the close can never succeed.
- Scenario B (starvation): one transaction holds the NCC lock while 9 others wait on the same advisory lock, each holding a connection. The holder's audit write cannot get a connection, so everything stalls until the timeout.
- Fix:
  - Pass `{ timeout: 60_000, maxWait: 10_000 }` on `commitPeriodClose`, `signReconciliation` and the bulk upserts.
  - Raise the pool `max` in `createBaseClient`.
  - Longer term, write audit rows through the tx client when inside a transaction.
  - Verify with a load test on a realistic supplier.

### 6. Medium (design, needs a product decision): backdated writes before a signed period are not locked
- `assertPeriodOpen` (`period-lock.ts:76-86`) blocks only dates inside a signed range. `signReconciliation` (`reconciliation-derive-service.ts:322-380`) does not require earlier markers to be signed. Also, the first marker may start after `openingAsOf + 1`, which leaves dates between them that no period covers.
- Scenario: k (unsigned) and k+1 (signed) both exist. A `lay_hang` dated in k still changes the dynamic opening of k+1 but not its frozen snapshot, so closing(k+1) ≠ opening(k+2). `unsignReconciliation` enforces latest-first precisely to protect this chain, so this looks unintended.
- Fix options:
  - (a) Require every earlier marker to be signed, and the first marker's `from` to equal `openingAsOf + 1`.
  - (b) Lock every date ≤ the latest signed `periodTo`.
  - `dieu_chinh` stays the escape hatch in either option.

### 7. Medium (informational): delivery importers bypass the lock and period check
- `lib/import/adapters/gach-nam-huong.adapter.ts:223` and `quang-minh.adapter.ts:221` insert into `supplier_delivery_daily` with raw SQL. They take no NCC lock and run no `assertPeriodOpen`.
- An imported delivery dated inside a signed period gets no event and can never be closed. Red-team finding #21 rejected this only for `cong-no-vat-tu.adapter`. Add these two adapters to the same backlog item, or reject rows dated inside a signed period.

## Checked, no issue found
- Every material write path in scope takes the NCC lock inside a transaction before the period check, and the state it checks is re-read under the lock:
  - ledger create, update, delete and opening balance;
  - delivery create, update and delete;
  - reconciliation create, update and delete;
  - sign and unsign;
  - `commitPeriodClose`, `adminPatchMaterialTransaction` and `syncClosedRoundToLedger`.
- No nested `prisma.$transaction`: `inMaterialTx` wraps only when `client === prisma`.
- Window SQL (`queryWindowByParty`, `queryDebtMatrix`, `queryDetailReport`): opening = opening balances + signed sum of `date < from`; increase/decrease over `>= from AND < to+1`; null bounds are handled through `::timestamp IS NULL`. `thue_hd` counts as an increase through `increaseSql`/`typeInSql` in summary, window, matrix, detail, balance-service and reconciliation closing, with no double counting.
- `Prisma.raw` is limited to whitelisted column and type literals, so it is not an injection risk.
- Auth:
  - Every exported action in the changed `"use server"` files calls `requireReleasedModuleRequest` with the correct module before any write. Some actions read the row first to check ownership, which is a pre-existing pattern and not a side effect.
  - The material actions no longer accept `client`/`authorized`.
  - Export `cong-no-tong-hop`: `canAccess` read on `cong-no-vt` (includes the rollout gate), `windowSchema`, `entityIds` limited to 200 positive integers, filename built on the server, error detail hidden.
  - The supplier layout's tab gate and the thanh-toan page's `requireModuleAccess("cong-no-vt")` are correct.
- `period-bounds.ts` follows the plan rules:
  - from ≤ to;
  - no overlap with a signed marker;
  - from > `openingAsOf`;
  - a new period must start the day after the latest marker, or exactly match an unsigned marker;
  - a marker identified by `selfId` must follow its predecessor.
- Signing requires every delivery in the period to have an event.
- The migration SQL is correct for `TIMESTAMP(3)`, idempotent, and leaves UTC-midnight rows untouched. `parseExcelDate` produces UTC midnight on every branch.

## Unresolved questions
- I could not read `@prisma/adapter-pg` internals (the hook blocks access to `node_modules`), so I have not confirmed how `Date` raw parameters are serialized together with the explicit `::timestamp` casts. If the adapter passed a JS `Date` through to `pg`, pg would serialize it in local time with an offset, `::timestamp` would drop the offset, and every window would shift by 7 h. Run `test/integration/cong-no-window.integration.test.ts` and `ledger-business-date.integration.test.ts` before merging.
- Finding 6 needs a product decision: must periods be signed in order?

Status: DONE_WITH_CONCERNS
