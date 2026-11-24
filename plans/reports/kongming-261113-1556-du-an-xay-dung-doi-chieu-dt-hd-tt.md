# Kongming counsel — Dự án xây dựng: nhập DT / HĐ / TT và ba bảng đối chiếu

Date: 2026-11-13. Advisory only; no repo code was changed.

## TL;DR

Build three independent input streams (Hóa đơn, Thực tế nhập, Chi thực tế) as new tables next to the existing `ProjectEstimate`, and join them to Dự toán through one alias-mapping table (tên|ĐVT → Mã nhóm, dòng DT, hệ số quy đổi, trạng thái xác nhận). Do not stretch `ProjectTransaction` and do not route TT through the vat-tu-ncc ledger. Deliver in risk order: schema → import of this workbook → three reports proven against the workbook's own totals → entry screens → mapping UI → A4 print/Excel.

## Evidence limits

- Verified from the two dump files: headers and first rows of Dự Toán, Hóa Đơn, Chi Thực Tế, Thực Tế Nhập, Ánh Xạ DT/HĐ/TT, Hợp đồng, NCC, and the three A4 sheets (DT-HĐ rows 1-20, DT-TT rows 1-10, HĐ-TT rows 1-7).
- Not seen, inferred from headers and formula references: Ánh Xạ Tên NCC, Đề Xuất NCC, DT-TT Phần II/III (rows 53-119), the body of Chi Thực Tế. I could not run the dump script: the scout-block hook denies any Bash command naming `node_modules`, and I did not work around it.
- Not checked: database contents (whether project MNTC-GD1 already holds imported data).

## 1. What the workbook really is

**Pivot.** Everything hangs on the DT line (`Ánh Xạ DT`: one row per unique tên|ĐVT, KL summed over the 6 hạng mục, Giá H.T, 343 rows) and its Mã nhóm (about 90 codes such as COC-BTLT, THEP-TRON, NC-*, MTC-*, PHA-DO; NGOAI-DT is a status, not a group). Each group has an NCC phụ trách (sheet Đề Xuất NCC, inferred).

**Entities**

| Entity | Sheet | Essential fields |
|---|---|---|
| DT line | Dự Toán / Ánh Xạ DT | tên, ĐVT, KL, Giá H.T, Mã nhóm, loại VL/NC/MTC |
| Invoice + lines | Hóa Đơn (≤285 lines) | ngày, số HĐ, NCC, MST, thuế suất và tiền thuế cả HĐ; line: tên hàng, ĐVT, SL, đơn giá, thành tiền |
| Receipt | Thực Tế Nhập (≤1000 rows) | ngày, tên, ĐVT, KL, đơn giá, thành tiền. No supplier column. Amounts are VAT-inclusive |
| Cash payment | Chi Thực Tế (≤145 rows) | ngày, nội dung, chuyển khoản, tiền mặt, mục I-IV, đầu mối |
| Alias mapping | Ánh Xạ HĐ (234), Ánh Xạ TT (~145) | key tên|ĐVT → Mã nhóm, STT DT (optional), hệ số, xác nhận OK / Ngoài DT |
| Đầu mối | Ánh Xạ Tên NCC | payee text → đầu mối; several legal NCC merged into one actual line |
| Per-NCC manual figures | DT-TT col H; HĐ-TT cols H, S, X; Hợp đồng | thực tế chốt gồm VAT, thực nộp rà soát, thực tế tách riêng NCC, đã lấy về, giá trị hợp đồng |

Hệ số = KL theo ĐVT dự toán trên 1 ĐVT nguồn; 0 or blank means "theo dõi theo giá trị". A mapping may stop at the group without a DT line (Thép D>10 → THEP-TRON).

**Reports**

- **DT-HĐ**: NCC → nhóm → dòng DT → ↳ mặt hàng HĐ. KL DT, KL HĐ quy đổi (SL × hệ số), thiếu/vượt, giá trị DT, giá trị HĐ chưa VAT, cân đối ròng = DT − HĐ, tình trạng. Each NCC block ends with a tie-out row: HĐ gán vào nhóm + chưa gán/ngoài DT + gán sang nhóm NCC khác − HĐ của NCC khác = tổng HĐ NCC xuất. Phần B lists invoices outside DT by NCC and ties to the invoice ledger total. Columns L-Q compare with thực tế chốt.
- **DT-TT**: Phần I — vật tư chính (thép, cát, xi măng, bê tông, gạch): KL and value DT vs thực nhận (÷ (1+VAT)), variance split into "do KL" and "do đơn giá". Phần II — one row per đầu mối: DT trực tiếp of its groups + VAT vs thực tế chốt. Phần III — trực tiếp → gián tiếp → thu nhập chịu thuế tính trước → VAT = tổng dự toán, against total spent.
- **HĐ-TT**: per NCC — HĐ chưa VAT / VAT / gồm VAT, hợp đồng, đã thanh toán theo sổ chi (or manual override), cần nộp thêm để hết HĐ, đã nộp vượt, thực tế, chênh TT − HĐ, nợ thực tế = thực tế − thực nộp, sẽ lấy về, đã lấy về, còn phải lấy về, ghi chú việc cần làm.

