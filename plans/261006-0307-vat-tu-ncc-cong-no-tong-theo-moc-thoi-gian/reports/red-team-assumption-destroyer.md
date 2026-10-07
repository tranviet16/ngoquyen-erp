# Red Team — Assumption Destroyer + Scope Auditor

Plan: `plans/261006-0307-vat-tu-ncc-cong-no-tong-theo-moc-thoi-gian` (plan.md + phase 01–06). Date: 2026-10-06.
Method: every claim below was checked with grep/read against the current tree on `main`. All line numbers are from the working tree as of this review.

---

## Finding 1: The plan assumes ledger dates are always UTC midnight. They are not, so windows and the "+1 day" contiguity rule lose rows
- **Severity:** Critical
- **Location:** Phase 2, sections "Context" and "Risks". Phase 4, section "Quy tắc biên kỳ" rule 3. plan.md, "Success Criteria" bullet 2 (Cuối kỳ(đến T) = Lũy kế(T)).
- **Flaw:** Phase 2 says that because "sổ cái lưu UTC midnight", switching `queryDetailReport` from local time to UTC is "kết quả đúng". It also says the window CTE should use `date <= ${to}::date`. Phase 4 requires `from = periodTo + 1 day`. All three depend on every `ledger_transactions.date` being exactly 00:00Z. Two production writers break that:
  - Payment-round close writes `thanh_toan` with the full current timestamp.
  - The Excel import parses `DD/MM/YYYY` as **local** midnight (Asia/Bangkok, which is 17:00Z on the previous day).
  - The column is `TIMESTAMP(3)`, not `DATE`.
- **Failure scenario:**
  - (a) A payment round closes on 26/5 at 10:00, giving a `thanh_toan` row at `2026-05-26T10:00`. Here is where it ends up:
    - `computeReconciliation(28/4→26/5)` uses `lte: 26/5 00:00`, so the row is excluded.
    - The next period starts at 27/5 00:00, so the row is excluded there too.
    - The next period's opening is `supplierBalanceAsOf(dayBefore = 26/5 00:00)`, also excluded.
    - Net result: the payment appears in **no** reconciliation, and `closing(k+1) ≠ opening(k+2)`. The period lock (`periodTo gte date`) also does not cover the row.
  - (b) An imported "01/05/2026" row is stored as `2026-04-30T17:00`. Today the local cutoff `new Date(2026, 4, 1)` correctly leaves it out of April. After Phase 2's "UTC fix" it moves into April.
  - All plan fixtures use midnight dates, so every new invariant test passes while production numbers drift.
