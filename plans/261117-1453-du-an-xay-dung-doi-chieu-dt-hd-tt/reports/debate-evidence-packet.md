# Debate evidence packet — "Dự án xây dựng": Dự toán / Hóa đơn / Thực tế and the three A4 reports

Date: 2026-11-17. Shared, read-only input for the three independent candidate plans. All facts below were checked against the repo, the team workbook or the local DB copy on this date.

## 1. What the user asked for (13/11/2026)

Build the "Dự án xây dựng" feature so the information in `C:\Users\tranv\OneDrive\Desktop\Ngo Quyen\Cong Trinh Khoan\Mầm Non\Can Doi Vat Tu 2.xlsx` lives in the ERP:
- vật tư / nhân công by **thực tế**, **hóa đơn** and **dự toán**;
- places to enter Dự toán, enter Hóa đơn, and track actual spending (chi thực tế);
- reports equivalent to the sheets **'In A4 – DT-HĐ'**, **'In A4 – DT-TT'**, **'In A4 – HĐ-TT'**.

## 2. Decisions the user already made (do not reopen)

1. The workbook is project **MNTC-GD1 "Mầm Non Trại Chuối GĐ1"** (id 4, Chủ thể id 2 "Lê Văn Huyên"). Import into it, **keep its Dự toán lines**, and **replace the 117 old invoice transactions** imported earlier by the "Bảng cân đối vật tư" adapter.
2. The đội's receipts (Thực Tế Nhập) and cash payments (Chi Thực Tế) are **the team's own book, separate** from the company supplier ledger (vat-tu-ncc / cong-no-vt). Do not post them into `ledger_transactions` or `supplier_delivery_daily`.
3. Reports: **main columns plus the tie-out / check rows**, not every diagnostic helper column.
4. On "where does thực tế per NCC come from", the user answered by asking for a reconciliation of the workbook against the company debt ledger first. That reconciliation is now finished (section 5). The question of the *source* of thực tế per NCC in the feature is still formally open — see D1 in section 7.

## 3. The workbook (28 sheets; input sheets vs report sheets)

Input / mapping sheets (what must be stored or entered):
| Sheet | Range | Content |
|---|---|---|
| Dự Toán | A1:T571 | estimate lines by hạng mục; only tên, ĐVT, KL, Giá H.T matter (price-chain columns are noise) |
| Ánh Xạ DT | A1:H346 | 343 unique tên\|ĐVT DT lines, KL summed over 6 hạng mục, Giá H.T, **Mã nhóm** (~91 codes: COC-BTLT, THEP-TRON, BT-TP, CAT-MIN, GACH-KN, NC-*, MTC-*, PHA-DO …), loại VL/NC/MTC |
| Hóa Đơn | A1:Q286 | ~285 invoice lines: A ngày, B số HĐ, C NCC, D MST, E tên hàng, ĐVT, SL, đơn giá, I thành tiền chưa VAT, M thuế suất, O tiền VAT dòng |
| Ánh Xạ HĐ | A1:Q237 | key tên\|ĐVT of invoice lines → Mã nhóm, STT dòng DT (optional), hệ số quy đổi, xác nhận OK / Ngoài DT |
| Thực Tế Nhập | A1:AH1014 | receipts grouped in numbered blocks (col A = block no.): B tên, C ĐVT, D ngày (serial; text dates in AH), E KL, F đơn giá, G thành tiền **gồm VAT**, L/M ghi chú (often the supplier nickname: "Đại ngàn", "A Hiếu"). **No supplier column.** Each block ends with a "Cộng đến …" row (typed totals). Helper cols Y–AG are formulas (mapping key `tên\|ĐVT` in AC, Mã nhóm in AD via 'Ánh Xạ TT') |
| Ánh Xạ TT | A1:Q148 | key tên\|ĐVT of receipts → Mã nhóm, hệ số; F = SUMIFS of Thực Tế Nhập G by key |
| Chi Thực Tế | A1:L153 | đội cash book: B ngày (text dd/mm/yyyy), C nội dung, D chuyển khoản, E tiền mặt, F ghi chú; H mục I–IV, I đầu mối chuẩn, J nhóm chi, K CK+TM (helpers). Sections: I "Ông Sơn tạm ứng/vật tư lẻ", II chi khác (lương, lãi, phí), III nhân công, IV NCC vật tư/dịch vụ |
| Ánh Xạ Tên NCC | A1:AA72 | payee text → tên chuẩn + MST; **T:U = NCC trên hóa đơn → STT dòng DT-TT** (several legal NCC fold into one đầu mối line, e.g. Chương Dương + LPP → Sobek; Kim khí TT = Thương Hiệu Trần "chú Hiếu"); Z nhóm tính chất NCC (sort order "01 Phá dỡ – nền móng…", "02 Thép – kim khí"…) |
| Đề Xuất NCC | A1:AG101 | per Mã nhóm: NCC phụ trách (NCC ÁP DỤNG col T), with confirmation; 91 groups |
| Hợp đồng | B3:D27 | contracts per NCC: nội dung, giá trị (or "HĐNT") |

