---
phase: 6
title: "Entry screens for the three streams"
status: completed
priority: P2
effort: "3d"
dependencies: [4, 5]
---

# Phase 6: Entry screens for the three streams

## Goal
The đội enters Hóa đơn, Thực tế nhập and Chi thực tế in the ERP without the workbook. New lines appear in the three reports and, for invoices, in the old tabs immediately.

## Files to Create / Modify
- Create in `lib/du-an/dt-hd-tt/`:
  - `invoice-service.ts`, `receipt-service.ts`, `payment-service.ts`: `"use server"`, exporting guarded actions only.
  - `entry-schemas.ts`.
  - `invoice-transaction-sync.ts`: regenerates the derived `project_transactions` of the touched invoice lines through `deriveTransactions`, inside the same transaction.
  - `__tests__/entry-schemas.test.ts`.
- Create in `app/(app)/du-an/[id]/dt-hd-tt/`:
  - `hoa-don/page.tsx`, `hoa-don/hoa-don-client.tsx`
  - `thuc-te-nhap/page.tsx`, `thuc-te-nhap/thuc-te-nhap-client.tsx`
  - `chi-thuc-te/page.tsx`, `chi-thuc-te/chi-thuc-te-client.tsx`
- Create: `test/integration/du-an-dt-hd-tt-entry.integration.test.ts`.

## Tasks & Steps
1. Services follow `lib/du-an/transaction-service.ts`, with these differences:
   - **Access:** insert needs `create`; update and delete need `edit`; viewing needs `read`.
   - **Lock:** `lockProjectDtHdTt` before each write.
   - **Foreign ids:** every incoming foreign id (supplierId, counterpartyId) is resolved with `findFirst({ id, projectId | active supplier, deletedAt: null })`. A cross-project id is refused, following `material-group-service.ts:113-125`.
   - **itemKey** is computed on the server.
   - **Soft delete only.**
   - **Audit:** audited `create` / `update`, no `upsert`, no bulk write without a manual audit row.
   - **Derived rows:** invoice writes call `invoice-transaction-sync`.
   - `revalidatePath` for the report pages and the old tabs.
2. Grids use the dynamic `DataGrid` pattern (`giao-dich-client.tsx:22-32`):
   - **Hóa đơn:** ngày, số HĐ, NCC, tên hàng, ĐVT, SL, đơn giá, thành tiền chưa VAT, VAT %, tiền VAT. The NCC column picks **existing suppliers only**, through a project-guarded `{id, name}` query. There is no quick-create; a new NCC is created by an admin.
   - **Thực tế nhập:** ngày, tên, ĐVT, KL, đơn giá, thành tiền gồm VAT, **đầu mối (required for new rows)**, ghi chú.
   - **Chi thực tế:** ngày, nội dung, chuyển khoản, tiền mặt, mục I–IV, đầu mối, NCC, ghi chú.
3. Each grid shows a running total. A line without an alias shows a "chưa gán" badge linking to Ánh xạ.

## Verification
- `npx vitest run lib/du-an/dt-hd-tt`, plus the ACL contract test covering the 3 new services.
- Integration test, output attached to `reports/`:
  - create, edit and soft delete per stream;
  - a `create`-only user can insert but not edit or delete;
  - a `read` user is refused writes;
  - a cross-project counterpartyId is refused;
  - adding an invoice line adds a derived transaction, and editing or deleting it updates or removes that transaction.
- Manual check on the local copy: a new invoice line with an unseen name appears in DT-HĐ as "chưa gán" (block tie-out ✓) and in Cân đối VT as "Ngoài DT".

## Implementation notes (17/11)

The controller verified the first version: tsc and eslint were clean, the unit suite (1261 tests) and the integration suite (23 files, 129 tests) were green. The integration test's `beforeEach` now calls `clearSession()` before `truncateAll()`. Without it, seeding ran under the previous test's deleted user and failed the audit FK.

The review fixes below (see [code review](reports/code-reviewer-phase-06-entry-screens-review.md)) are written but **not run yet**. Status stays `in-progress` until the controller re-runs the checks. Save the integration output to `reports/phase-06-integration-run.txt`.

### Review fixes (17/11)

- **H1, lost update.** `updateInvoiceLine` / `updateReceipt` / `updatePayment(id, projectId, patch)` now take a partial patch.
  - `readPatch` only accepts editable columns.
  - The server re-reads the row under `lockProjectDtHdTt`, merges the patch (`merge*Patch` in `entry-schemas.ts`), validates the merged row with the full schema, and recomputes the amounts.
  - The grids send only the edited cell. A full-row patch still works for form use.
  - Covered by the integration test: two parallel single-cell edits to one row both survive.
- **M1, refusals.** Every create / update / softDelete returns an `ActionResult` through `runEntryAction` (`entry-action-result.ts`), which wraps `runAction` from `lib/vat-tu-ncc/action-result.ts`.
  - ACL denials become a Vietnamese sentence ("Bạn không có quyền thao tác này trên công trình.").
  - A row from another project, or one that is gone, gets "… không còn trong công trình này — tải lại trang."
  - The clients toast `result.message`. In grid edits the message is thrown on the client, so the grid shows it and reverts the cell.
  - `list*` actions still throw, because the RSC pages call them.
