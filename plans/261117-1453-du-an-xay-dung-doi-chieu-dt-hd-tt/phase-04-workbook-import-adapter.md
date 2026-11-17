---
phase: 4
title: "Workbook import adapter, review screen, derived transactions"
status: pending
priority: P1
effort: "5.5d"
dependencies: [2, 3]
---

# Phase 4: Workbook import adapter, review screen, derived transactions

## Goal
An admin imports a team workbook of this template into a chosen existing project. They resolve the project and the suppliers and give the acks on a review screen, then commit.

On the 17/11 Mầm Non file, the commit:
- reproduces every golden;
- supersedes MNTC-GD1's acked old transactions;
- writes derived HĐ transactions, so the old tabs list the new invoices.

## Files to Create / Modify
- Create in `lib/import/adapters/du-an-dt-hd-tt/`:
  - `dt-hd-tt.adapter.ts`
  - `sheet-readers.ts` (label-anchored with `findHeaderRow` / `findLabeledValue`, `excel-utils.ts:71,181`; typed cells)
  - `cell-parse.ts` (shared date and amount parsing that reports unparseable cells)
  - `formula-tags.ts` (only the two verified shapes)
  - `mapping-schema.ts` (zod, reusing the `NewRef` / supplier rules of `vat-tu-chuyen-doi/mapping-keys.ts`)
  - `gates.ts`
  - `apply.ts`
  - `__tests__/sheet-readers.test.ts`
  - `__tests__/real-file.smoke.test.ts` (skipped unless `DT_HD_TT_WORKBOOK` is set)
- Create:
  - `app/(app)/admin/import/[runId]/dt-hd-tt-review.tsx`: project picker; supplier conflicts (existing id, or "new" when admin-approved); ack checkboxes; gates table; unparseable-cell list.
  - `test/integration/du-an-dt-hd-tt-import.integration.test.ts`
- Modify:
  - `lib/import/adapters/adapter-registry.ts`
  - `app/(app)/admin/import/[runId]/adapter-review-components.tsx`
  - `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts` and `lib/import/adapters/du-an-xay-dung.adapter.ts`: add a `review` that blocks when the target project has superseded or derived `project_transactions`.

## Rules
- Adapter name `du-an-dt-hd-tt`, with `supportsRollback: true`. The import is admin-only, as the engine already enforces.
- **Project:** a synthetic `project:target` key that the admin must choose from existing, not-deleted projects. It is blocking while unset, and the adapter never creates a project.
- **Suppliers:**
  - Only 6 ERP suppliers carry an MST today (phase 1 spec §4). Most NCC are therefore suggested by exact normalised-name match, using Ánh Xạ Tên NCC J/K as a hint, and confirmed by the admin. A confirmed match may fill the supplier's empty `taxCode`; this is master data, it is listed in review, and it is kept on rollback.
  - MST is normalised to digits and left-padded to 10/13.
  - A unique match among active suppliers maps automatically.
  - Duplicate MSTs, or a missing match, raise a `supplier:` conflict.
  - A "new" choice must not collide with an active name. The supplier is created in apply with raw SQL and listed in review as "NCC tạo mới – giữ lại khi hoàn tác".
- **Layout:** sections and totals are located by their labels ("PHẦN I", "TỔNG A", "Cộng đến", "STT"…), not by fixed rows. If a label is missing, the review blocks with a Vietnamese message.
- **Lock:** `lockProjectDtHdTt` is taken in review at commit phase and in apply.

| Sheet | Target | Rules |
|---|---|---|
| Ánh Xạ DT (+ Dự Toán for hạng mục) | `ProjectGroupCode` (distinct Mã nhóm), alias `dt` with loại, **Dự toán sync** | The workbook is the source of the Dự toán (decision 8). DT keys are matched as `itemKey|loại`.<br>**Missing in the ERP:** insert a `project_estimates` row with `importRunId`. The category is the hạng mục × loại that the Dự Toán sheet places it in; if that cannot be determined, use HM1-loại.<br>**Only in the ERP:** supersede it.<br>**Same key, different KL or value:** supersede the old rows and insert one replacement. It keeps the category and itemCode of the largest old row, and copies `materialGroupId` and `remainingInvoiceOverrideVnd`.<br>**Renames:** pairs that differ only in name but have equal KL and value are proposed as renames; an accepted rename becomes a replacement with the workbook name.<br>Phá dỡ follows the workbook: its NC / MTC lines are grouped, and the detailed ERP keys are reduced. |
| Đề Xuất NCC col T | `ProjectGroupCode.counterpartyId` | Via Ánh Xạ Tên NCC. Blank → null ("Chưa có đầu mối"). |
| DT-TT Phần II A, B, C | `ProjectCounterparty` | Basis from phase 1. SUM / SUMIFS-by-label → `receipts`, and those receipt rows are tagged. Σ HĐ × (1+VAT) → `invoices`. Chi Thực Tế by mục → `payments` with `paymentSection`. Everything else → `manual` with the cached value, plus a review warning. |
| Ánh Xạ Tên NCC (T:U, Z) | `ProjectCounterpartySupplier`, sortGroup, payee → supplier map | One NCC per đầu mối, enforced by the unique index. |
| HĐ-TT NCC rows | H/S/X/Z on `ProjectCounterpartySupplier` | Only typed cells (no formula). |
| Hóa Đơn | `ProjectInvoiceLine` | Typed reads. Text dates go to `invoiceDateText` when they cannot be parsed. |
| Ánh Xạ HĐ / Ánh Xạ TT | aliases `hd` / `tt` | STT dòng DT → dtKey. Hệ số 0 or blank → null. OK → `xac_nhan`, Ngoài DT → `ngoai_dt`, else `de_xuat`. |
| Thực Tế Nhập | `ProjectActualReceipt` | Block no. carried down. "Cộng đến" rows are skipped. Date from D, else the text in AH via `cell-parse`. G is gồm VAT. |
| Chi Thực Tế | `ProjectCashPayment` | Date from the text, with the regex also extracting dates embedded in voucher text such as "PC03 Đoàn; 14/01/2026"; the original text goes to `dateText`. The 24 section IV rows without any date import with `date = null` and a review warning. Content, CK, TM, mục H → section, đầu mối I, payee → supplier. |

