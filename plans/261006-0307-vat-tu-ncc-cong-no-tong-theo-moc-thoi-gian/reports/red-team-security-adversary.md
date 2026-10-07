# Red team: security adversary + fact checker

Plan: `plans/261006-0307-vat-tu-ncc-cong-no-tong-theo-moc-thoi-gian/` (plan.md, phase-01 … phase-06, evidence packet)
Date: 2026-10-06. Mode: read-only on source code, every claim grep-verified.

---

## Finding 1: The Thanh toán tab reuses a server action whose auth guard the client can switch off
- **Severity:** Critical
- **Location:** Phase 5, sections "Context" and "Files to Create / Modify" (`thanh-toan-client.tsx` … "sửa qua `patchMaterialTransaction`"). Also plan.md, "Bất biến" (relies on `module-release-entrypoints.test.ts` as the guard gate).
- **Flaw:** `patchMaterialTransaction(id, patch, client = prisma, authorized = false)` is an exported `"use server"` function. It skips `requireReleasedModuleRequest` whenever the caller passes `authorized = true`. Server-action arguments come from the client. A caller can send `(id, patch, undefined, true)`: `undefined` falls back to the default `prisma` client, and `true` skips the guard, including the session check. Phase 5 makes this action the edit path for a new tab, and its client bundle is reachable from `/vat-tu-ncc/*`. The plan claims "một cổng ghi, một luật quyền" (one write gate, one permission rule), but that rule is not enforced. The guard test does not catch it: `directGuard` only checks that the text `await requireReleasedModuleRequest("cong-no-vt"` appears somewhere in the function segment, and a conditional guard passes. The "read-only" protection for rows from đợt thanh toán (payment rounds, `paymentRoundItemId != null`) is UI-only. Neither `patchMaterialTransaction` nor `softDeleteMaterialTransaction` nor `LedgerService.update/softDelete` checks `paymentRoundItemId`.
- **Failure scenario:** Any logged-in user, even one without `cong-no-vt` rights, takes the action ID from the `thanh-toan` client chunk. They then call `patchMaterialTransaction(4711, {transactionType: "dieu_chinh", amountTt: "-500000000", partyId: 99}, undefined, true)`. The `material` row is rewritten with no ACL or release check. The period lock still blocks rows in signed periods, but rows in any open period are fully writable. A user who does have `cong-no-vt` edit rights can also edit or delete a `thanh_toan` row that came from a payment round. That breaks the 1:1 link the next `syncRoundToLedger` relies on (it finds the row by `paymentRoundItemId` and silently resurrects or overwrites it).
- **Evidence:**
  - `lib/cong-no-vt/material-ledger-service.ts:67-75`: `authorized = false,` / `if (!authorized) await requireReleasedModuleRequest("cong-no-vt", …)`
  - `lib/cong-no-nc/labor-ledger-service.ts:77-85`: same pattern for labor.
  - `app/(app)/cong-no-vt/nhap-lieu/page.tsx:65`: `patch: patchMaterialTransaction` is already handed to a client component, so the action ID is shipped to the browser.
  - `test/unit/module-release-entrypoints.test.ts` (`directGuard` regex + `segment.match(directGuard)`) checks text presence only.
  - `lib/payment/payment-ledger-sync.ts:53-60`: idempotency depends on `paymentRoundItemId`. `grep paymentRoundItemId lib` finds no write guard anywhere.
  - Plan quote, Phase 5: "Dòng sinh từ đợt thanh toán (`paymentRoundItemId != null`) chỉ đọc" (UI only).
- **Suggested fix:** Before Phase 5, split the action. Keep `patchMaterialTransaction(id, patch)` as an always-guarded export. Move the trusted variant to a non-exported internal helper (or a non-`"use server"` module) used by `bulkUpsert*`. Apply the same change to labor. Enforce `paymentRoundItemId == null` in `LedgerService.update/softDelete`, not in the client. Extend the guard test so it rejects `if (!…) await requireReleasedModuleRequest` and any exported parameter named `authorized`.