- **M2, dates and numbers.**
  - The date columns of the three grids are text cells, read with `parseDateCell` (`entry-cell-parse.ts`). An empty cell clears the date. Text that does not parse is refused with "Ngày không hợp lệ — nhập dd/mm/yyyy".
  - Number cells go through `parseNumberCell`, which errors on non-numbers.
  - `components/data-grid/cells.ts` is unchanged.
- **L1.** `assertNoLegacyInvoiceTransactions` and `assertInvoiceCategories` (in `invoice-transaction-sync.ts`) run before the first write. A refusal therefore leaves no orphan "create" audit row, and a test checks this. The category check requires a VL / NC / MTC hạng mục, the same condition `deriveTransactions` needs.
- **L2.** A line without a date gives its derived transaction the line's `createdAt`. The import uses its commit time, which is the imported line's `createdAt`, so both paths agree. Clearing the date moves the transaction to that date.
- **L3.**
  - Clearing VAT % sets tiền VAT to 0.
  - Changing VAT %, or thành tiền on a row that has a VAT %, recomputes tiền VAT.
  - A row without VAT % (imported with only a VAT amount) keeps its tiền VAT when thành tiền changes, and the action returns a `warning` that the grid shows.
- **L4.** The schema rounds SL to 4 dp, đơn giá and money to 2 dp, and VAT % to 4 dp, the same as the stored columns, before computing. Amounts are therefore computed from the stored values.
- **L5.** A computed thành tiền over the `Decimal(18,2)` input limit (1e15) is refused with a Vietnamese message.
- **Double counting.** A project that still has live legacy HĐ transactions is refused new invoice lines, with a message asking the user to import the book first. Legacy here means `sourceInvoiceLineId` null, `amountHd` ≠ 0, not deleted and not superseded. Editing existing lines is still allowed. An integration test covers this.
- **Not changed:**
  - L6: the Ánh xạ page comes in phase 7.
  - L7: this is the existing audit pattern.
  - The NCC picker stays the company-wide list of active suppliers. It is master data (id + name) and needs project `read`.

- **Services** (`invoice-service.ts`, `receipt-service.ts`, `payment-service.ts`): each one has `list*` (`read`), `create*` (`create`), `update*` and `softDelete*` (`edit`).
  - Update and delete first look up the record's own project (`existing.projectId !==`), and only then run the ACL check.
  - Every write runs in one interactive transaction: `lockProjectDtHdTt`, then re-read the row under the lock, then check the foreign ids, then an audited `create` / `update`.
  - Foreign ids are re-checked only when they change. The stored value was already checked, and an NCC that has since been merged must not block edits to other cells.
  - A receipt's đầu mối cannot be cleared once set.
- **Picker lists:** `listSupplierOptions` lives in the invoice service and `listCounterpartyOptions` in the receipt service; the payment page uses both.
- **Server-side calculations** (`entry-schemas.ts`): `itemKey` comes from `itemKeyOf`. A blank thành tiền is SL × đơn giá; a blank tiền VAT is thành tiền × VAT %. Amounts are rounded to 2 decimals.
- **Derived transactions** (`invoice-transaction-sync.ts`):
  - Each touched line is re-derived with `deriveTransactions`, using the same placement rules as the import.
  - If the line has a live derived transaction, it is updated in place, keeping its id and `importRunId`; otherwise one is created. When the line is soft-deleted, its derived transaction is soft-deleted too.
  - On a project with no hạng mục, invoice entry is refused with "chưa có hạng mục", the same rule as the import.
- **Rollback guard:** an edit bumps the invoice line's `updatedAt`. `assertDuAnBookRollbackAllowed` therefore refuses to roll back the run, and the integration test covers this.
- **New helpers:** `entry-action-result.ts` (refusals as `ActionResult`), `entry-cell-parse.ts` (client-safe parsing of grid cells), and `entry-write-guards.ts`. The last one holds the project, counterparty and supplier checks plus `revalidateEntryBook`, and phase 7 now shares it. That function revalidates the 3 report pages and the book itself, and for invoices also giao-dich, can-doi-vat-tu, dinh-muc and cong-no.
- **Screens:**
  - Each screen has a create form above the grid. It keeps the invoice header (ngày, số HĐ, NCC, VAT %) for the next line.
  - Grid edits return the saved row so computed cells refresh in place. The grid remounts when the set of row ids changes.
  - The totals sit in the header. Unmapped lines show "chưa gán" in an Ánh xạ column, and a badge links to `anh-xa`.
  - Inactive or deleted NCCs and đầu mối still show by name on old rows.
- **Contract tests:**
  - `lib/du-an/__tests__/project-service-acl-contract.test.ts` now covers the 3 services and the create / edit / read split, and checks that there is no bulk write and no raw SQL.
  - `test/unit/p0-server-action-contracts.test.ts` adds behaviour checks for the access levels.
  - `test/unit/module-release-entrypoints.test.ts` registers the 3 pages.
- **Sub-nav:** `hoa-don`, `thuc-te-nhap` and `chi-thuc-te` are now `ready: true`.
