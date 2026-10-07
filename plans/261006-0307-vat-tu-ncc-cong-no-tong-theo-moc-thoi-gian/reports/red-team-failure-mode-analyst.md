# Red Team: Failure Mode Analyst (Flow Tracer)

Plan: `plans/261006-0307-vat-tu-ncc-cong-no-tong-theo-moc-thoi-gian/` (plan.md + phase-01..06). Date 2026-10-06. Read-only review; every claim below was checked against source.

## Finding 1: The window math assumes ledger dates are UTC midnight, but they are not. `<= to::date` silently drops rows on the last day.
- **Severity:** Critical
- **Location:** Phase 2, sections "Files to Create / Modify" (`queryWindowByParty`, `queryDebtMatrix`, `queryDetailReport`) and "Risks" (first bullet)
- **Flaw:** The plan filters with `(${to}::date IS NULL OR date <= ${to}::date)`. It also replaces the `queryDetailReport` cutoff with "`to` = ngày cuối tháng UTC". Both rest on the Phase 2 Risks claim that "sổ cái lưu UTC midnight nên kết quả mới là kết quả đúng". That claim is false. `ledger_transactions.date` is a plain `DateTime` (timestamp with a time part), and at least two writers store a non-midnight time:
  - `closeRound` passes `closedAt = new Date()` (the full wall-clock instant) into `syncClosedRoundToLedger`, which writes `date: closedAt`.
  - The import adapters parse "DD/MM/YYYY" as **local** midnight (`new Date(y, m-1, d)`), which is 17:00Z of the previous day on a server running at UTC+7.

  The current `queryDetailReport` handles this deliberately: it uses an exclusive bound on the first day of the next month, with the comment "Includes all transactions on the last day regardless of time component". The plan swaps that for an inclusive date compare, which is a regression.
- **Failure scenario:** An admin closes a payment round on 26/05 at 10:00 ICT, so the row is stored as `2026-05-26T03:00Z`.
  - The window 27/4→26/5 uses `date <= '2026-05-26'::date` (midnight), so the payment is excluded from Trả.
  - The window 27/5→26/6 counts it in Đầu kỳ (`date < '2026-05-27'`), so the next period's opening is not the previous period's closing.
  - The legacy `chi-tiet?year=2026&month=5` cutoff excluded nothing before; it now drops the 31/05 payment.
  - The same timestamp also bypasses the signed-period lock. `findSignedPeriodCovering` checks `periodTo >= date`, i.e. `26/5 00:00Z >= 26/5 03:00Z`, which is false, so a payment gets written on the last day of a **signed** period.
  - `computeReconciliation` (`lte: to`) and `supplierBalanceAsOf(dayBefore)` (`date <= 26/5 00:00`) both miss the row as well. It vanishes from both reconciliations around the boundary.

  All 7 invariants in the `cong-no-window` test use midnight fixtures, so they pass while production breaks.