## Finding 2: The period lock is check-then-act; the per-NCC advisory lock does not cover ledger writes
- **Severity:** High
- **Location:** Phase 4, "Files to Create / Modify" (lock only in `commitPeriodClose`, `signReconciliation`, unsign) and "Tasks & Steps" 2–3. Phase 5, "Integration" (claims writes are blocked after signing).
- **Flaw:** `assertPeriodOpen` is a plain `findFirst` that runs outside any transaction or lock. The plan moves the advisory lock to `vat-tu-close:${supplierId}`, but only close, sign and unsign take it. The write paths do not: `LedgerService.create/update/softDelete`, which the Thanh toán tab uses; `createDelivery/updateDelivery`; and `syncRoundToLedger`. `createReconciliation`/`updateReconciliation` will now run `validatePeriodBounds` (read, then insert) and also take no lock. The concurrency test in Phase 4 covers only two `commitPeriodClose` calls.
- **Failure scenario:**
  - Write vs. sign race: user A enters a `thanh_toan` of 100.000.000 dated 20/5 in the Thanh toán tab. `assertPeriodOpen` passes because the period is not signed yet. User B clicks Ký (sign) on 28/4→26/5 at the same time. `signReconciliation` computes the snapshot without A's uncommitted row and commits; then A's insert commits. Result: a signed period whose live ledger differs from `signedSnapshotJson` by 100M. The `closing(k) = opening(k+1)` carry-over invariant is broken with no error.
  - Overlapping markers: two concurrent `createReconciliation` calls with overlapping ranges (for example 27/5→26/6 and 01/6→30/6) both pass validation and both insert.
  - Rolling deploy: the old lock key `…:{from}` and the new key `…:{supplierId}` do not exclude each other while both versions are running.
- **Evidence:**
  - `lib/vat-tu-ncc/period-lock.ts:30-41`: `assertPeriodOpen` takes no lock.
  - `lib/ledger/ledger-service.ts:43-47, 82, 124-126`: the check runs before insert, with no `$transaction` or lock.
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:309`: sign takes the lock, then `computeReconciliation(..., tx)`.
  - `lib/vat-tu-ncc/reconciliation-service.ts:22-42, 44-64`: create/update have no transaction or lock.
  - `lib/vat-tu-ncc/delivery-service.ts:52, 79-80, 106`: same check-then-act pattern.
  - Plan quote, Phase 4 Risks: "lock là `xact_lock`, giao dịch ngắn" (only says the lock is a short xact_lock; does not address the unlocked write paths).
- **Suggested fix:** Make `assertPeriodOpen` take a shared per-NCC lock inside the write transaction: `pg_advisory_xact_lock_shared(hashtext('vat-tu-close:'||supplierId))` for writes and the exclusive lock for sign/close/create-recon. Alternatively, have `signReconciliation` re-validate under `SERIALIZABLE`. Run `createReconciliation`/`updateReconciliation` inside a `$transaction` with the same lock. Add a concurrent write-vs-sign integration test. Document the deploy cut-over (the two lock keys must not coexist), or temporarily take both keys.

## Finding 3: "Kỳ đã ký bất biến với cả admin" (signed periods are immutable, even for admin) has unguarded write paths, and Phase 1 widens one of them
- **Severity:** High
- **Location:** plan.md "Bất biến"; Phase 1, "Files to Create / Modify" (import parser, `adminPatch`, `PERIOD_LOCKED_TYPES`).
- **Flaw:**
  - (a) The import adapter writes `ledger_transactions` with raw `INSERT` and never calls `assertPeriodOpen`. Phase 1 changes only `cong-no-vat-tu.parse.ts` (`normalizeTxType` → `thue_hd`). It leaves `TxSchema.transactionType = z.enum(["lay_hang","thanh_toan","dieu_chinh"])` in the adapter unchanged, so either every tax row from the import fails validation, or a later fix opens a new path for `thue_hd` into signed periods.
  - (b) Opening balances (`setOpeningBalance`, `deleteOpeningBalance`, `bulkUpsert…OpeningBalances`) have no period lock. `supplierBalanceAsOf` sums every opening balance of the NCC regardless of `asOfDate`, so any user with `cong-no-vt` edit rights changes the live opening of every signed period.
  - (c) `dieu_chinh` is outside `PERIOD_LOCKED_TYPES`, and `adminPatchMaterialTransaction` writes `totalTt` directly without recomputing. An admin can therefore change the amount of any `dieu_chinh` row dated inside a signed period.
- **Failure scenario:** After Nam Hương 28/4→26/5 is signed at closing 255.005.120, an editor changes an opening-balance row by +10.000.000. The 27/5→26/6 reconciliation, computed live, now opens at 265.005.120 while the signed snapshot closed at 255.005.120. Phase 2's `tong-hop` and `chi-tiet` reports show the live numbers and contradict the signed reconciliation. No guard fires.
- **Evidence:**
  - `lib/import/adapters/cong-no-vat-tu.adapter.ts:29` (enum has 3 values), `:189-200` (raw `INSERT INTO ledger_transactions`, no `assertPeriodOpen`).
  - `lib/import/adapters/cong-no-vat-tu.parse.ts:15-19`.
  - `lib/ledger/ledger-service.ts:290, 323`: opening-balance writes have no lock.
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:86-99`: `SUM("balanceTt") … WHERE "ledgerType"='material' AND "partyId"=…`, with no `asOfDate` filter.
  - `lib/cong-no-vt/material-ledger-service.ts:118-129`: `adminPatch` locks only `lay_hang|thanh_toan` and writes `totalTt` directly.
  - `grep -rn assertPeriodOpen lib`: only `ledger-service`, `material-ledger-service`, `payment-ledger-sync`, `delivery-service`. Nothing in import or opening balances.
