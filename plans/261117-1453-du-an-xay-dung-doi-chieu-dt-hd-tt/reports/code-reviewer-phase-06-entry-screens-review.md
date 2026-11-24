# Code review: phase 6 entry screens (Hóa đơn, Thực tế nhập, Chi thực tế)

Date: 17/11/2026. Read-only review of the uncommitted work in `feat/du-an-dt-hd-tt`. tsc, eslint, the unit suite and the integration suite were already green, so this review looks for defects those checks would not catch.

## Verified OK (no finding)

- **ACL per action.** `list*` and the option lists need `read`, `create*` needs `create`, and `update*` / `softDelete*` need `edit`. The level order is `read < comment < create < edit` (`lib/acl/modules.ts:25`).
- **Project scoping.** Update and delete compare the row's own `projectId` with the argument before the ACL check. The ACL runs on `existing.projectId`. Every write's `where` carries `projectId`, and `syncDerivedTransactions` re-checks `projectId` (`invoice-transaction-sync.ts:71,78`). I found no argument that reaches project B's rows.
- **Foreign ids.** The đầu mối is checked with `{id, projectId, deletedAt:null}` and the NCC with `{id, deletedAt:null}`, both under the lock. The cross-project and inactive cases are tested.
- **Lock before reads that decide writes.** The lock is taken first. The row is then re-read under the lock, and the foreign-id checks and the derive placement reads (aliases, estimates, categories) all happen after it.
- **Derived transactions.** They go through the same `deriveTransactions`, `groupEstimatesByKey` primary and category order as `apply-import.ts:116-127`. The note and `status: approved` match the import. The derived transaction is updated in place and keeps its id and `importRunId`. Deleting the line soft-deletes the transaction, and extra duplicates are soft-deleted too.
- **Rollback guard.** `updatedAt` on the book tables has `@updatedAt`, so an edit or soft delete trips `run_rows_edited`. A row entered by hand trips `foreign_rows`, and that includes the derived transactions with `importRunId` NULL.
- **`"use server"` files.** They export only async functions plus types. The sync helpers (`refChanged`, `revalidateEntryBook`) live in `entry-write-guards.ts`, which is not a server-action file.
- **Server-computed values.** `itemKey` and the amounts are computed server-side, and the `projectId` from the client is only used after the ACL check and the ownership comparison.

## High

### H1. Grid edits send the whole row from a client snapshot, so a quick second edit or a second user silently reverts the first
- **Where:**
  - `app/(app)/du-an/[id]/dt-hd-tt/hoa-don/hoa-don-client.tsx:56-60,101-103,133-139`
  - `thuc-te-nhap/thuc-te-nhap-client.tsx:50-54,92-93,122-128`
  - `chi-thuc-te/chi-thuc-te-client.tsx:51-55,101-102,125-131`
  - Server side, each update overwrites every column from the payload: `invoice-service.ts:99-111`, `receipt-service.ts:94-108`, `payment-service.ts:71-87`.
- **Scenario:** the user types SL = 12 and presses Enter, then types Đơn giá within the save round-trip.
  - The grid debounces per *cell* (`use-grid-mutation.ts:56-74`, 150 ms), so the second edit fires while the first is still in flight. A save here is slow: auth, ACL, the lock, the derive reads, and 2–4 audited writes, each doing its own session lookup.
  - `editInput` builds the second payload from `latest.current`, which still holds the old SL.
  - Server actions run in order, so A commits SL = 12, then B commits SL = old value with the new price. The amount, the VAT and the derived HĐ transaction are recomputed from the reverted SL. The grid then shows B's saved row, so SL snaps back without any error.
  - The same happens between two users editing different cells of one row, because there is no version check.
  - The comment at line 101 says this ref prevents overwrites. It only covers edits made after the previous save has returned.