- **Evidence:**
  - `prisma/migrations/20260504144425_add_ledger/migration.sql:5`: `"date" TIMESTAMP(3) NOT NULL`
  - `lib/payment/payment-service.ts:591` `const closedAt = new Date();` → `lib/payment/payment-ledger-sync.ts:34` `date: closedAt`
  - `lib/import/adapters/excel-utils.ts:15`: `new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))` (local)
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:110,118`: `dayBefore`, `date: { gte: from, lte: to }`
  - `lib/vat-tu-ncc/period-lock.ts:22-23`: `periodFrom: { lte: date }, periodTo: { gte: date }`
  - `lib/cong-no-vt/balance-report-service.ts:111-112` (local cutoff that the plan "fixes")
  - Plan quote: "sổ cái lưu UTC midnight nên kết quả mới là kết quả đúng" (phase-02 Risks)
- **Suggested fix:**
  - Use a half-open `[from, to + 1 day)` window everywhere: the window CTEs, `computeReconciliation`, `findSignedPeriodCovering`, and `supplierBalanceAsOf`, where asOf becomes `< from`.
  - Or add a one-off normalisation of existing `date` values plus a write-side normaliser in `LedgerService.create/update` and `syncClosedRoundToLedger`.
  - Add an integration case with a `10:00` payment-round row on the period's last day.

## Finding 2: The "5 paths = 350.876.111" invariants compare functions that aggregate at different levels
- **Severity:** High
- **Location:** Phase 1 step 7; Phase 2 step 5(d); Phase 5 "Files" (thanh-toan page "Nợ hiện tại qua `getMaterialCurrentBalance` gộp").
- **Flaw:** The functions do not compute the same thing:
  - `queryCurrentBalance` and `getOutstandingDebt` match **exactly** on `(entityId, partyId, projectId)` using `IS NOT DISTINCT FROM`. A `null` project means "only project-less rows", not "all projects".
  - `querySummary` returns one row per `(entity, party, project)`.
  - `computeReconciliation` and `supplierBalanceAsOf` are supplier-wide.
  - `lay_hang` rows always carry a project, because `commitPeriodClose` rejects deliveries without one. A `thue_hd` row created from the Phase 5 tab has "Công trình tuỳ chọn", which is usually null.
- **Failure scenario:**
  - (a) The integration test only passes if the fixture pins the opening balance, `lay_hang` and `thue_hd` to one `(entity, project)` tuple. The plan does not specify this. With realistic data no single row of `querySummary` / `queryCurrentBalance` equals 350.876.111.
  - (b) Phase 5's "Nợ hiện tại" needs one `getMaterialCurrentBalance` call per (entity, project) tuple. That is an N+1 server-action loop, each call repeating auth.
  - (c) The payment module's `congNo` auto-fill is keyed by the item's `projectId`, so it never sees project-less `thue_hd`. The tax increases debt in đối chiếu but not in the payment-round cap.
- **Evidence:**
  - `lib/ledger/ledger-aggregations.ts:247,261` (`"projectId" IS NOT DISTINCT FROM ${projectId ?? null}`)
  - `lib/ledger/ledger-aggregations.ts:66` (`GROUP BY "entityId", "partyId", "projectId"`)
  - `lib/ledger/balance-service.ts:164-170` (exact tuple join)
  - `lib/payment/payment-service.ts:209` (`getOutstandingDebt({ ..., projectId })`)
  - `lib/cong-no-vt/material-ledger-service.ts:288-296` (`getMaterialCurrentBalance(entityId, partyId, projectId?)`)
  - `lib/vat-tu-ncc/period-close-service.ts:225-232` (missing project → reject)
- **Suggested fix:**
  - State the fixture grain explicitly. Assert supplier-level equality only against `computeReconciliation`, a summed `querySummary`, and `queryWindowByParty`.
  - Add one supplier-wide balance query, for example an exported pure helper next to `queryWindowByParty`, for the Thanh toán tab.
  - Make `thue_hd` require a project, or document that the payment-round `congNo` excludes project-less tax.

## Finding 3: The import path and the labor ledger are only half-classified; the "hide `thue_hd` for labor" default is UI-only
- **Severity:** High
- **Location:** Phase 1, "Context" ("Hiện có 6 chỗ phân loại chép tay"), "Files" (`cong-no-vat-tu.parse.ts`, `cong-no-nc/schemas.ts`, `allowedTypes`). plan.md question 4.
- **Flaw:**
  - The inventory misses two zod enums that validate imported rows. Phase 1 makes `normalizeTxType` return `thue_hd`, but the adapter's `TxSchema` still allows only 3 values, so every imported "Thuế…" row fails validation.
  - The parser is **shared** with the labor adapter, so labor imports would also start emitting `thue_hd`.
  - Phase 1 widens `lib/cong-no-nc/schemas.ts` to `z.enum(TRANSACTION_TYPES)`, so the server accepts `thue_hd` on the labor ledger. "Default: ẩn" for labor exists only as a client prop (`allowedTypes`).
- **Failure scenario:**
  - The material Excel import of "Nhập Liệu" containing "Thuế HĐ" fails with a zod error, a regression from today's behaviour, where it imports as `lay_hang`.
  - A labor import or a direct server-action call writes `thue_hd` to the labor ledger. The NC grid then renders a select value that is not in its option list.
  - The Phase 1 step 8 grep (`dieu_chinh`) would not catch either enum, because they live in `lib/import`.
- **Evidence:**
  - `lib/import/adapters/cong-no-vat-tu.adapter.ts:29` and `lib/import/adapters/cong-no-nhan-cong.adapter.ts:29`: `transactionType: z.enum(["lay_hang", "thanh_toan", "dieu_chinh"])`
  - `lib/import/adapters/cong-no-nhan-cong.adapter.ts:20,70` (imports and calls the same `parseTxSheet`)
  - `lib/import/adapters/cong-no-vat-tu.parse.ts:15-19`
  - `lib/cong-no-nc/schemas.ts:20`
- **Suggested fix:**
  - Add both adapter enums to Phase 1.
  - Pass `ledgerType` (or an allowed-types list) into `parseTxSheet` so that labor never maps to `thue_hd`.
  - If labor must not carry tax, keep `lib/cong-no-nc/schemas.ts` at 3 values (server-side) instead of relying on `allowedTypes`.

## Finding 4: The Phase 4 contiguity rule permanently orphans backdated deliveries and payments
- **Severity:** High
- **Location:** Phase 4, "Quy tắc biên kỳ" rules 2–3 and `suggestNextPeriod`.
- **Flaw:** The period lock only rejects writes whose date is **covered** by a signed period. Dates before the first signed `periodFrom`, or between unsigned markers, are still writable. Once any period is signed, rule 3 forces `from = max(signed periodTo) + 1`. `suggestNextPeriod` uses `earliestOpenDeliveryDate` only when nothing is signed.
- **Failure scenario:**
  - Nam Hương signs 01/4→27/4.
  - A cán bộ vật tư then enters a phiếu dated 25/3, which is allowed because no signed period covers it.
  - The phiếu can never be closed: any range containing 25/3 violates rule 3, and the suggestion never proposes it.
  - It never becomes a `lay_hang` event, so `kiem-tra-khop` reports it as an orphan forever and the supplier's debt is understated.
  - The same applies to a `thanh_toan` / `thue_hd` entered with a date before the first signed period. It changes the opening (A) of no reconciliation, yet shifts `supplierBalanceAsOf` for later periods. That conflicts with "kỳ đã ký bất biến": the signed period's closing no longer equals the next opening.
- **Evidence:**
  - `lib/vat-tu-ncc/period-lock.ts:13-27` (covering-only check)
  - `lib/vat-tu-ncc/period-recon-check-service.ts:5` (orphan detection)
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:86-99` (opening = everything `<= asOf`)
  - Plan quote: "Nếu có kỳ đã ký: `from` = `max(periodTo đã ký) + 1 ngày`"