- **Evidence:**
  - `prisma/schema.prisma:696`: `date DateTime` (not `@db.Date`).
  - `lib/payment/payment-service.ts:590`: `const closedAt = new Date();`. Line 600: `syncClosedRoundToLedger(roundId, tx, closedAt)`.
  - `lib/payment/payment-ledger-sync.ts:93`: `assertPeriodOpen(item.supplierId, closedAt)`. Line 97: `date: closedAt`.
  - `lib/import/adapters/excel-utils.ts:15`: `new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))`.
  - `lib/cong-no-vt/balance-report-service.ts:105-114` (exclusive next-month bound plus the time-component comment) and `:147` (`"date" < ${effectiveCutoff}`).
  - `lib/vat-tu-ncc/period-lock.ts:24`: `periodTo: { gte: date }`.
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:98, 110, 118`.
  - Plan Phase 2: "`(${to}::date IS NULL OR date <= ${to}::date)`" and "sổ cái lưu UTC midnight nên kết quả mới là kết quả đúng".
- **Suggested fix:**
  - Use half-open windows everywhere: `date >= from AND date < to + interval '1 day'`. This covers the new window, the matrix, the detail report, `computeReconciliation`, `supplierBalanceAsOf` (`date < from`) and `findSignedPeriodCovering`.
  - Normalise `closedAt` to the VN business date (UTC midnight of the Asia/Bangkok date) before writing.
  - Add a fixture row at `2026-05-26T03:00Z` to the window and reconciliation integration tests.
  - Audit existing rows with `date::time <> '00:00'` before the pilot.

## Finding 2: "Concurrent operations on one NCC are serialised" is false. Ledger writers never take the supplier lock, so a signed snapshot can disagree with the live ledger.
- **Severity:** Critical
- **Location:** Phase 4 Goal ("thao tác đồng thời trên cùng NCC được tuần tự hoá") and "Files to Create / Modify" (lock per NCC). Phase 5 (new Thanh toán write path).
- **Flaw:** The per-supplier lock is only taken by `commitPeriodClose`, `signReconciliation` and `unsignReconciliation`. Every other write runs its period check, `assertPeriodOpen`, through the **global** `prisma` client: outside any transaction, without the advisory lock, then writes. That covers `LedgerService.create/update/softDelete`, `createDelivery/updateDelivery/softDeleteDelivery` and `syncClosedRoundToLedger`. `syncClosedRoundToLedger` receives the `tx` client but still calls `assertPeriodOpen` without it. At READ COMMITTED this is a check-then-write race.
- **Failure scenario:**
  1. The accountant adds a `thue_hd` of 11.448.000 dated 26/5 in the new tab. `assertPeriodOpen` sees the period as unsigned.
  2. In parallel, `signReconciliation` takes the lock, calls `computeReconciliation`, freezes `closingBalance` without the tax, and commits.
  3. The tax insert commits afterwards.

  The signed period now holds a row that is missing from its snapshot. The next period's opening (`supplierBalanceAsOf`) includes it, which breaks the `closing(k) = opening(k+1)` invariant stated at `reconciliation-derive-service.ts:9`. Admins cannot fix it either: `thue_hd` is locked and `adminPatch` is locked. The same race applies to `softDeleteDelivery` (the event is deleted after the snapshot includes it) and to `closeRound`. Phase 5 puts a frequent write button on the same supplier page as "Ký", which makes the race more likely. The test in Phase 4 step 5 only races two `commitPeriodClose` calls and never races a write against a sign.
- **Evidence:**
  - `lib/ledger/ledger-service.ts:43-47, 81-82` (no tx, no lock).
  - `lib/vat-tu-ncc/period-lock.ts:30-35` (`client = prisma` by default).
  - `lib/payment/payment-ledger-sync.ts:93` (no client passed).
  - `lib/vat-tu-ncc/delivery-service.ts:52, 79-80, 106` (check outside the tx at 107).
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:306-333`.
  - Plan Phase 4 Risks: "lock là `xact_lock`, giao dịch ngắn". This only addresses wait time, not correctness.
- **Suggested fix:**
  - Writers wrap the check and the write in one `$transaction`, take `pg_advisory_xact_lock_shared(hashtext('vat-tu-close:'||supplierId))`, and call `assertPeriodOpen(..., tx)`.
  - Sign, close and unsign take the exclusive form of the same key.
  - Add an integration test that runs `Promise.allSettled([signReconciliation, createMaterialTransaction(thue_hd)])` and asserts that snapshot closing equals live closing, or that the write was rejected.

## Finding 3: Adjacency rule 3 blocks closing or re-closing any period after the first unsigned one, so the workflow deadlocks while waiting for NCC signatures.
- **Severity:** High
- **Location:** Phase 4, section "Quy tắc biên kỳ (`validatePeriodBounds`)", rule 3, and `suggestNextPeriod`
- **Flaw:** Rule 3 reads "Nếu có kỳ đã ký: `from` = `max(periodTo đã ký) + 1 ngày`". It applies at preview, commit, create and update, not only at sign. As a result, the only period that can ever be closed is the one right after the latest **signed** period. Today, by contrast, months are closed independently and the NCC signs weeks later.
- **Failure scenario:** K1 (01/4→27/4) is signed. K2 (28/4→26/5) is closed but not yet signed, because the NCC is slow.
  - In late June the accountant tries to close K3 (27/5→26/6). `validatePeriodBounds` returns "phải bắt đầu 28/04/2026" and the close is rejected.
  - Production may already hold an unsigned K3 marker created under the fixed 27→26 regime. Re-closing K3 to fix a price is also rejected.
  - `suggestNextPeriod` keeps proposing K2.
  - Deliveries for June can never reach the ledger, so every report built in Phases 2 and 3 under-reports debt until the NCC signs.

  The integration test in Phase 4 step 5 always signs before closing the next period, so it never hits this.