- **Fix (preferred):** make the update actions take a cell patch, e.g. `updateInvoiceLine(id, projectId, { col, value })`.
  - The server reads the row under `lockProjectDtHdTt` and merges the patch.
  - It applies the recompute rules there: SL or đơn giá changed and both present → thành tiền = SL × đơn giá; thành tiền or VAT % changed and VAT % present → recompute tiền VAT.
  - This also stops the server from trusting the client's copy of the other columns.
- **Fix (minimum):** chain the edits per row on the client (`Map<rowId, Promise>`), and build the payload only after the previous save for that row has resolved.
- **Optional:** reject the write when `updatedAt` differs from the value the client loaded.

## Medium

### M1. In production, every business refusal shows up as a generic error
- **Where:** all three services throw plain `Error` / `ZodError` / `ModuleRequestError`, and the clients toast `err.message`:
  - `hoa-don-client.tsx:166`, `thuc-te-nhap-client.tsx:152`, `chi-thuc-te-client.tsx:155`
  - the grid toast in `use-grid-mutation.ts:69`
- **Evidence:** the repo already records that production React Flight sends only the `digest` of an error thrown from a server action (`lib/vat-tu-ncc/action-result.ts:1-5`, `lib/master-data/project-service.ts:208-211`; the latter is the reason for commit a6fef44, "explain refusals").
- **Scenario:** in production, the user cannot see why a save failed and has no way to correct the input. Affected messages include:
  - "Đầu mối không thuộc công trình này"
  - "Không được bỏ trống đầu mối…"
  - "Nhập thành tiền, hoặc nhập đủ SL và đơn giá"
  - "Công trình chưa có hạng mục…"
  - "NCC … ngừng dùng"
  - "Dòng … không còn — tải lại trang"
  - "Forbidden"

  In dev, a ZodError toast shows raw JSON.
- **Fix:** have the actions return `ActionResult` through `runAction` / `userFacingMessage` (`lib/vat-tu-ncc/action-result.ts`). That module is scoped to vat-tu-ncc today, so either move it to a shared location or reuse it as it is. Then unwrap the result in the clients. The grid's `onCellEdit` can throw `new Error(result.message)` on the client side, which keeps the message.

### M2. A mistyped date in a grid cell silently clears the stored date
- **Where:**
  - `components/data-grid/cells.ts:163-181`: unparseable text → `null`.
  - The clients then turn `null` into "no date": `hoa-don-client.tsx:65`, `thuc-te-nhap-client.tsx:58`, `chi-thuc-te-client.tsx:58`.
- **Scenario:** a row is dated 17/11/2026 and the user types `17/11`, `17 11 2026` or `1/13/2026`. `dmyToIso` returns null, and the row is saved with no date. For invoices, it also leaves the derived transaction on the old date (see L2).
- **Fix:** an empty cell and a typo cannot be told apart once `parseCellValue` has run. Options:
  - make the `date` parse return a marker such as `undefined` or an `{ invalid: raw }` object for non-empty unparseable text, and have `onCellEdit` throw "Ngày không hợp lệ (dd/mm/yyyy)";
  - or give the date column a `validator` that rejects non-empty text that does not parse.

## Low

- **L1. A refused invoice still leaves an audit "create" row** (`invoice-service.ts:91-92`).
  - The line is created first. The audit extension commits its row through the *base* client, outside the interactive transaction (`lib/prisma.ts:95-97,158-171`).
  - When `syncDerivedTransactions` then throws "chưa có hạng mục", the line rolls back but the audit row stays. Each refused attempt adds another one.
  - **Fix:** count the live `projectCategory` rows under the lock *before* the create, and refuse there.
- **L2. The derived transaction keeps the old date after the invoice date is cleared** (`invoice-transaction-sync.ts:109`: `...(d.date ? { date: d.date } : {})`).
  - The import uses `d.date ?? now`, so after the edit the two disagree. Giao dịch, Công nợ and Cân đối keep showing the old date.
  - **Fix:** decide the rule explicitly. Either keep the date but document it, or require a date on hand-entered invoice lines.