**Noise** (do not model): Dự Toán price chain (Giá gốc, Giá T.B, hệ số, cước, chênh lệch — keep only Giá H.T), DT-HĐ columns R-Z, HĐ-TT columns O, P, Q, AA, AB, auto "độ tin cậy" text, intermediate sheets (Kế Hoạch Lấy HĐ theo NCC, Theo Dõi VT theo NCC, Đối Chiếu HĐ – Thanh Toán, Hiệu Quả DT – Thực Tế), NCC ngành hàng defaults.

## 2. Gap analysis against the du-an module

**Fits**

- `ProjectEstimate` is the DT line; the `du-toan` screen is already the "chỗ nhập Dự toán".
- `ProjectMaterialGroup` is Mã nhóm, but has only `name`: it needs `code` and a nullable `supplierId` (NCC phụ trách).
- `Supplier.taxCode` matches MST. `ProjectSettings.vatPct`, `ProjectContract`, the import engine and adapter pattern, the cân đối export route, print CSS in `app/globals.css`, and the quick-create work on the current branch are all reusable.

**Conflicts**

- `ProjectTransaction` joins to DT by exact `categoryId + itemCode` (`lib/du-an/can-doi-service.ts:90-92`). There is no alias, no hệ số, no confirmation; unit mismatch suppresses metrics instead of converting, and `lib/du-an/material-group-rollup.ts:6` states "KHÔNG quy đổi đơn vị".
- One row carries both streams (`amountHd`, `amountTt`, `qtyHd`). The workbook's streams differ in grain, naming and mapping, and receipts have no invoice.
- No invoice header: VAT rate and VAT amount per invoice, MST, and the Σ thuế check have nowhere to live. `partyName` is free text.
- Supplier payments exist only as `tra_tien` rows grouped by `partyName` (`lib/du-an/supplier-debt-service.ts`). `Project3WayCashflow` is CĐT↔công ty↔đội, not NCC payments.
- DT grain: the workbook's DT line is unique per tên|ĐVT across hạng mục; `ProjectEstimate` is per category. Reports must roll estimates up by normalized tên + ĐVT.
- `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts:40` hardcodes project `MNTC-GD1` and writes estimates plus HĐ-only transactions. If that import was run, the same project already holds an older copy of the invoices, and its transactions have no dedup.

**"Thực tế" is three things, not one**

1. Thực Tế Nhập = quantities received; feeds only DT-TT Phần I.
2. Chi Thực Tế = cash paid; feeds "đã thanh toán" in HĐ-TT.
3. Thực tế chốt per đầu mối = a manually agreed figure; feeds DT-TT Phần II, HĐ-TT and DT-HĐ columns L-Q. It is not computed from 1 or 2 in the workbook.

All three need an input place.

## 3. Approaches

**A. Extend `ProjectTransaction`** (add supplierId, VAT, group, hệ số, status).
Depends on HĐ and TT pairing row for row. Fails first at the invoice header (VAT per invoice) and at mapping: one alias decision must cover many lines, and 1000 receipt rows have no invoice. It also forces an itemCode at entry, where the workbook maps afterwards with confirmation.

**B. New independent streams + one mapping table (recommended).**
Depends on the user accepting new tabs beside the old Giao dịch / Cân đối vật tư tabs. Fails first as two sources of truth for invoices on a project that already has `ProjectTransaction` data — hence question 1.

**C. Reuse the vat-tu-ncc ledger for TT.**
Depends on every receipt and payment of this project passing through the company supplier ledger. Fails on import: `SupplierDeliveryDaily` requires `supplierId` and `itemId` (`prisma/schema.prisma:555,559`), Thực Tế Nhập has no supplier column and mixed-spec lots, and Chi Thực Tế is the đội's cash book (labor, advances, cash) which does not belong in a ledger with signed reconciliations and payment rounds.

### Recommended shape (B)

- `ProjectMaterialGroup`: add `code`, `supplierId?`.
- `ProjectInvoice` (projectId, supplierId, invoiceNo, invoiceDate, vatPct, vatAmountVnd) and `ProjectInvoiceLine` (itemName, unit, qty, unitPrice, amountVnd, vatPct?, mappingKey).
- `ProjectActualReceipt` (date, itemName, unit, qty, unitPrice, amountVnd, mappingKey, note).
- `ProjectActualPayment` (date, content, bankVnd, cashVnd, section, counterpartyId?, note).
- `ProjectItemMapping` (projectId, source hd|tt, key, itemName, unit, materialGroupId?, estimateId?, factor?, status de_xuat|xac_nhan|ngoai_dt, note); unique on (projectId, source, key). `factor` NULL = theo dõi theo giá trị; the importer turns 0 into NULL.
- `ProjectCounterparty` (đầu mối: name, sort/nhóm tính chất, agreedActualVnd, vatPct?, paidOverrideVnd?, refundedVnd, note) and a link table supplier → counterparty with `splitActualVnd?`.
- `ProjectContract`: add `supplierId?` for "Hợp đồng ký".
- Phần III inputs: a few project-level figures (chi phí gián tiếp, thu nhập chịu thuế tính trước) on `ProjectSettings`. Confirm from rows 100-119 of DT-TT before fixing the fields.