- **Suggested fix:**
  - Extend `assertPeriodOpen` to reject any date `<= max(signed periodTo)` for the supplier ("no writes before the signed frontier").
  - Add a test that writes a backdated phiếu and a backdated payment after the first sign.

## Finding 5: The per-supplier lock does not cover reconciliation create/update or ledger writes, so the sign snapshot can race
- **Severity:** High
- **Location:** Phase 4, "Files" (`reconciliation-service.ts` uses `validatePeriodBounds`) and step 5 (concurrency test only on `commitPeriodClose`). Phase 5 success criterion "bị chặn trong kỳ đã ký".
- **Flaw:**
  - `createReconciliation` and `updateReconciliation` run without a transaction or advisory lock. Adding `validatePeriodBounds` there is check-then-act. Two concurrent creates, or a create racing `commitPeriodClose`, can insert overlapping markers.
  - Ledger writes (`LedgerService.create/update/softDelete` and `syncClosedRoundToLedger`) call `assertPeriodOpen` outside any lock. `signReconciliation` holds the supplier lock while it snapshots.
- **Failure scenario:**
  - Two users submit 26/5→26/6 and 27/5→26/6 at the same time via the reconciliation form. Both pass validation and both rows are created. That violates rule 4, and the plan's concurrency test does not exercise this path.
  - Separately, a kế toán posts a `thue_hd` on the Phase 5 tab at the moment the NCC signs:
    - `assertPeriodOpen` sees the period unsigned.
    - The sign transaction snapshots without the row and commits.
    - The insert commits into a now-signed period.
    - Result: live ledger ≠ frozen snapshot.
