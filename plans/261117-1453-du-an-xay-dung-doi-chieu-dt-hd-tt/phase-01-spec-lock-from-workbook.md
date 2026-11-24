---
phase: 1
title: "Spec lock from the workbook"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: Spec lock from the workbook

## Goal
Write down every report formula, input layout and data mismatch the code depends on, with cell references, so no report code or gate is written on a guess.

## Already verified (17/11/2026, orchestrator)
- **DT-TT H53:H100 bases:**
  - SUM over Thực Tế Nhập G: H57 Đại Ngàn (G81:G94 + SUMIFS G112:G119 on L "\*ngàn\*"), H58 Kim khí (G95:G110 + SUMIFS G112:G119 on L "\*Hiếu\*"), H60 Bê tông (G121:G133), H61 Anh Thư (G8:G27), H62 Quang Minh (G30:G78), H63 Nam Hương (G135:G150 + G152:G153).
  - The ranges of H57 and H58 are disjoint; the dây thép rows split by label.
  - Σ Hóa Đơn I by MST × (1 + $E$3): H59 Thanh Tùng, H67 Đông Yên, H74 Phương Vũ.
  - SUMIFS on Chi Thực Tế K by mục H: H99 Ông Sơn = mục I, H100 chi khác = mục II.
  - Sheet 'Thanh Toán Hợp Đồng': H53 Tiến Phát and H54 Tiến Đạt (F), H84–H94 tổ nhân công (J). These become `manual`.
  - Constant formula H72 Việt Đức; H78 Vật tư phụ from 'Hiệu Quả DT – Thực Tế'.
  - Typed: H55, H56, H65, H66, H68–H71, H73, H75–H77. Blank: H64, H79, H80.
- **HĐ-TT:**
  - T = S if present. Otherwise, when the DT-TT line holds several NCC: R − (Σ S of the others + Σ E of the others without S). Otherwise R. Otherwise E (temporary).
  - V = T − I (ignores X). W = max(0, J − V). Y = W − X.
- **T34 − H81 = 120.463.003** = Đất Việt Phát 125.000.040 (temporary = HĐ) − Vật tư phụ 4.537.037.
- **Phần III (rows 106–119):** T = VL + NC + MTC. Chung 7%, nhà tạm 1% and không xác định KL 3% are taken on T. Thu nhập chịu thuế 6% is taken on (T + GT). VAT 8% is taken on G. Tổng = 10.650.193.785,77.
- **Ánh Xạ DT:** 343 lines, 91 Mã nhóm. NC-KHOAN and PHA-DO mix NC and MTC, so loại is per DT line.
- **ERP estimates of project 4:** 362 rows, 338 distinct lower(trim) name|unit keys. 21 keys span several hạng mục. The 6 categories are HM1-VL/NC/MAY/CPC, HM2-VL and HM3-VL.

## Files to Create / Modify
- Create: `plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/workbook-spec-dump.md`.
- Create in the scratchpad only, never committed: a node + SheetJS dump script.

## Tasks & Steps
1. Dump formulas and cached values of:
   - one full DT-HĐ NCC block (L–Q **and Tình trạng J**) for 3 blocks, one of them with a cross-assigned group, plus Phần B;
   - DT-TT Phần I rows 5–50, including the "↳ chỉ gán tới nhóm" rows;
   - DT-TT Phần II columns B–G;
   - HĐ-TT columns A–Z, rows 6–34.
2. For every receipts-basis H cell, list the exact Thực Tế Nhập row set. Assert three things:
   - only the two verified shapes occur: SUM of contiguous ranges, and SUMIFS over a range with a wildcard on L;
   - no row is counted by two đầu mối;
   - no "Cộng đến" row lies inside a range.
   Any violation turns that đầu mối into `manual`.
3. Compare the DT-HĐ Tình trạng labels and thresholds with `bucketOf` (`lib/du-an/can-doi-metrics.ts:45-77`). Record whether it can be reused or a local rule is needed.
4. Keys:
   - count normKey collisions with the unit normaliser (NFKD + unit aliases) across Ánh Xạ DT/HĐ/TT;
   - count unit-only collisions separately;
   - two-way compare the 343 Ánh Xạ DT keys with the 338 ERP estimate keys (key, Σ qty, Σ totalVnd, kind);
   - list every key present on only one side.
5. Measure the MST match rate of Hóa Đơn and Ánh Xạ Tên NCC against `suppliers.taxCode` on the local copy, after digit normalisation and left-padding. List duplicates and missing MSTs.
6. List the date and amount cells that are not numeric in Hóa Đơn, Thực Tế Nhập and Chi Thực Tế (3- or 5-digit years, swapped day/month, decimal commas).
7. Count the invoice lines whose DT key spans several hạng mục; they affect the old tabs.
8. Record the per-row goldens: DT-TT rows 53–80, 84–94 and 98–100; HĐ-TT rows 6–33.

## Verification
- `workbook-spec-dump.md` contains each formula with its cell reference, every Phần II row with its basis and row set, the collision counts, the two-way key diff, the MST match table and the list of unparseable cells.
- If the key diff is not empty, the user decides which side wins before phase 4 (plan question 1).