- **Suggested fix:** Add `cong-no-vat-tu.adapter.ts` to Phase 1. Its `TxSchema` should use `z.enum(TRANSACTION_TYPES)`, and the commit step should call `assertPeriodOpen` per row for `PERIOD_LOCKED_TYPES`. Block opening-balance writes for an NCC that has any signed period (or require `asOfDate` < first signed `periodFrom` and filter by it). Make `adminPatch` refuse to edit any row inside a signed period. The plan already states that `dieu_chinh` must go into the *next* period.

## Finding 4: Flexible bounds let users sign a period that hides unclosed deliveries or leaves earlier history open forever
- **Severity:** High
- **Location:** Phase 4, "Quy tắc biên kỳ (`validatePeriodBounds`)" rules 1–4 and `suggestNextPeriod`. Phase 4, "Files": `signReconciliation` checks only contiguity.
- **Flaw:**
  - Rule 3 applies only "Nếu có kỳ đã ký" (if a signed period exists). The first period's `from` is just a suggestion: nothing stops it from starting after deliveries that have no `lay_hang` event yet.
  - `signReconciliation` only re-checks contiguity. It does not check that every delivery in `[from, to]` has a ledger event. With `createReconciliation` now accepting arbitrary ranges through `reconciliation-form.tsx`, a marker can be created, and then signed, for a range wider than what was actually closed.
  - After signing, the deliveries left without an event are locked by `assertPeriodOpen` and can no longer be closed (`commitPeriodClose` rejects any signed overlap). The debt disappears permanently.
  - Ledger rows dated before the first signed `periodFrom` are not covered by `findSignedPeriodCovering`. They stay editable and keep shifting the opening of the signed period.