- **Evidence:**
  - `lib/vat-tu-ncc/reconciliation-service.ts:22-41, 43-63` (no `$transaction`, no lock)
  - `lib/ledger/ledger-service.ts:42-46, 81-82` (check with no lock)
  - `lib/payment/payment-ledger-sync.ts:30`
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:306-309` (lock held only by sign)
- **Suggested fix:**
  - Wrap reconciliation create/update in `$transaction` with `pg_advisory_xact_lock(hashtext('vat-tu-close:'||supplierId))`.
  - For material ledger writes, take the same lock (or a shared variant) inside a transaction before `assertPeriodOpen`.
  - Extend the `Promise.allSettled` test to `createReconciliation` and to ledger-write vs sign.

## Finding 6: `queryDebtMatrix` output is not display-ready, and the "Kỳ NCC" preset conflicts with flexible bounds
- **Severity:** High
- **Location:** Phase 3, "Context" ("component đã tồn tại, chưa trang nào dùng") and "Files" (`tong-hop/page.tsx` calls `getMaterialDebtMatrix({from, to, entityIds})`).
- **Flaw:**
  - `queryDebtMatrix` hard-codes `partyName: ""`, and `getMaterialDebtMatrix` does not enrich it. The monthly action does enrich: it looks up suppliers and sorts by name.
  - `DebtMatrix` needs an `entities` prop. Phase 3 never says where entity names or ordering come from. The Excel builder needs the same lookup, so it would be implemented twice.
  - The "Kỳ NCC 27→26" preset is global, but Phase 4 makes each supplier's periods flexible (01/4→27/4, 28/4→26/5).
- **Failure scenario:**
  - `/cong-no-vt/tong-hop` renders every row as "NCC #12", unsorted, and the sticky first column is useless.
  - The Excel export and the screen sort differently if only one side sorts by name.
  - With preset Kỳ NCC 5/2026 (27/4→26/5), Nam Hương's LH/Trả include the 27/4 phiếu from its signed 01/4→27/4 period. So the matrix never matches the đối chiếu B/C for the same "kỳ". The Phase 6 runbook compares only "Nợ" under "Toàn bộ", which hides this.
- **Evidence:**
  - `lib/ledger/ledger-aggregations.ts:339-344` (`partyName: ""`)
  - `lib/cong-no-vt/material-ledger-service.ts:298-300` (no enrichment) vs `:264-281` (`getMaterialMonthlyReport` enriches and sorts)
  - `components/ledger/debt-matrix.tsx:30-34, 158` (requires `entities`, falls back to `${partyLabel} #${row.partyId}`)
  - Plan quote (Phase 4 Context): "Nam Hương 01/4→27/4, 28/4→26/5"
- **Suggested fix:**
  - Enrich names, sort, and load the entity list in one server function (`getMaterialDebtMatrixView`) used by both the page and the Excel builder.
  - Label the preset "Kỳ chuẩn 27→26" and document that it does not equal per-supplier signed periods, or hide it on `tong-hop`.

## Finding 7: The legacy-URL claim is false; the existing redirect throws away the new period params
- **Severity:** Medium
- **Location:** Phase 3, "Files" (bao-cao-thang VT/NC: "fallback `first*EntityWithActivity` lấy năm/tháng của `to ?? today`"). plan.md success criterion "URL cũ `?year=&month=` vẫn chạy".
- **Flaw:**
  - When `entityId` is absent, both monthly pages redirect to a hard-coded `?year=${year}&month=${month}&entityId=${fallback}`. The plan only changes how year/month are derived, not this redirect.
  - The redirect target is a legacy URL, which the new resolver reads in `legacyMode "month"`.
  - `firstEntityWithActivity` filters with `EXTRACT(YEAR/MONTH)`, so it is not window-aware.
- **Failure scenario:**
  - The user opens `/cong-no-vt/bao-cao-thang?period=week&y=2026&w=41` (no entity yet).
  - The page redirects to `?year=2026&month=10&entityId=3`, and the selector silently becomes "Tháng 10".
  - For preset `year`/`all`, the fallback entity is chosen by activity in a single month and may have no rows in the requested window, showing an empty report.
  - The NC page has the same problem.
- **Evidence:**
  - `app/(app)/cong-no-vt/bao-cao-thang/page.tsx:20-32` (redirect line 31)
  - `app/(app)/cong-no-nc/bao-cao-thang/page.tsx:36` (same structure)
  - `lib/ledger/ledger-service.ts:242-252` (`EXTRACT(YEAR FROM date) = ${year} AND EXTRACT(MONTH FROM date) = ${month}`)
- **Suggested fix:**
  - Rebuild the redirect from `resolveReportPeriod(...).params` plus `entityId`.
  - Change `firstEntityWithActivity` to accept `{from, to}`.
  - Add a page-level test (or a `resolveReportPeriod` round-trip test) for `params → redirect → params` stability.