The Hợp đồng sheet is not imported.

## Review gates (blocking unless marked)
1. The project is chosen; it has no active rows in the 7 tables and no derived transactions (re-import guard).
2. Replacement ack `replace-ptx:v1:<projectId>:<count>:<sumHd>`. It covers the active `project_transactions` of committed `bang-can-doi-vat-tu` / `du-an-xay-dung` runs. Other rows are listed and left untouched.
3. **Dự toán sync preview (decision 8).** The review lists every insert, supersede, replacement and rename with KL and value, plus Σ by loại before and after. Ack `dt-sync:v1:<projectId>:<n>:<ΣΔ>`. After the sync, the check below must pass against the synced set. On 17/11 the ERP was 55.256.957 below the workbook.
   **Two-way DT match (after sync):** every Ánh Xạ DT key exists in the DB and every DB key exists in Ánh Xạ DT, KL-0 keys included. Σ KL is within 0,1%, value within 1.000 đ per key, and **Σ value per loại within 1 đ**. The Σ difference is reported first.
4. No itemKey collision with conflicting mappings. Unit-only collisions are listed.
5. Every hd / tt dtKey exists among the dt keys.
6. Every invoice NCC is resolved.
7. Σ invoice amount and VAT equal the Hóa Đơn sheet. Recomputed HĐ-TT Σ E equals its cached total.
8. Warning: Σ receipts per block equals the typed "Cộng đến" row. Σ per key equals Ánh Xạ TT col F.
9. Recomputed DT-TT H per row equals the cached H (≤ 1.000 đ). The A, B and A+B totals match exactly (≤ 1 đ).
10. Recomputed HĐ-TT Σ I, Σ T and Σ X equal the cached totals.
11. The project's settings exist and their rates equal the workbook's Phần III rates; `vatPct` equals the default VAT cell. Otherwise: "Lưu Cài đặt trước". The import never writes settings.
12. Phần III dự toán equals the cached tổng dự toán.
13. Every date and amount cell is parseable, or explicitly accepted as text-only. The list shows sheet!cell.

## Apply
1. Order: suppliers ("new") → group codes → counterparties → counterparty-suppliers → aliases → invoices → receipts → payments.
2. Dự toán sync: supersede the acked estimate ids, insert the replacement and new estimates (with `importRunId`), and store the ids and Σ in `ImportSummary.expected.estimatesSuperseded`. Derived transactions are computed against the synced estimates.
3. Transactions: supersede **exactly the acked id set**: `deletedAt = now()`, `supersededByRunId = runId`. Throw if the affected count differs. Store the ids and Σ in `ImportSummary.expected.superseded`.
4. Insert the derived transactions from `deriveTransactions` (phase 3), with `importRunId` and `sourceInvoiceLineId`.

All of this runs in the engine's single commit transaction, through `$executeRaw` with `importRunId` (`adapter-types.ts:116-122`).

## Verification
- `DT_HD_TT_WORKBOOK="<path to a copy of the 17/11 file>" npx vitest run lib/import/adapters/du-an-dt-hd-tt` passes every golden with no DB.
- Integration test (output attached to `reports/`):
  - commit into a seeded project, with the old rows superseded and the derived rows written;
  - Cân đối VT's Σ HĐ equals Σ invoice lines;
  - another project is untouched;
  - re-import is blocked;
  - the old adapters are blocked;
  - rollback restores everything and keeps the created supplier;
  - `ledger_transactions` count unchanged.
- Manual check on the local copy: the review screen walks through the project, the suppliers and the acks to commit.