Report sheets (what must be reproduced, read formulas only as specification):
- **In A4 – DT-HĐ** (A1:Z763): per NCC block → Mã nhóm → DT line → "↳" invoice items mapped to it. Columns: ĐVT, KL DT, KL đã lấy HĐ (quy đổi), KL thiếu/vượt, Giá trị DT, Giá trị HĐ chưa VAT, Cân đối ròng DT − HĐ, Tình trạng, NCC/ghi chú, L thực tế chốt gồm VAT, M thực tế chưa VAT, N HĐ do NCC xuất gộp, O gán chéo ròng, P còn phải lấy HĐ so thực tế, Q ghi chú. Each NCC block ends with a tie-out row "= TỔNG HĐ DO NCC XUẤT … ✓ Khớp sổ Hóa Đơn". Columns R–Z are diagnostic (S…Z decomposition of the tie-out).
- **In A4 – DT-TT** (A1:R1249): Phần I vật tư chính (thép, dây thép, bê tông, xi măng, cát, gạch): KL DT vs KL thực nhận, đơn giá DT vs TT chưa VAT, giá trị, chênh tách "do KL" và "do đơn giá"; rows "↳ Thực nhận chỉ gán tới nhóm" for receipts mapped to a group only. Phần II per đầu mối: A. 28 NCC lines (rows 53–80, col H = THỰC TẾ CHỐT gồm VAT — some rows are SUMs over Thực Tế Nhập ranges, others typed numbers), B. 11 tổ nhân công (rows 84–94, col H typed), C. khoản khác (Ông Sơn vật tư lẻ, chi khác lương/lãi/phí). Phần III (rows 106–119): T = VL + NC + MTC; chi phí chung 7%, nhà tạm 1%, không xác định KL 3% (rates typed in D); thu nhập chịu thuế tính trước 6%; VAT 8%; DỰ TOÁN vs THỰC TẾ per khoản mục. Header row 3: default VAT 8%, tổng dự toán 10.650.193.785,77.
- **In A4 – HĐ-TT** (A1:AC56, rows 6–33 = 28 NCC): A NCC, E HĐ đã xuất gồm VAT, G đã thanh toán theo sổ chi, H **nhập rà soát thực nộp** (override), I thực nộp = H or G, J cần nộp thêm = max(0, E − I), K đã nộp vượt HĐ, L % TT/HĐ, Q dòng DT-TT, R thực tế chốt dòng DT-TT, S thực tế riêng NCC (split when one DT-TT line has several NCC), T thực tế, U chênh TT − HĐ, V nợ thực tế = T − I (ignores X), W sẽ lấy về = max(0, J − V), X đã lấy về (typed), Y còn phải lấy về = W − X, Z ghi chú việc cần làm. Row 34 totals.

Noise not to model: Dự Toán price chain, intermediate sheets (Kế Hoạch Lấy HĐ theo NCC, Theo Dõi VT theo NCC, Đối Chiếu HĐ – Thanh Toán, Hiệu Quả DT – Thực Tế, Cần Lấy HĐ…, PT Vật Tư VS, Đối Chiếu Chi Tiết, Đối Ứng Vật Tư, Tổng Hợp VT Chính, Thanh Toán Hợp Đồng, Báo Lấy HĐ), auto "độ tin cậy" text.

Current golden totals (workbook as saved 17/11/2026 14:48, after reconciliation edits): DT-TT H81 (tổng A NCC) = 6.531.555.276,72; H95 (tổng B nhân công) = 1.984.224.628; H102 = 8.515.779.904,72; HĐ-TT E34 = 6.237.094.910,14, I34 = 5.736.878.767, T34 = 6.652.018.280, X34 = 368.652.484.

## 4. The codebase (branch base must be `origin/main`, a77f7c4)