## Finding 8: The "P4 ∥ P5 ∥ P2/P3 không chung file" claim and the Phase 5 tab gating do not hold
- **Severity:** Medium
- **Location:** plan.md "Phases" ("không chung file với nhau hay với P2/P3"). Phase 5, "Files" (layout TABS gated by `canAccessEntitlement(userId, "cong-no-vt", …)`, page "Nợ hiện tại").
- **Flaw:**
  - (a) Phase 5 needs a supplier-wide balance (Finding 2), and no exported action provides one. `supplierBalanceAsOf` is private inside `reconciliation-derive-service.ts`, which Phase 4 edits, and the plan never mentions exporting it. Ledger aggregation helpers live in `ledger-aggregations.ts` / `material-ledger-service.ts`, which Phase 2 owns. Delivering the "Nợ hiện tại" card forces Phase 5 into a P2- or P4-owned file while they run in parallel.
  - (b) The supplier `layout.tsx` has no session or `userId` today, so the plan's gating needs new auth wiring in the layout.
  - (c) `canAccessEntitlement` does not apply the rollout gate (`isModuleReleased`). The tab can therefore appear for a user whose every `cong-no-vt` action throws "Module đang phát triển".
  - (d) "Dòng từ đợt thanh toán read-only" is enforced only in the UI. The server's `patchMaterialTransaction` / `softDeleteMaterialTransaction` never check `paymentRoundItemId`.
- **Failure scenario:**
  - Merge conflicts appear in `material-ledger-service.ts` or `reconciliation-derive-service.ts` between parallel branches.
  - A non-admin with `cong-no-vt` entitlement, while the module is still "development", clicks the tab and gets an error page.
  - A user with `cong-no-vt` edit calls `softDeleteMaterialTransaction(id)` on a payment-round row. That removes a real disbursement from the ledger while the round stays "closed".
- **Evidence:**
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:86` (`async function supplierBalanceAsOf`, not exported)
  - `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx:21-30` (no session; only `requireActiveAdmin`)
  - `lib/acl/released-module-request.ts:34-41` (entitlement first, then the `isModuleReleased` gate)
  - `lib/cong-no-vt/material-ledger-service.ts:46-52, 67-100` (no `paymentRoundItemId` check)
- **Suggested fix:**
  - Assign the supplier-balance helper to Phase 1, which already owns `reconciliation-derive-service.ts` and `ledger-aggregations.ts`, so P2/P4/P5 only consume it.
  - Gate the tab with the same check as `requireReleasedModuleRequest`, or catch `ModuleRequestError` in the page.
  - Reject patch/delete server-side when `paymentRoundItemId != null`.

## Finding 9: Price auto-fill can silently overwrite saved prices in "Sửa đầy đủ"
- **Severity:** Medium
- **Location:** Phase 5, "Files" (`delivery-form.tsx`: "khi `itemId`/`date` đổi và field chưa dirty thì điền `resolveQuotePrice`"; `delivery-grid.tsx`: "thêm `unitPrice` vào `defaultValues`").
- **Flaw:**
  - The same `DeliveryForm` is used for create and edit. The form already uses `useWatch` on `itemId`.
  - An effect keyed on watched `itemId`/`date` runs on mount. In edit mode `unitPrice` comes from `defaultValues`, so it is not dirty, and the effect will replace it with the quote price.
  - Changing only the date of an existing phiếu also reprices it without asking. The plan gives no "create-only" or "changed from default" condition.
- **Failure scenario:** A cán bộ opens "Sửa đầy đủ" on a phiếu priced 1.900 to fix the công trình. The current quote (24/04) is 1.850. On save, `updateDelivery` stores 1.850 and `totalAmount` is recomputed. The next `commitPeriodClose` uses `d.unitPrice` (1.850) when no override is sent, so the ledger amount changes without anyone choosing a new price.
- **Evidence:**
  - `components/vat-tu-ncc/delivery-grid.tsx:170-181` (edit `defaultValues`), `:211-215` (same `DeliveryForm` for edit)
  - `components/vat-tu-ncc/delivery-form.tsx:24-36` (`useForm` / `useWatch`)
  - `lib/vat-tu-ncc/period-close-service.ts:240-243` (falls back to the stored `d.unitPrice`)
- **Suggested fix:**
  - Auto-fill only when `!defaultValues` (create mode), or when the watched value differs from its default value.
  - In edit mode show the hint with a "Dùng" button only.
  - Add a component test.

## Finding 10: The dynamic-pattern `revalidatePath` choice breaks repo convention and misses the page that shows the new tax block
- **Severity:** Medium
- **Location:** Phase 1, "Files" (`material-ledger-service.ts`: `revalidatePath("/vat-tu-ncc/[supplierId]/thanh-toan", "page")` and `.../doi-chieu`, "page").
- **Flaw:**
  - Next 16 docs say the pattern must mirror the route file structure. Their own examples include the route group (`'/(main)/blog/[slug]'`), while these pages live under `app/(app)/…`.
  - The docs also say a `page` pattern does **not** invalidate nested pages (`/blog/[slug]` does not cover `/blog/[slug]/[author]`). The "D. Thuế hoá đơn" block lives at `/doi-chieu/[reconciliationId]`, which is nested under `/doi-chieu`.
  - The repo convention everywhere else is literal paths with the supplier id. `createMaterialTransaction` already has `input.partyId`.
- **Failure scenario:** The kế toán records a `thue_hd` in the Thanh toán tab, then navigates to an already-visited reconciliation detail page. With a pattern that either does not match the `(app)` group or does not reach the nested page, the cached RSC payload shows the old total without block D. The Phase 5 manual check "mở đối chiếu thấy khối D" passes only on a cold navigation.
- **Evidence:**
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md:25-26, 146-151` (pattern semantics, route-group example, page type excludes nested pages)
  - Literal convention: `lib/vat-tu-ncc/delivery-service.ts:68-69`, `lib/vat-tu-ncc/reconciliation-derive-service.ts:335`, `lib/vat-tu-ncc/period-close-service.ts:279-281`
  - `lib/cong-no-vt/material-ledger-service.ts:16-18` (`revalidateAll()` takes no party, and `softDeleteMaterialTransaction` selects only `ledgerType`, lines 46-48)
