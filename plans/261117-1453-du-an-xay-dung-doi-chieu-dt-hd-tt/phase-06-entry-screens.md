---
phase: 6
title: "Entry screens for the three streams"
status: pending
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