Report logic goes in pure functions, as `can-doi-metrics.ts` already does, with thin server loaders.

### Phases

1. **Fixtures and schema.** Dump the unseen sheets. Record golden totals from the three print sheets (per NCC and grand totals). Add the tables.
2. **Import adapter for this workbook.** Read input and mapping sheets only, never the report sheets, plus the manual cells (DT-TT col H, HĐ-TT cols H/S/X, Hợp đồng). Match NCC by MST. Reuse `dirty-date.ts` for the text dates in Chi Thực Tế. Gate: parsed sums equal sheet sums, as existing adapters do. Supports rollback.
3. **Three reports on screen**, tested against the golden totals. This is the hardest part, so it comes before UI polish.
4. **Entry screens** under `du-an/[id]`: Hóa đơn (header + lines, supplier picker with quick-create), Thực tế nhập, Chi thực tế, đầu mối/thực tế chốt. Use the existing data-grid.
5. **Ánh xạ screen**: HĐ and TT tabs, one row per key with totals, pickers for nhóm and dòng DT, hệ số, Xác nhận / Ngoài DT, an unmapped counter. New names appear as "chưa gán".
6. **A4 print and Excel export** for the three reports, following the existing export route and print CSS.

The caller's order (screens first) also works; I put import and reports first because report parity is where the design can be wrong, and real data exposes it early.

## What to avoid

- Porting the workbook's intermediate sheets or helper columns one for one.
- Storing confidence text or computed totals; derive them.
- Auto-converting units without a confirmed hệ số; value-only tracking is a legitimate state.
- Deriving thực tế chốt from receipts or cash.
- Hardcoding the project code in the new adapter, as the two older adapters do.
- Repointing the old Cân đối vật tư / Định mức / Công nợ tabs in this work; that was not requested.

## Decisions for the user (max 4)

1. **Is this workbook the same project as "Mầm Non Trại Chuối GĐ1" (MNTC-GD1) already in the app?**
   (a) Yes — import into it, keep the Dự toán lines (matched by tên + ĐVT) and remove the old invoices imported from "Bảng cân đối vật tư" [recommended];
   (b) Yes — but keep the old invoices too, accepting that the old Cân đối vật tư tab shows older numbers;
   (c) No — create a new project.
2. **Where does "thực tế" per NCC/đầu mối come from?**
   (a) A figure you enter per đầu mối (thực tế chốt), as in the workbook; the receipt log only feeds the quantity comparison and the cash book only feeds "đã thanh toán" [recommended];
   (b) Computed automatically from the receipt log;
   (c) Computed from cash paid.
3. **Should receipts and payments here be linked to the company's supplier debt module (Vật tư NCC / Công nợ)?**
   (a) No — this is the đội's own book, entered separately [recommended];
   (b) Yes — pull deliveries and payments from that module where the NCC exists there.
4. **How faithful must the three printed reports be?**
   (a) Same structure and main columns, plus the tie-out rows, without the helper columns [recommended];
   (b) Every column of the Excel sheets, including the diagnostic ones.

## Success metrics

- After import, the three reports match the workbook per NCC within 1,000 đ, and the Phần B tie-out equals the invoice ledger total.
- A new invoice line with an unseen name appears as "chưa gán" and moves into the report once confirmed.
- No change in the numbers of the existing Cân đối vật tư, Định mức and Công nợ tabs for other projects.

## Assumptions

- "Cong Trinh Khoan" means the đội thi công keeps its own cash and receipt book, separate from the company ledger (medium). If false, approach C becomes worth a second look for payments only.
- MNTC-GD1 already contains data from the older adapters (medium; adapters exist, DB not checked). If empty, question 1 collapses to (a) with nothing to remove.
- Each group has exactly one NCC phụ trách, and đầu mối merges legal NCC as described (medium; inferred from formulas). A many-to-many would need a link table instead of `supplierId` on the group.
- Giá H.T is the price used in all three reports (high; Ánh Xạ DT column F).
- Receipt amounts are VAT-inclusive for the whole project (high for this workbook, stated in DT-TT row 4); a project-level setting is enough.
- The feature must work for any project, not only this one (medium).

## Unresolved

- Exact layout of DT-TT Phần II/III, Ánh Xạ Tên NCC and Đề Xuất NCC — dump before finalizing the schema.
- The four decisions above.

Status: DONE_WITH_CONCERNS
Summary: Recommend new independent HĐ / thực tế nhập / chi thực tế tables joined to the existing Dự toán through one alias-mapping table with hệ số and confirmation, plus a per-đầu mối "thực tế chốt" record; deliver import and report parity before entry screens.
Concerns: Four sheets and the database state were not inspected (Bash dump blocked by the scout hook), so the đầu mối / nhóm–NCC model and the Phần III inputs are inferred and must be confirmed in phase 1.