- **Failure scenario:** The accountant closes 01/4→27/4 only. Someone creates a marker 01/4→26/6 through the reconciliation form; this passes because no period is signed yet and there is no overlap with another marker of different bounds after deleting the 01/4→27/4 marker. They sign it. The 05/6 and 25/6 deliveries (30.460.000) have no `lay_hang`, are now locked, and can never enter the ledger: real debt is under-reported. Alternatively, the first signed period starts on 28/4, and a `thanh_toan` dated 15/4 is still freely editable, changing A of the signed period.
- **Evidence:**
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts:302-338`: sign has no orphan-delivery check.
  - `lib/vat-tu-ncc/period-recon-check-service.ts:1-8`: orphan detection exists but is admin-only and not wired into sign.
  - `lib/vat-tu-ncc/period-lock.ts:18-26`: the lock covers only `[periodFrom, periodTo]`.
  - `lib/vat-tu-ncc/period-close-service.ts:193-203` (commit rejects signed overlap).
  - Plan quote: "3. Nếu có kỳ đã ký: `from` = `max(periodTo đã ký) + 1 ngày`" (if a signed period exists, `from` must be the day after the latest signed `periodTo`).
- **Suggested fix:** In `signReconciliation` (inside the lock), reject when any non-deleted delivery in `[from, to]` has no `lay_hang` event. Reuse the orphan query from `period-recon-check-service`. For the first signed period, require `from <= earliestOpenDeliveryDate` and lock everything before the first `periodFrom`: treat `[-inf, firstPeriodFrom)` as signed in `findSignedPeriodCovering` once any signed period exists.

## Finding 5: New window and export inputs are free-form strings with no boundary validation; errors leak and the client chooses the export label
- **Severity:** High
- **Location:**
  - Phase 2, "Files": `getMaterialWindowReport(window: {from: string|null; to: string|null}, entityId)`, and `getMaterialDebtMatrix` "nhận `from/to` dạng chuỗi ISO" (takes `from/to` as ISO strings).
  - Phase 2, `app/api/export/excel/route.ts` "nhận `from/to/label`" (accepts `from/to/label`).
  - Phase 3, route filename `cong-no-tong-hop-{from|toan-bo}-{to|den-nay}.xlsx`.
  - Phase 4, `previewPeriodClose(supplierId, range?: {from: string; to: string})` / `commitPeriodClose(supplierId, range, prices)`.
- **Flaw:**
  - None of these boundaries specifies a zod schema or a `^\d{4}-\d{2}-\d{2}$` check with UTC-midnight normalisation. `report-period.ts` parses page `searchParams` only. Server actions and the POST route receive raw client values.
  - A string like `"2026-05-27T00:00:00.001Z"` passes `new Date()` but breaks the exact-equality contiguity rule (`from = periodTo + 1 day`) and the overlap comparisons.
  - `"abc"` yields an Invalid Date that Prisma rejects. The route then returns `detail: String(err)` to the browser, which includes the Prisma query or engine message.
  - `from`/`to` are interpolated into `Content-Disposition`. Quotes break the header; CR/LF makes `new NextResponse` throw outside the `try`, so the request ends in an unhandled 500.
  - `label` comes from the client and is written into the title of an official export, so the client can label any numbers as "Kỳ đã ký …" (signed period …).
  - `commitPeriodClose` with a client-chosen range and no signed period has no upper bound on span. `{from:"1900-01-01", to:"2100-12-31"}` re-prices every delivery the NCC ever had in one transaction.
- **Failure scenario:** POST `/api/export/excel` `{template:"cong-no-tong-hop", params:{from:"x", to:"y\"; filename=evil.html"}}` produces either a 500 with internal error text (CWE-209) or a header-splitting attempt. Through `commitPeriodClose(id, {from:"2026-05-26T23:00:00Z", to:"2026-06-26"}, prices)`, the contiguity equality and the "trùng khít" (exact-match) idempotency check behave unpredictably.
- **Evidence:**
  - `app/api/export/excel/route.ts:123-125`: `detail: String(err)`.
  - `app/api/export/excel/route.ts:85, 132`: filename built from params.
  - `app/api/export/excel/route.ts:72-83`: today's numeric validation for `cong-no-monthly`, which the plan replaces with strings.
  - `lib/ledger/ledger-service.ts:61-62`: `new Date(dateFrom)` without validation.
  - `lib/vat-tu-ncc/period-close-service.ts:184-187`: the only input validation is price ≥ 0.
- **Suggested fix:** Add one `isoDateSchema` (regex + `Date.UTC` round-trip) in `report-period.ts`. Parse every `from/to` with it in the server actions, the route and `previewPeriodClose`/`commitPeriodClose`. Rebuild `label` on the server from the parsed window and ignore the client value. Build the filename from the normalised ISO dates only. Remove `detail` from the 500 response. Cap the close span (for example ≤ 92 days) unless the caller is admin.

## Finding 6: The cross-module permission design for the Thanh toán tab rests on wrong premises
- **Severity:** Medium
- **Location:** Phase 5, "Files": `layout.tsx` ("chỉ hiện khi `canAccessEntitlement(userId, "cong-no-vt", …)`", show the tab only if the user has `cong-no-vt` access) and `thanh-toan/page.tsx` ("`requireModuleAccess("vat-tu-ncc", read)` + kiểm `cong-no-vt` read/create/edit", plus a check for `cong-no-vt` read/create/edit). Phase 4: the new action `suggestNextClosePeriod`.
- **Flaw:**
  - `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx` has no session and no `userId`. Today it only calls `requireActiveAdmin().catch()`.
  - `canAccessEntitlement` ignores module release state. `canAccess` and `requireReleasedModuleRequest` do not. So while `cong-no-vt` is unreleased, the tab shows for non-admins and every action then throws `development`.
  - The plan never says which guard `suggestNextClosePeriod` (a new export in a `"use server"` file under `lib/vat-tu-ncc/`) must call, or at what level. It can be added as a plain read.
  - The guard test that the plan names as the safety net only scans `git ls-files`, so new untracked `lib/**` server actions are invisible until committed, and it accepts conditional guards (Finding 1).
  - Defaults diverge: the `tong-hop` page is open to every `cong-no-vt` reader, while its Excel export is admin-only. The same data, one click apart, gives policy theatre rather than real protection (Open Question 2 is unresolved).
- **Failure scenario:** The release flag for `cong-no-vt` is off and `vat-tu-ncc` is released. A kế toán (accountant) with an entitlement row sees the tab, submits, and gets a raw `ModuleRequestError`. The other path: an implementer writes `suggestNextClosePeriod` with `requireReleasedModuleRequest("vat-tu-ncc")` at the default read level, which is fine. But if they copy the pattern from `material-ledger-service.ts`, they use `"cong-no-vt"`, and the test fails only after commit.
- **Evidence:**
  - `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx:21-30`: no session.
  - `lib/acl/effective.ts:63-80` (`canAccessEntitlement`, no release check) vs `:125-133` (`canAccess` checks `isModuleReleased`).
  - `lib/acl/released-module-request.ts:34-41`.
  - `test/unit/module-release-entrypoints.test.ts` (`trackedLibServerActions` uses `git ls-files`).
  - `app/api/export/excel/route.ts:59-65`.
- **Suggested fix:**
  - In the layout, get the session via `auth.api.getSession` and use `canAccess` (which includes release).
  - State explicitly that `suggestNextClosePeriod` calls `requireReleasedModuleRequest("vat-tu-ncc")`.
  - Make `thanh-toan/page.tsx` call `requireModuleAccess("cong-no-vt", {minLevel: "read"})`, which includes release.
  - Resolve Q2 before Phase 3: either both the page and the export are reader-visible, or both are admin-only.

## Finding 7: `thue_hd` is enforced only in the UI for labor, and import precedence turns payments into debt increases
- **Severity:** Medium
- **Location:** Phase 1, "Files": `lib/cong-no-nc/schemas.ts` → `z.enum(TRANSACTION_TYPES)`, `allowedTypes` prop for `cong-no-nc/nhap-lieu` only, and `normalizeTxType` "nhận diện 'thuế'/'thue'/'tax' → `thue_hd` trước nhánh 'trả'" (detects "thuế"/"thue"/"tax" as `thue_hd` before the "trả" branch).
- **Flaw:**
  - Widening the labor zod enum makes `createLaborTransaction`/`bulkUpsertLaborTransactions` accept `thue_hd` server-side. Hiding it in the grid is not a control.
  - The labor ledger has no period lock at all (`assertMaterialPeriodOpen` returns early for labor).
  - Putting the "thuế" branch before "trả" classifies Excel labels such as "Trả thuế HĐ" or "Thanh toán tiền thuế" as a debt *increase* instead of a payment. That is a 2× sign error on import.
- **Failure scenario:** An import of "Quản Lý Công Nợ Vật Tư.xlsx" with a row "Trả thuế HĐ 00000232" of 11.448.000 adds 11.448.000 to the debt instead of subtracting it, a 22.896.000 gap. A labor user posts `thue_hd` through the server action; labor reports, which use the shared fragments, count it as an increase with no business meaning.
- **Evidence:**
  - `lib/cong-no-nc/schemas.ts:20`.
  - `lib/ledger/ledger-service.ts:44`: `if (this.ledgerType !== "material") return;`.
  - `lib/import/adapters/cong-no-vat-tu.parse.ts:17`: `s.includes("trả") || s.includes("tra")`.
- **Suggested fix:** Keep the `cong-no-nc` schema enum without `thue_hd` (a separate `LABOR_TRANSACTION_TYPES`), or reject it in `labor-ledger-service`. In the parser, check for payment words ("trả", "thanh toán", "ck") first; classify as `thue_hd` only for "thuế hđ"/"thuế hoá đơn" without a payment verb; add parser unit cases for both.

## Finding 8: Phase 2 edits the wrong file for the guarded detail report, and the file-ownership table is wrong
- **Severity:** Medium
- **Location:** Phase 2, "Files to Create / Modify": "Modify `lib/cong-no-vt/material-ledger-service.ts`: … `getMaterialDetailReport` truyền tiếp" (pass `from/to` through).
- **Flaw:** `getMaterialDetailReport` is not in `material-ledger-service.ts`. It lives in `lib/cong-no-vt/material-detail-report-service.ts`, a separate `"use server"` file that the guard test pins by name. The guard test also asserts that `lib/cong-no-vt/balance-report-service.ts` must *not* be `"use server"`. The plan's ownership table, used to justify running P4 and P5 in parallel, omits this file. An implementer following the plan will either add a duplicate export to `material-ledger-service.ts` (a second entrypoint with possibly drifting guards) or try to pass `from/to` straight through `balance-report-service.ts` and be tempted to add `"use server"` there. That would expose the unguarded cross-module `queryDetailReport({ledgerType})`, letting a `cong-no-vt` caller read `labor` data.
- **Failure scenario:** `queryDetailReport` takes `ledgerType` from its argument. If it becomes a server action, any `cong-no-vt` reader can call it with `ledgerType: "labor"` and read the whole labor ledger (a `cong-no-nc` privilege escalation).
- **Evidence:**
  - `lib/cong-no-vt/material-detail-report-service.ts:1, 12-16`.
  - `lib/cong-no-vt/balance-report-service.ts:100-103` (takes `ledgerType`).
  - `test/unit/module-release-entrypoints.test.ts` ("keeps cross-module query helpers outside the server-action trust boundary": `not.toMatch(/^\s*["']use server["'];/)` and `toContain('requireReleasedModuleRequest("cong-no-vt")')`).
  - `grep getMaterialDetailReport`: no hit in `material-ledger-service.ts`.
- **Suggested fix:** Replace the Phase 2 file entry with `lib/cong-no-vt/material-detail-report-service.ts` and `lib/cong-no-nc/balance-report-service.ts`. Add an explicit note: "`balance-report-service.ts` stays a non-action module; `ledgerType` is fixed by the wrapper".

---

## Verification Results

Tier: Full. Claims checked: 94. Verified: 86 | Failed: 6 | Unverified: 2.

Sample of VERIFIED claims (file:line):
- Phase 1:
  - `querySummary` FILTER 54–59 (`lib/ledger/ledger-aggregations.ts:54-59`)
  - `queryMonthlyByParty` 120 / CASE 141–177 (`:120`, `:143-177`)
  - `queryCurrentBalance` 255–256 (`:255-256`)
  - `queryDebtMatrix` 287 / 307–310 with no `dieu_chinh` (`:287`, `:307-310`)
  - `balance-service` FILTER 143–148 (`lib/ledger/balance-service.ts:143-148`)
  - `balance-report-service` CASE (`:135-150`, plan says 134–149, off by one)
  - `supplierBalanceAsOf` 95 (`reconciliation-derive-service.ts:95`)
  - `assertMaterialPeriodOpen` lay_hang|thanh_toan (`ledger-service.ts:43-47`)
  - `adminPatch` guard 118 (`material-ledger-service.ts:118`)
  - `REVALIDATE_PATHS` (`material-ledger-service.ts:13`)
  - zod enums (`lib/cong-no-vt/schemas.ts:20`, `lib/cong-no-nc/schemas.ts:20`)
  - `TX_TYPES` 69–73 (`components/ledger-grid/transaction-grid.tsx:69`)
  - form-dialog 27–29 (`transaction-form-dialog.tsx:26-29`)
  - ledger grid 73–75 / cast 142 (`components/ledger/transaction-grid.tsx:73,142`)
  - `normalizeTxType` (`cong-no-vat-tu.parse.ts:15`)
  - `doi-chieu` template uses `layHangTt` (`lib/export/templates/doi-chieu.ts:16`)
- Phase 2:
  - local-time cutoff 112 (`balance-report-service.ts:112`)
  - `detailedDebtMatrix` 271 (`ledger-service.ts:271`)
  - `lib/van-hanh/period.ts`, `lib/tai-chinh/state-obligation-matrix-period.ts` exist
  - `buildCongNoMonthlyExcel(ledgerType, year, month, entityId)` (`cong-no-monthly.ts:24-29`)
  - route case `cong-no-monthly` (`route.ts:72`)
  - `getLaborDetailReport` (`lib/cong-no-nc/balance-report-service.ts:31`)
  - `firstLaborEntityWithActivity` (`labor-ledger-service.ts:281`)
- Phase 3:
  - `components/ledger/debt-matrix.tsx` exists and is unused by pages (only re-export `components/cong-no-vt/debt-matrix.tsx`)
  - `addSheet` flat header, SheetJS (`excel-exporter.ts:16,36`)
  - admin-only export (`route.ts:59`)
  - `ExcelExportButton`/`PrintButton` (`components/export-buttons.tsx:21,65`)
  - breadcrumb `tong-hop` already present (`breadcrumb.tsx:57`)
  - `navLinks` (`app/(app)/cong-no-vt/page.tsx:19`)
  - `requireModuleAccess("cong-no-vt", {minLevel:"read", scope:"module"})` pattern (`cong-no-vt/chi-tiet/page.tsx:18`)
  - both `bao-cao-thang` filters, `monthly-report.tsx`, `detail-report-filter.tsx`, `month-year-picker.tsx`, `date-input.tsx`, sortable-table files exist
- Phase 4:
  - `previewPeriodClose` 104 (`period-close-service.ts:104`)
  - `commitPeriodClose` 175 (`:175`)
  - advisory locks 191 / 309 / 349 (`period-close-service.ts:191`, `reconciliation-derive-service.ts:309,349`)
  - `createReconciliation` 22 exact-match only (`reconciliation-service.ts:22-31`)
  - `chot-ky-client.tsx:58,103`
  - pilot call sites 105–116, 211–212, 233–240 (`vat-tu-ncc-pilot.integration.test.ts`)
  - `period.test.ts`, `reconciliation-form.tsx` exist
- Phase 5:
  - `updatePriceQuote` exists (`price-quote-service.ts:40`)
  - `resolveQuotePrice` (`quote-resolver.ts:14`)
  - `deliverySchema.unitPrice` (`lib/vat-tu-ncc/schemas.ts:10`)
  - `delivery-form.tsx` has no `unitPrice` (grep empty)
  - `delivery-grid.tsx` `defaultValues` without `unitPrice` (`:170-181`)
  - TABS (`[supplierId]/layout.tsx:6-12`)
  - `createMaterialTransaction` guard create (`material-ledger-service.ts:29`)
  - `findSignedPeriodCovering` (`period-lock.ts:13`)
  - `getMaterialCurrentBalance` (`:288`)
  - `listPriceQuotes` (`price-quote-service.ts:15`)
- Phase 6:
  - `ke-toan.md` §3 Công Nợ Vật Tư (`:30`)
  - `can-bo-vat-tu.md` §3–5 (`:28,68,85`)
  - `system-architecture.md` vật tư NCC section (~`:150-172`)
  - `docs/project-changelog.md` exists
  - `risk:verify` script (`package.json:24`)

FAILED claims:
1. Phase 2, "Modify `lib/cong-no-vt/material-ledger-service.ts` … `getMaterialDetailReport` truyền tiếp": the function is at `lib/cong-no-vt/material-detail-report-service.ts:12`, not in `material-ledger-service.ts`.
2. Phase 1, "Hiện có 6 chỗ phân loại chép tay" (there are 6 hand-copied classification sites) / file list: the import adapter's own enum `lib/import/adapters/cong-no-vat-tu.adapter.ts:29` (`z.enum(["lay_hang","thanh_toan","dieu_chinh"])`) and its raw INSERT `:189-200` are omitted. Changing only `parse.ts` is incomplete.
3. Phase 5, Risks, "`updatePriceQuote`/`createPriceQuote` revalidate `/ngay`": only `updatePriceQuote` is in the file list. `createPriceQuote` revalidates only `/bao-gia` and `/chot-ky` (`lib/vat-tu-ncc/price-quote-service.ts:35-36`).
4. Phase 5, `layout.tsx` "chỉ hiện khi `canAccessEntitlement(userId, …)`" (show only if `canAccessEntitlement(userId, …)`): there is no `userId` or session in `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx:21-30`, and `canAccessEntitlement` (`lib/acl/effective.ts:63`) does not check release, unlike `canAccess` (`:125`).
5. Evidence packet §3, "`lib/ledger/ledger-types.ts`: `TransactionType` union (4)": it is a 3-member union (`lib/ledger/ledger-types.ts:4`).
6. Phase 5 Context, "dòng trong kỳ đã ký bị guard từ chối sửa/xoá (phase 1)" (rows in a signed period are rejected for edit/delete by the guard) and "chỉ đọc" for `paymentRoundItemId` rows: no server-side `paymentRoundItemId` guard exists (`grep paymentRoundItemId lib` shows only `lib/payment/payment-ledger-sync.ts:4,54,60`). The read-only claim is UI-only.

UNVERIFIED:
1. "Unit 698 và integration 41" baseline counts. Test suites were not run (plan-review mode). `test/integration` has 8 files, so 41 is plausibly a test-case count.
2. "Firefox không hỗ trợ `<input type="week">`" (Firefox does not support `type="week"`) is an external browser fact, not checkable in the repo.

Unresolved questions:
- Is the existing `authorized`-flag pattern known or accepted? It predates this plan, but Phase 5 widens its reachability.
- Should opening balances be locked once an NCC has any signed period? This is a product decision that Finding 3 depends on.