- **Evidence:**
  - Plan Phase 4 rule 3 and step 1: "sau ký 28/4→26/5, kỳ 28/5→26/6 lỗi 'phải bắt đầu 27/05/2026'". Step 2: the check runs inside `commitPeriodClose`.
  - The current code has no such restriction: `lib/vat-tu-ncc/period-close-service.ts:193-203` only rejects overlap with signed periods.
  - `unsignReconciliation` only orders by `periodFrom` (`reconciliation-derive-service.ts:350-358`).
- **Suggested fix:** Enforce contiguity against the **immediately preceding marker**, signed or not: `from = prevMarker.periodTo + 1`. Allow an exact-match re-close of any unsigned marker. Enforce "previous marker is signed" only inside `signReconciliation`. Add a test that closes K2 and K3 without signing K2.

## Finding 4: `suggestNextClosePeriod` ("earliest delivery without a `lay_hang` event") points at historical imported deliveries, and committing them double-counts debt that is already in the opening balance.
- **Severity:** High
- **Location:** Phase 4, `suggestNextPeriod` / `suggestNextClosePeriod` ("ngày phiếu sớm nhất chưa có event `lay_hang` (`ledger_transactions.deliveryId`)")
- **Flaw:**
  - The Nam Hương and Quang Minh adapters bulk-insert historical rows into `supplier_delivery_daily` with raw SQL that creates no ledger event.
  - The historical debt for those deliveries is already carried in `ledger_opening_balances`, or in imported `lay_hang` rows with `deliveryId = NULL`. The repo even ships a checker that flags these as "event mồ côi (nhập tay/lịch sử, không link phiếu)".
  - The LEFT JOIN on `deliveryId` treats every one of those deliveries as "chưa chốt".
- **Failure scenario:** An NCC with no signed period opens Chốt kỳ. The suggestion is 2025-01-xx → 2025-01-26 (the "Gạch Nam Hương 2025.xlsx" import). The accountant accepts the default and closes period after period. Each close posts `lay_hang` for goods already counted in the opening balance of 189.805.120, so Nợ is inflated by the full 2025 volume. Nothing rejects this: the bounds rules only look at markers. The plan's manual check, "NCC mới có phiếu từ 29/3: mở Chốt kỳ thấy gợi ý 29/3→26/4", uses a clean NCC.
- **Evidence:**
  - `lib/import/adapters/gach-nam-huong.adapter.ts:2-3, 223` (`INSERT INTO supplier_delivery_daily`) and `lib/import/adapters/quang-minh.adapter.ts:221`.
  - `lib/vat-tu-ncc/period-recon-check-service.ts:4-6, 84-93` (orphan historical events).
  - The opening balance `asOfDate` is never consulted by any aggregation (grep `asOfDate` in `lib/ledger` returns nothing).
- **Suggested fix:**
  - Lower-bound the first suggested period with `max(earliest open delivery, max(ledger_opening_balances.asOfDate where partyId) + 1 day)`.
  - In preview, show a blocking warning listing orphan deliveries before that date.
  - In `validatePeriodBounds`, reject `from <= opening asOfDate` for NCCs that have an opening balance.