- **L3. Tiền VAT can go stale** (`hoa-don-client.tsx:63,77-78`).
  - Clearing VAT % keeps the old tiền VAT.
  - On rows with VAT % NULL (imported with only a VAT amount), editing SL, đơn giá or thành tiền recomputes thành tiền but not tiền VAT.
  - The reports read `vatVnd`, so the gồm-VAT total drifts without any visible sign.
  - **Fix:** with the server-side patch from H1, clearing VAT % should set tiền VAT to 0 or keep it explicitly. When thành tiền changes on a row with VAT % NULL, show a hint.
- **L4. The amounts are computed from values the database will round differently** (`entry-schemas.ts:77,138,151`).
  - VAT % is entered as `n/100` and can have more than 4 decimals, while the column is `Decimal(5,4)`. SL can have more than 4 decimals.
  - The database rounds the stored VAT % and SL, but thành tiền and tiền VAT were computed from the unrounded values. Stored SL × đơn giá then ≠ thành tiền.
  - **Fix:** round VAT % to 4 dp, SL to 4 dp and đơn giá to 2 dp in the schema transforms, before computing.
- **L5. Overflow passes the schema** (`entry-schemas.ts:52-54,138`).
  - SL ≤ 1e13 and đơn giá ≤ 1e15 pass, but their product overflows `Decimal(18,2)`. It fails in Postgres with a generic error.
  - **Fix:** add a refine so the computed amount is ≤ `MAX_MONEY`.
- **L6. The "chưa gán — mở Ánh xạ" badge leads to a 404** (`hoa-don-client.tsx:190`, `thuc-te-nhap-client.tsx:176`).
  - `dt-hd-tt/anh-xa` does not exist until phase 7. The sub-nav keeps `anh-xa` at `ready: false`, but the badge links to it unconditionally.
  - This only matters if phase 6 merges or deploys before phase 7.
  - **Fix:** gate the link on `DT_HD_TT_SECTIONS` `ready`, the same way `invoiceBookHref` does.
- **L7. Every audited write inside the transaction borrows a second pool connection** (`lib/prisma.ts:61-81,95-97`).
  - The before-read and the audit insert go through `base`, which is a different connection from the interactive transaction.
  - Writers waiting on the advisory lock each hold a connection. With pool-size concurrent writers on one project, the lock holder cannot get a connection for its audit row and stalls until the transaction timeout.
  - The pattern already exists in the repo, and this team's size makes it unlikely. Noted for awareness only.

## Tests

- The integration test covers create, edit and soft delete per stream, the create / edit / read split, the cross-project đầu mối, the inactive NCC, derived create / update-in-place / soft delete, and the rollback refusal. These assertions check real behaviour.
- **Gap:** there is no test for H1 (two sequential updates built from the same snapshot) or for M2.
- **Gap:** there is no test that a refused invoice create leaves no audit row (L1).

## Unresolved questions

1. **Hand entry on a project that was never imported.** On a project with legacy HĐ transactions from "Bảng cân đối" or entered manually in Giao dịch, the new derived transactions are added *on top* of the legacy ones. Σ HĐ in the old tabs then double counts. The first manual row also blocks the book import for good (`import-plan.ts:68-72`), so the legacy rows can never be superseded.
   - Should invoice entry be refused (or warned about) while the project still has live non-derived HĐ transactions from a committed `bang-can-doi-vat-tu` run?
2. **Re-deriving after mapping changes.** Changing an alias, an estimate or a category does not re-derive the transactions. Phase 7 (Ánh xạ) must call `syncDerivedTransactions` for every live line whose `itemKey` is affected. Is that in the phase 7 spec?
3. **Supplier list exposure.** `listSupplierOptions` returns the global active supplier list (id, name) to anyone with `read` on a project. The spec said "project-guarded". Is global master-data visibility for project readers acceptable?