- Next.js 16.2 App Router, Prisma 7, PostgreSQL 16. `AGENTS.md`: read `node_modules/next/dist/docs/` before writing Next code.
- du-an routes under `app/(app)/du-an/[id]/`: cai-dat, can-doi-vat-tu, cong-no, dinh-muc, dong-tien-3-ben, du-toan, du-toan-dieu-chinh, giao-dich, hop-dong, nghiem-thu, phat-sinh, tien-do.
- Services `lib/du-an/*.ts`: estimate-service, transaction-service, can-doi-service (+ can-doi-metrics.ts pure functions), material-group-service, material-group-rollup ("KHÔNG quy đổi đơn vị"), supplier-debt-service (groups `tra_tien` by `partyName`), contract-service, settings-service, schemas.ts.
- Models (`prisma/schema.prisma`): `Project` (266), `ProjectCategory` (293, hạng mục), `ProjectEstimate` (380: categoryId, itemCode, itemName, unit, qty, unitPrice, totalVnd, materialGroupId, importRunId), `ProjectMaterialGroup` (411: only name/note, per project), `ProjectTransaction` (457: one row carries both HĐ and TT — amountHd, amountTt, qtyHd, partyName free text, invoiceNo, type lay_hang|nhan_cong|may_moc), `ProjectContract` (489: partyName text, valueVnd), `Project3WayCashflow` (513: CĐT↔cty↔đội, not NCC), `ProjectSettings` (537: vatPct default 0.1 …), `Supplier` (235: name, taxCode = MST), `Entity` (218).
- Import engine `lib/import/*` (preview → review → commit, `importRunId` on rows, rollback guards). Adapters in `lib/import/adapters/`: `bang-can-doi-vat-tu.adapter.ts` (hardcodes project MNTC-GD1; wrote the 362 estimates + 117 HĐ-only transactions), `du-an-xay-dung.adapter.ts` (Dự Toán + Giao Dịch sheets), `du-toan-tong-hop-vt.adapter.ts`, `excel-utils.ts`, `vat-tu-chuyen-doi/*` (cutover; has date helpers).
- Export: `app/api/du-an/[id]/can-doi/export/route.ts`, `app/api/export/excel/route.ts`; print CSS in `app/globals.css`. Editable grid: `components/data-grid/*` (+ inline "+ Tạo mới" quick-create of suppliers on the working branch, not yet on main).
- Permissions: `ProjectPermission`, `ProjectGrantAll`; module release states in `module_availability`.

## 5. Data state (local copy of production export, project 4)

- project_estimates 362 rows, project_categories 6, project_material_groups 0, project_contracts 0.
- project_transactions 117: lay_hang 107 (HĐ 3.654.194.738), may_moc 8 (153.530.093), nhan_cong 1 (416.607.407), chi_phi_chung 1 (240.258.393); amountTt = 0 on all. These are the rows to replace.
- Company supplier ledger (`ledger_transactions`, material) for project 4 now **agrees with the team workbook per supplier** on thực tế, HĐ, thực trả and trả theo HĐ for 25 of 26 suppliers after the 13–17/11 reconciliation (Sobek differs only in how the company's direct transfer is booked). Report: `plans/reports/doi-chieu-mam-non-sau-sua-file-doi-17-11.xlsx`. The company ledger has no tổ nhân công, Ông Sơn vật tư lẻ or chi khác.

## 6. Constraints

- Do not change numbers of existing tabs (Cân đối vật tư, Định mức, Công nợ, Giao dịch) for other projects; MNTC-GD1's old transactions are replaced by decision 1.
- Feature must work for any project (no hardcoded project code in new code).
- Vietnamese UI copy; existing data-grid, quick-create and export patterns; files < 200 lines where sensible; pure functions for report math with unit tests (vitest), integration tests need their own Postgres.
- Back up before data changes; production (admin-pc) is untouched until a deploy is approved.
- Do not store computed totals or confidence text; derive them.

## 7. Open design questions the candidates must answer

- **D1 — Source of "thực tế" per NCC / đầu mối** (feeds DT-TT Phần II, HĐ-TT T, DT-HĐ L–Q): (a) a figure entered per đầu mối (workbook's way); (b) derived from the đội's receipt log (Thực Tế Nhập has no supplier column today); (c) read from the company supplier ledger, now verified equal for material NCCs — but labor, Ông Sơn and chi khác are not there, and decision 2 keeps the đội's book separate. Hybrid answers are allowed; justify.
- **D2 — Data model**: new independent streams (invoice header+lines, receipts, cash payments, mapping, đầu mối) vs extending `ProjectTransaction`.
- **D3 — Mapping**: one alias table keyed (project, source, tên|ĐVT) → Mã nhóm / DT line / hệ số / status, vs mapping at entry time.
- **D4 — Đầu mối model**: how legal NCC fold into report lines (Sobek ← Chương Dương + LPP) and how tổ nhân công / Ông Sơn / chi khác appear.
- **D5 — Delivery order and the one-off import** of this workbook (with gates against the golden totals above) versus building entry screens first.
- **D6 — Phần III inputs** (rates 7%/1%/3%/6%/8% and who enters them).