## Finding 5: The rollback plan for `thue_hd` is wrong. On revert, most queries drop tax rows entirely rather than "only losing the label".
- **Severity:** High
- **Location:** Phase 1, section "Risks", third bullet ("nhánh `ELSE` dương ở các CASE cũ vẫn cộng vào số dư, chỉ mất nhãn")
- **Flaw:** Only `queryCurrentBalance`, `supplierBalanceAsOf` and the `queryMonthlyByParty` **opening** CTE use an `ELSE positive` branch. The others use exact-type `FILTER` or `ELSE 0`, so after a revert `thue_hd` disappears from them:
  - `querySummary` (the `/cong-no-vt` Tổng nợ and the `doi-chieu` Excel)
  - `queryDebtMatrix`
  - `balance-service` (`congNo` in payment rounds)
  - the `queryMonthlyByParty` **period** CTE
  - `queryDetailReport`

  Two more problems: the monthly report starts to violate Đầu kỳ + LH − Trả = Cuối kỳ (the tax appears in the opening but never in the period), and the reverted `z.enum` makes `patchMaterialTransaction` throw on those rows, because it re-parses the merged current type.

  The suggested workaround, "đổi thành `dieu_chinh` dương", has its own problems. `dieu_chinh` is excluded from `balance-service` (so the tax vanishes from payment-round debt) and it is not period-locked (so signed-period rows become mutable).
- **Failure scenario:** Phase 3 is reverted after accountants have entered tax rows. Tổng nợ on `/cong-no-vt` drops by 11.448.000 for Bê tông HP, while the reconciliation still shows 350.876.111. Payment-round `congNo` under-reports. Nobody can edit the rows, because `transactionSchema.parse` rejects `thue_hd`.
- **Evidence:**
  - `lib/ledger/ledger-aggregations.ts:54-59, 87` (FILTER), `:163-178` (ELSE 0), `:143-147` (ELSE positive, opening only), `:307-310`.
  - `lib/ledger/balance-service.ts:143-148`.
  - `lib/cong-no-vt/balance-report-service.ts:131-146`.
  - `lib/cong-no-vt/material-ledger-service.ts:79, 97`.
  - `lib/ledger/ledger-service.ts:45` (`dieu_chinh` not locked).
- **Suggested fix:** State that rollback is not data-safe once tax rows exist. Ship Phase 1 classification behind a single release, and have the revert keep `transaction-classification.ts` while hiding only the UI. If a data downgrade is truly needed, provide a scripted conversion and test it against all six aggregations.

## Finding 6: Signing a flexible-bounds period never checks that its deliveries were closed, so unclosed deliveries become permanently unpostable.
- **Severity:** High
- **Location:** Phase 4, "Files to Create / Modify" (`signReconciliation kiểm lại liền kề trong transaction`; `createReconciliation`/`updateReconciliation` accept any valid bounds)
- **Flaw:** Phase 4 makes manual markers with arbitrary `[from, to]` a first-class path, through `reconciliation-form.tsx` and `createReconciliation`. The only check added to `signReconciliation` is adjacency. Nothing checks that every non-deleted delivery in `[from, to]` already has a `lay_hang` event.
- **Failure scenario:**
  1. A user creates a marker 27/5→30/6 via the form (no close), or closes 27/5→26/6 and then adds a delivery dated 20/6.
  2. The NCC signs. The snapshot excludes the unclosed delivery.
  3. From then on, `commitPeriodClose` rejects any range overlapping the signed one, and `updateDelivery/softDeleteDelivery` are blocked by `assertPeriodOpen`.
  4. `suggestNextClosePeriod` starts after `periodTo`, so the delivery is never offered again.

  The goods value is lost from the debt with no warning. `checkPeriodConsistency` exists but is admin-only and never called at sign time.