- **Suggested fix:**
  - Pass `partyId` into `revalidateAll(partyId?)` and call `revalidatePath(`/vat-tu-ncc/${partyId}`, "layout")`. That literal path plus layout type covers `thanh-toan`, `doi-chieu` and `doi-chieu/[id]`.
  - Select `partyId` in the delete and patch paths.

---

## Verification Results (Scope Auditor: state additions, lifetime, duplication)

| # | State addition (phase) | Lifetime | Instantiation / consumer sites (grep) | Duplication check | Verdict |
|---|---|---|---|---|---|
| 1 | `TRANSACTION_TYPES`, `TRANSACTION_TYPE_LABELS`, `DEBT_INCREASE_TYPES`, `PERIOD_LOCKED_TYPES` in `lib/ledger/transaction-classification.ts` (P1) | Process-global immutable module constants | Replaces `lib/ledger/ledger-types.ts:4`, `lib/cong-no-vt/schemas.ts:20`, `lib/cong-no-nc/schemas.ts:20`, `components/ledger-grid/transaction-grid.tsx:69-73`, `components/ledger/transaction-form-dialog.tsx:27-29`, `components/ledger/transaction-grid.tsx:73-75`, `lib/ledger/ledger-service.ts:45`, `lib/cong-no-vt/material-ledger-service.ts:118` | **Leftover duplicates not in plan:** `lib/import/adapters/cong-no-vat-tu.adapter.ts:29`, `lib/import/adapters/cong-no-nhan-cong.adapter.ts:29`, `lib/import/adapters/cong-no-vat-tu.parse.ts:15` return type; `lib/tai-chinh/dashboard-service.ts:107,120`, `lib/tai-chinh/pr-sync-service.ts:128` (ELSE-positive CASE, so `thue_hd` is correct there; the claim is verified) | **FAILED** (2 enums missed; see F3) |
| 2 | `SummaryRow.thueHdTt/Hd` (P1) | Request | Producer `lib/ledger/ledger-aggregations.ts:93-107`; consumers `components/ledger/ledger-overview-shell.tsx:17,40`, `lib/export/templates/doi-chieu.ts:29`, `test/integration/vat-tu-ncc-pilot.integration.test.ts:187`, `test/performance/n-plus-one.test.ts:44` | Sits next to the existing `dieuChinhTt/Hd`; `balance` formula must change in SQL line 87-88. No name collision | PASS (consumers enumerable; `tsc` catches mocks in `doi-chieu.template.test.ts`) |
| 3 | `ReconComputed.taxRows/totalTax` + snapshot JSON (P1) | Request when unsigned; **durable** (JSONB in `signedSnapshotJson`) when signed | `lib/vat-tu-ncc/reconciliation-derive-service.ts:48-59, 213-216, 319-330`; consumers `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/[reconciliationId]/page.tsx`, `doi-chieu/page.tsx`, pilot test | Old snapshots lack the fields, and `getReconciliationView` casts with `as unknown as ReconComputed` (line 215), so the default `?? []` must be applied explicitly; `thue_hd` currently falls into `adjustRows` via the `else` branch (line 164-166). Removing it from adjust must not double-count | PASS with condition |
| 4 | `otherAmount` in `listReconciliationsDerived` (P1) | Request (derived) | `reconciliation-derive-service.ts:262-298` → `doi-chieu-client.tsx` | Derived from the 4 snapshot columns; no duplicate | PASS |
| 5 | `LedgerTransactionFilter.transactionTypes` (P1) | Request | `lib/ledger/ledger-types.ts:26-35`, `lib/ledger/ledger-service.ts:49-58` | **Duplicates** the existing `transactionType?: TransactionType` (same filter, two shapes); precedence when both are set is unspecified | FAILED (merge into one field or define precedence) |
| 6 | `REVALIDATE_PATHS += "/cong-no-vt/tong-hop"` + 2 dynamic patterns (P1) | Process-global constant; effect is per-request cache invalidation | `lib/cong-no-vt/material-ledger-service.ts:14-19`, called from every write action | Repo convention is literal per-supplier paths (`delivery-service.ts:68`, `period-close-service.ts:279`) | FAILED (see F10) |
| 7 | URL params `period,y,q,m,w,from,to` + legacy `year,month` (P2/P3) | Request (URL) | `app/(app)/cong-no-{vt,nc}/{bao-cao-thang,chi-tiet}/page.tsx`; `components/ledger/detail-report-filter.tsx` | Two parallel encodings of the same state; the server redirect re-emits the legacy encoding (`bao-cao-thang/page.tsx:31`). `period` key reused with different value domain in `components/tai-chinh/obligation-period-selector.tsx`, `components/van-hanh/period-filter.tsx` (separate pages, no collision) | FAILED (see F7) |
| 8 | `lib/ledger/report-period.ts` (P2) | Pure, stateless | New; consumers 5 pages + Excel route | **Duplicates** `lib/tai-chinh/state-obligation-matrix-period.ts:9-28` (UTC year/quarter/month `periodBounds`, half-open, reusable) and `lib/van-hanh/period.ts`; the plan acknowledges these utilities but not the two existing **selector components** `components/tai-chinh/obligation-period-selector.tsx`, `components/van-hanh/period-filter.tsx` (both already do `useSearchParams` + `router.push` param merging, the same job as the new `use-report-period-url.ts`) | DONE_WITH_CONCERNS (justified for ISO week/ncc/custom, but 3rd selector + 3rd URL hook) |
| 9 | `DetailReportFilters.from/to` alongside `year/month` (P2) | Request | `lib/cong-no-vt/balance-report-service.ts:60-67, 100-113`; passthrough `lib/cong-no-vt/material-detail-report-service.ts:12-16`, `lib/cong-no-nc/balance-report-service.ts:31-35` | Two ways to express the cutoff. **Plan cites the wrong file:** "`getMaterialDetailReport` truyền tiếp" is listed under `material-ledger-service.ts`, but it lives in `material-detail-report-service.ts:12`. `test/unit/module-release-entrypoints.test.ts:161-167` pins `balance-report-service.ts` as non-`"use server"` and requires the guard string in `material-detail-report-service.ts` | DONE_WITH_CONCERNS |
| 10 | `getMaterialWindowReport` / `getLaborWindowReport` server actions (P2) | Request (server action) | `lib/cong-no-vt/material-ledger-service.ts`, `lib/cong-no-nc/labor-ledger-service.ts` | Must satisfy `module-release-entrypoints.test.ts:131-156` (direct guard per exported async fn); `getMaterialMonthlyReport` becomes a thin duplicate, so keep one | PASS |
| 11 | `MonthlyReport` prop `year, month` → `periodLabel` (P3) | Request props | `components/ledger/monthly-report.tsx:22-23,52,76`; callers `app/(app)/cong-no-vt/bao-cao-thang/page.tsx:68`, `app/(app)/cong-no-nc/bao-cao-thang/page.tsx:68`; shim `components/cong-no-vt/monthly-report.tsx:4` | Only 2 callers + 1 shim; claim verified safe | PASS |
| 12 | `DebtMatrix` 6-col groups, `hideZero` (P3) | Client component props | `components/ledger/debt-matrix.tsx` (no page consumer); shim `components/cong-no-vt/debt-matrix.tsx:4` (no importer) | `DebtMatrixCell` (`debt-matrix.tsx:12-21`) duplicates `MatrixCell` (`lib/ledger/ledger-types.ts`); sort key `${entity.id}:${col}` **already exists** (`debt-matrix.tsx:65-72`), so the plan's "sort key `${entityId}:${colKey}`" item is a no-op; `colTotals` are computed from unfiltered `rows` (line 88-96), so `hideZero` must filter before totals or the footer disagrees with visible rows. Shim stays dead | DONE_WITH_CONCERNS |
| 13 | `queryDebtMatrix({from,to})` signature (P2) | Request | Callers `lib/ledger/ledger-service.ts:271-275`, `lib/cong-no-vt/material-ledger-service.ts:298`, **`lib/cong-no-nc/labor-ledger-service.ts:296`** (labor also inherits), `lib/ledger/__tests__/ledger-aggregations.test.ts:93` | `partyName` never filled (`ledger-aggregations.ts:341`) | FAILED (see F6) |
| 14 | `allowedTypes` prop on `LedgerTransactionGrid` (P1) | Client props | `components/ledger-grid/transaction-grid.tsx:106,125`; `app/(app)/cong-no-nc/nhap-lieu/page.tsx` | UI-only restriction duplicating what the schema should enforce | FAILED (see F3) |
| 15 | Advisory lock key `vat-tu-close:${supplierId}` (P4) | DB transaction-scoped (`pg_advisory_xact_lock`), cross-process | `period-close-service.ts:191`, `reconciliation-derive-service.ts:309,349` | Not taken by `reconciliation-service.ts` create/update nor ledger writes | FAILED (see F5) |
| 16 | `boundsError`, `suggestNextClosePeriod` (P4) | Request | `period-close-service.ts`, `chot-ky-client.tsx:58,103`; pilot test call sites `test/integration/vat-tu-ncc-pilot.integration.test.ts:105-106,115-116,211-212,233-240` (4 sites / 8 calls, plan says "5 call site") | `findSignedOverlap` (`period-close-service.ts:50-60`) and inline overlap query (`:193-202`) already exist, so `validatePeriodBounds` must replace both, not add a third | DONE_WITH_CONCERNS |
| 17 | `quotes`, `lastPrices` props to `DeliveryGrid`/`DeliveryForm` (P5) | Request snapshot held in client; stale until `router.refresh` | `app/(app)/vat-tu-ncc/[supplierId]/ngay/page.tsx:22-41`, `components/vat-tu-ncc/delivery-grid.tsx:70,208-215` | Client fallback "giá phiếu gần nhất" re-implements the server SQL in `period-close-service.ts:121-131` (which uses `date < from` and `DISTINCT ON`); the two can diverge. Also `createPriceQuote` is not in the plan's revalidate list (only `updatePriceQuote`), contradicting Phase 5 Risks | DONE_WITH_CONCERNS |
| 18 | `locked`, `fromRound` flags (P5) | Request | thanh-toan page | UI-only; server patch/delete has no `paymentRoundItemId` guard (`material-ledger-service.ts:46-100`) | FAILED (see F8) |
| 19 | TABS entry "Thanh toán" (P5) | Process-global constant + per-request filter | `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx:6-12` | Needs session wiring not present; gating ignores rollout gate | FAILED (see F8) |

Claims verified true (no finding): no CHECK constraint on `transactionType` (`prisma/migrations/20260504144425_add_ledger/migration.sql:6`, no matching CHECK in any migration); `components/ledger/debt-matrix.tsx` exists and is unused by pages; `lib/tai-chinh/*` ELSE-positive CASEs already count `thue_hd` as increase; `queryDebtMatrix` omits `dieu_chinh` (`ledger-aggregations.ts:307-310`); `balance-report-service.ts:112` uses local time; `MonthlyReport` has exactly two callers; the Excel figures (350.876.111, 255.005.120, 285.465.120, 286.465.120, 266.453.120, 256.005.120, 35.228.000) are arithmetically consistent with the stated fixtures; ISO week 41/2026 = 05/10–11/10 and week 53/2026 = 28/12/2026–03/01/2027 are correct.

Status: DONE_WITH_CONCERNS
Summary: 10 findings (1 Critical, 5 High, 4 Medium). The largest risk is the false "UTC-midnight ledger" invariant, which breaks windows, contiguity and period locks for payment-round and imported rows.
Concerns/Blockers: Next docs were read via Grep only (Read was blocked by the node_modules hook); the route-group matching behaviour of `revalidatePath` patterns was inferred from the doc examples, not tested at runtime.