- **Evidence:**
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:302-333` (no delivery check).
  - `lib/vat-tu-ncc/period-close-service.ts:193-203`.
  - `lib/vat-tu-ncc/delivery-service.ts:79-80, 106`.
  - `lib/vat-tu-ncc/period-recon-check-service.ts:47-53` (admin-only).
- **Suggested fix:** Inside the sign transaction, after taking the lock, count deliveries in `[from, to]` that have no live event, plus amount mismatches. Reject with the list. Add an integration test: create a marker, add an unclosed delivery, sign, and expect rejection.

## Finding 7: The Thanh toán tab's "Nợ hiện tại" and "locked" flags come from the wrong primitives (wrong total plus N+1), and "read-only" rows are only enforced in the UI.
- **Severity:** Medium
- **Location:** Phase 5, "Files to Create / Modify" (`thanh-toan/page.tsx`: "cờ `locked` qua `findSignedPeriodCovering`", "'Nợ hiện tại' qua `getMaterialCurrentBalance` gộp", "Sửa/Xoá chỉ cho dòng nhập tay chưa khoá")
- **Flaw:**
  - **Wrong total:** `getMaterialCurrentBalance` needs a single `entityId` and matches `projectId IS NOT DISTINCT FROM $x`. Called with `projectId` undefined, it only sums rows with a **NULL project**, and every `lay_hang` from a delivery has a project. "Gộp" therefore means two queries per (entity, project) pair, an unbounded N+1, and it can still miss pairs that exist only in opening balances.
  - **N+1 on locks:** Computing `locked` with `findSignedPeriodCovering` per row means up to 500 queries per page load.
  - **UI-only guard:** `patchMaterialTransaction` and `softDeleteMaterialTransaction` never check `paymentRoundItemId` or `deliveryId`. Any `cong-no-vt` editor can call the server action directly and edit or delete a payment-round `thanh_toan`, or even retype a delivery-generated `lay_hang` as `thue_hd`.
- **Failure scenario:** For Nam Hương, the card shows "Nợ hiện tại" = only the project-less payments (a negative number). A crafted call to `softDeleteMaterialTransaction(id)` removes a payment-round row. The payment round stays `closed` but the debt rises. Re-closing is impossible because closing is a one-way status transition.
- **Evidence:**
  - `lib/ledger/ledger-aggregations.ts:241-263` (exact `entityId` and `projectId` match).
  - `lib/vat-tu-ncc/period-lock.ts:13-28`.
  - `lib/cong-no-vt/material-ledger-service.ts:46-52, 67-101` (no provenance check).
  - `lib/payment/payment-service.ts:593-596` (one-way close).
- **Suggested fix:**
  - Reuse a supplier-wide balance query in the shape of `supplierBalanceAsOf`, exposed through a `cong-no-vt`-guarded action.
  - Load signed periods once and compute `locked` in memory.
  - In `LedgerService.update/softDelete`, reject rows with `paymentRoundItemId != null`, and reject type or amount changes on rows with `deliveryId != null`.

## Finding 8: The import change is incomplete and can flip signs.
- **Severity:** Medium
- **Location:** Phase 1, "Files to Create / Modify" (`lib/import/adapters/cong-no-vat-tu.parse.ts`: "nhận diện 'thuế'/'thue'/'tax' → `thue_hd` trước nhánh 'trả'")
- **Flaw:**
  - The adapter validates each parsed row against its own `TxSchema` with `z.enum(["lay_hang","thanh_toan","dieu_chinh"])`. That file is not in Phase 1's list, and the Step 8 grep (`dieu_chinh` in `lib components app`) only finds it by luck. Every imported "Thuế HĐ" row fails validation.
  - The labor adapter has the same hard-coded enum.
  - Putting the "thuế" check **before** "trả" reclassifies any payment description such as "Trả tiền thuế HĐ 00000232" from `thanh_toan` (debt −) to `thue_hd` (debt +). That is a 2× sign error per row.
- **Failure scenario:** Re-importing the "Quản Lý Công Nợ Vật Tư.xlsx" Nhập Liệu sheet either rejects the tax rows or books tax payments as debt increases, so Nợ is overstated by twice the payment.
- **Evidence:**
  - `lib/import/adapters/cong-no-vat-tu.adapter.ts:25-31` (`transactionType: z.enum([...3 values])`).
  - `lib/import/adapters/cong-no-nhan-cong.adapter.ts:29`.
  - `lib/import/adapters/cong-no-vat-tu.parse.ts:15-20` (current ordering).
- **Suggested fix:** Add both adapters to the file list and use `z.enum(TRANSACTION_TYPES)`. Classify as `thue_hd` only when no payment keyword is present, and add parser unit cases for "Trả thuế…" and "Thuế HĐ: 00000232".

## Finding 9: Report-period and Excel inputs are not validated at the boundary, and legacy URL semantics are unspecified.
- **Severity:** Medium
- **Location:** Phase 2, `resolveReportPeriod` (only custom `from > to` returns `error`). Phase 3, `app/api/export/excel/route.ts` (`{from, to, label, entityId}` from the client; filename `cong-no-tong-hop-{from}-{to}`).
- **Flaw:**
  1. **Preset `ncc` crashes on a bad month.** It delegates to `periodRange`, which **throws** on a month outside 1–12. `?period=ncc&y=2026&m=13` therefore becomes an unhandled server error instead of the `error` field.
  2. **Impossible ISO weeks roll over.** `?period=week&y=2027&w=53` (2027 has 52 ISO weeks) rolls into 2028-W01 under the label "T53/2027". There is no unit case for invalid week or quarter values.
  3. **Unsanitised export params.** The export route would put client-supplied `from/to` straight into `new Date()` and the `Content-Disposition` filename.
     - Invalid input returns 500 with `detail: String(err)`, leaking the Prisma or SQL text.
     - The client-supplied `label` becomes the sheet title, so the title can claim "Tháng 5" while the numbers cover a different window.
  4. **Year-only legacy URLs.** Today, `chi-tiet?year=2026` with month "Tất cả" means **no cutoff**, because the cutoff only applies when both values are set. The plan only defines legacy behaviour for `year` plus `month`, so a year-only bookmark may silently become "to 31/12" or "to 31/01".
  5. **Redirect drops the preset.** The `bao-cao-thang` fallback redirect still hard-codes `?year=&month=`, so a week or quarter selection without an entity is turned back into a month.
- **Evidence:**
  - `lib/vat-tu-ncc/period.ts:49-51` (throws).
  - `app/api/export/excel/route.ts:123-125` (detail leak) and `:132` (filename header).
  - `lib/cong-no-vt/balance-report-service.ts:110` (`if (year != null && month != null)`).
  - `components/ledger/detail-report-filter.tsx:84-85` (year without month is a valid state).
  - `app/(app)/cong-no-vt/bao-cao-thang/page.tsx:32` and `app/(app)/cong-no-nc/bao-cao-thang/page.tsx:32` (legacy redirect).
- **Suggested fix:**
  - `resolveReportPeriod` validates ranges (y 2000–2100, q 1–4, m 1–12, w 1–`isoWeeksInYear(y)`, `YYYY-MM-DD` regex) and returns `error` instead of throwing.
  - The route re-parses with the same function, ignores the client `label`, rebuilds the filename from parsed dates, and returns a generic 400 or 500 without `detail`.
  - Define year-only legacy as `{from: null, to: null}`, and make the redirect preserve the current period params.

## Verification Results

1. `commitPeriodClose` → `upsertFromDelivery` → marker creation: **TRACED, with a gap**.
   - Path: `period-close-service.ts:181` ACL → `:182` `periodRange` → `:190` `$transaction` → `:191` advisory lock `vat-tu-close:{id}:{from}` → `:193-203` signed-overlap check (in tx) → `:205-209` load deliveries, throw if empty → `:217-224` violations → `:226-232` missing price → `:235-263` loop: `supplierDeliveryDaily.update` plus `ledger-service.ts:181-228` `upsertFromDelivery` (findFirst by `deliveryId`, update/revive or create; **no period guard inside**, relies on the caller) → `:266-274` marker exact-match findFirst/create (backed by unique index `supplier_recon_period_unique`, migration `20260729162000`) → `:279-281` revalidate after commit.
   - Gap: concurrent writers outside this lock (Finding 2).
2. `signReconciliation`: **FAILED** against the plan claim "sign re-checks adjacency inside the transaction" (that check does not exist yet), and against "concurrent ops serialised".
   - Actual path: `reconciliation-derive-service.ts:303` ACL → `:304` `loadRecon` (outside tx) → `:306` tx → `:309` lock keyed by `periodFrom` → `:310-315` re-check signed flag → `:317` `computeReconciliation(tx)` → `:321-333` write 4 columns plus JSON.
   - No delivery-completeness check (Finding 6). Writers do not take this lock (Finding 2).
3. `syncClosedRoundToLedger` → `assertPeriodOpen`: **FAILED** (the guard is neither transactional nor date-correct).
   - Actual path: `payment-service.ts:590` `closedAt = new Date()` → `:591` tx → `:600` `payment-ledger-sync.ts:14` → `:93` `assertPeriodOpen(item.supplierId, closedAt)` with **no client** (global `prisma`, `period-lock.ts:33`) → `:24` `periodTo >= closedAt` is false on the last day of a signed period → `:116-124` upsert with a timestamped `date`.
4. `softDeleteDelivery` → ledger event: **TRACED, race-prone**.
   - Path: `delivery-service.ts:103` read → `:105` ACL → `:106` `assertPeriodOpen` (global client, outside tx, no lock) → `:107` tx → `:108-111` soft-delete delivery → `:114-123` soft-delete the linked event.
   - Race with sign: Finding 2.
5. `queryDetailReport` cutoff: **TRACED, and the plan's change is a regression**.
   - Path: `balance-report-service.ts:105-114`: `new Date(year, month, 1)` (local) is an **exclusive** bound, applied only when both `year` and `month` are set (`:110`); otherwise the sentinel at `:117` → `:147` `"date" < ${effectiveCutoff}`.
   - Plan Phase 2 changes this to an inclusive `to` UTC date, which drops last-day timestamped rows (Finding 1).
6. `createMaterialTransaction` → `LedgerService.create` → period guard: **TRACED, guard not serialised**.
   - Path: `material-ledger-service.ts:29` ACL `cong-no-vt` create → `:30` zod (3-value enum at `schemas.ts:20`) → `:31` `ledger-service.ts:81` → `:82` `assertMaterialPeriodOpen` (`:43-47`; material only, `lay_hang|thanh_toan` only; Phase 1 adds `thue_hd`) → `period-lock.ts:30-41` (global client) → `:91` insert without tx or lock → `material-ledger-service.ts:32` revalidate.
7. `queryMonthlyByParty` as a wrapper: **TRACED**.
   - `ledger-aggregations.ts:127-185` uses `make_date` / `::date` month bounds with `date <= last_of_month` (inclusive date, so it has the same timestamp exclusion as Finding 1). The parity claim holds only for midnight data.
   - Opening CTE `:143-147` uses ELSE positive. Period CTE `:163-178` uses ELSE 0.
8. Advisory lock key change: **TRACED**.
   - Three sites: `period-close-service.ts:191`, `reconciliation-derive-service.ts:309, 349`. No other `vat-tu-close` users.
   - During a rolling deploy, old instances (key with `from`) and new instances (key per supplier) do not exclude each other. Deploy with a single instance or drain first.
9. `Prisma.sql` null `::date IS NULL` pattern: **TRACED (low risk)**. The existing `${x ?? null}::int IS NULL` and `::int[]` patterns work (`ledger-aggregations.ts:48-50, 301-302`). The real risk is the `::date` truncation semantics (Finding 1), not null binding.
10. Old signed snapshots without `taxRows`: **TRACED, OK as planned**. `getReconciliationView` spreads the raw JSON (`:213-228`), and the list uses the 4 columns (`:270-282`). Defaulting `taxRows ?? []` and `otherAmount` derived from the 4 columns are correct for old rows.
11. ISO week facts in the Phase 2 tests: **TRACED, correct**. W41/2026 = 05/10–11/10. 2026 has 53 weeks because 01/01/2026 is a Thursday, so W53 = 28/12/2026–03/01/2027 and `isoWeekOf(2027-01-01)` = 2026-W53. The invalid-input cases are missing (Finding 9).

## Unresolved Questions
- Does production `ledger_transactions` already contain non-midnight `date` values? Running `SELECT count(*) WHERE date::time <> '00:00'` before Phase 2 would size the impact of Finding 1.
- Is it intended policy that a period cannot be closed until the previous one is signed (Finding 3), or is that an accident of rule 3's wording?
