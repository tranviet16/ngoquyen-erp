# Phase 1 — Spec lock from the workbook (17/11/2026)

Source: `Can Doi Vat Tu 2.xlsx` as saved 17/11/2026 14:48. ERP side: local copy, project 4 (MNTC-GD1).
Scripts (scratchpad, not committed): `p1-analyze.cjs`, `xl-formulas.cjs`.

## 1. Report formulas

### DT-HĐ ('In A4 – DT-HĐ' is a print view of 'Kế Hoạch Lấy HĐ theo NCC')

Row types:
- An **NCC block row** (e.g. row 11):
  - G = DT of the NCC's groups.
  - H = HĐ-TT C of that NCC (HĐ chưa VAT). I = G − H.
  - L = DT-TT H of the đầu mối line R. M = L / (1 + DT-TT F of that line).
  - N = Σ HĐ-TT C of NCC whose Q = R.
  - **O = N − S − T**, where S = HĐ in its groups and T = HĐ unassigned / outside DT. **P = M − N.**
- A **group row** (Mã nhóm + name): G, H, I and the status counts.
- A **DT line row**: C KL DT, D KL HĐ quy đổi, E KL thiếu, F KL vượt, G DT value, H HĐ value, I = G − H, J status.
- A **"↳" row**: an invoice item with "[SL × hệ số]" and the mapping confidence.
- A **tie-out row** "= TỔNG HĐ DO NCC XUẤT …": H = Σ of the block, and J = "✓ Khớp sổ Hóa Đơn" when |H − block H| < 1.

Rules for a DT line (`Kế Hoạch` K/M and `Theo Dõi VT theo NCC` U):
- KL thiếu = max(0, F − I) and KL vượt = max(0, I − F). Both are blank when F ≤ 0, or when I = 0 with J > 0.
- KL HĐ = Σ over Ánh Xạ HĐ rows with K = STT of (SL × hệ số). HĐ value = Σ of their E.
- **Status:**
  1. DT KL ≤ 0: "Chưa có HĐ" or "Theo dõi theo giá trị".
  2. KL = 0 and value = 0: "Chưa có HĐ".
  3. Any mapped line has no hệ số: "Chưa kết luận (thiếu hệ số)".
  4. KL = 0 with value > 0: "Theo dõi theo giá trị".
  5. Otherwise, with tolerance **2 %** ('Theo Dõi VT theo NCC'!O8): > DT·1.02 is "Vượt"; ≥ DT·0.98 is "Đủ"; else "Còn thiếu".
- These labels and this rule differ from `bucketOf` (`can-doi-metrics.ts`: Chưa lấy / Thiếu / Đủ / Vượt / Ngoài DT; tolerance max(1.000 đ, 0,5 %)). **Decision: write a local rule; do not reuse `bucketOf`.**
- Group row: the status counts are "n thiếu | n vượt | n đủ | n chưa HĐ | n theo GT/thiếu hệ số".

### DT-TT Phần I ('Hiệu Quả DT – Thực Tế')
- L (TT gồm VAT) = SUMIFS of Ánh Xạ TT F by DT STT. K đơn giá TT = L / J.
- Chênh P = I − L.
- **Do KL Q = M × H**, where M = KL DT − KL TT and H = đơn giá DT.
- **Do đơn giá R = O × J**, where O = đơn giá DT − đơn giá TT and J = KL TT.
- The report shows L, K and P divided by (1 + E3 = 8 %).
- The "↳ Thực nhận chỉ gán tới nhóm" rows carry receipts mapped to a group without a DT line.

### DT-TT Phần II (rows 53–100), bases

| Line | Basis | Detail |
|---|---|---|
| H57 Đại Ngàn | receipts | G81:G94 + G112:G119 where L contains "ngàn" (18 rows) |
| H58 Kim khí TT | receipts | G95:G110 + G112:G119 where L contains "Hiếu" (18 rows) |
| H60 Bê tông HP | receipts | G121:G133 (13 rows) |
| H61 Anh Thư | receipts | G8:G27 (20 rows) |
| H62 Quang Minh | receipts | G30:G78 (49 rows) |
| H63 Nam Hương | receipts | G135:G150 + G152:G153 (18 rows) |
| H59 Thanh Tùng, H67 Đông Yên, H74 Phương Vũ | invoices | Σ Hóa Đơn I by MST × (1 + E3) |
| H99 Ông Sơn | payments, mục I | SUMIFS of Chi Thực Tế K by H = "I" |
| H100 chi khác | payments, mục II | SUMIFS of Chi Thực Tế K by H = "II" |
| H53 Tiến Phát, H54 Tiến Đạt, H84–H94 tổ nhân công | manual | come from 'Thanh Toán Hợp Đồng', which is not an input stream |
| H72 Việt Đức | manual | constant formula 292852072 + 6360336 |
| H78 Vật tư phụ | manual | from 'Hiệu Quả DT – Thực Tế' AD |
| H55, H56, H65, H66, H68–H71, H73, H75–H77 | manual | typed |
| H64 Đất Việt Phát, H79, H80 | blank | – |

Receipt sets verified:
- Each recomputed sum equals the cached H exactly.
- No row is claimed by two đầu mối.
- No "Cộng đến" row lies inside a range.
- Only the two parsed shapes occur.
- Of the 239 receipt rows with an amount, 112 are tagged. The other 127 (657.987.498) belong to đầu mối on the invoice or manual basis (thiết bị điện, máy xúc…) and stay untagged.

### HĐ-TT
- T = S. Otherwise, if the DT-TT line has several NCC, T = R − (Σ S of the others + Σ E of the others without S). Otherwise T = R. Otherwise E (temporary).
- V = T − I (ignores X). W = max(0, J − V). Y = W − X.
- **T34 − H81 = 120.463.003** = Đất Việt Phát 125.000.040 (temporary = HĐ) − Vật tư phụ 4.537.037.

### Phần III
- T = VL + NC + MTC.
- Chung 7 %, nhà tạm 1 % and không xác định KL 3 % are taken on T.
- Thu nhập chịu thuế 6 % is taken on (T + GT).
- VAT 8 % is taken on G.
- Tổng = 10.650.193.785,77, with T = 8.428.489.474,21.

## 2. Keys and Dự toán: the workbook vs the ERP

**The key must include loại.** The workbook has the same name|ĐVT under VL, NC and MTC; for example, "Bê tông bọt chống nóng mái M75" appears as STT 15, 302 and 326. The DT-line key is therefore `normVtName(tên) | normUnit(ĐVT) | loại`, with the ERP loại taken from the category suffix (VL / NC / MAY → MTC).

| | Workbook (Ánh Xạ DT) | ERP estimates |
|---|---|---|
| Lines / rows | 342 lines with KL (plus BS2 "Vật liệu khác %", without KL) | 362 rows |
| Distinct keys (with loại) | 341 | 340 |
| Σ value (T) | 8.428.489.474 | 8.373.232.517 |

The ERP is **55.256.957 lower**. Explained by line:

| Type | Workbook | ERP | Δ (workbook − ERP) |
|---|---|---|---|
| **Only in the workbook** | BS2 "Vật liệu khác (theo % VL)" 64.294.538; STT 325 "Máy khác %" 7.892.421 | – | +72.186.959 |
| **Only in the ERP** | – | "Vữa M250" 3 m³ 2.910.000; "Vữa M100" 16 m³ 13.920.000 | −16.830.000 |
| **Different quantity** | STT 231 "Thanh cái Cu ICP=50A": 2 hệ (200.000) | 3 hệ (300.000) | −100.000 |
| Same money, different presentation | STT 340 / 341 "Nhân công / Máy hạng mục PHÁ DỠ" grouped (26.825.869 + 88.818.320) | detail spread over STT 298, 304, 307, 312, 324, 339 | 0 |
| Same money, renamed | "Gạch không nung 6,0x10,5x22cm" 318.462.803 | "Gạch đặc không nung" 311.692.276 + 6.770.526 | 0 |
| Same money, renamed | "Chống thấm cổ ống bằng thanh trương nở hyperstop"; "Khí gas" | "…băng thanh Trương nở"; "Khí ga" | 0 |
| Wrong unit in the ERP | "Sơn tĩnh điện…" kg | m3 | 0 |
| Merged by key (accent typo) | STT 110 "báo hộ" + 112 "bảo hộ" (4.259.979 + 9.797.952) | one line 14.057.931 | 0 |
| Blank name | BS1 17.928 (A33.0345) | included in "Cồn rửa" | 0 |

By loại:
- NC is equal: 2.134.640.456.
- VL: workbook 5.796.944.130, ERP 5.749.579.593.
- MTC: workbook 496.904.887, ERP 489.012.465.

**Consequence:** with the ERP Dự toán as it is, Phần III cannot reach 10.650.193.785,77, and gate 12 would block. This needs a user decision (see the end).

## 3. Mapping sheets
- Ánh Xạ HĐ: 229 distinct keys; Ánh Xạ TT: 144. No conflicting collisions, and no unit-only merges under the new `normUnit`.
- 21 invoice lines (512.933.307) map to DT keys that span several hạng mục: cát, đá, xi măng, thép hình/tấm, dây thép, que hàn, đinh. In the old tabs they will sit on the largest-value hạng mục.
- 59 invoice lines (176.221.358) have no DT line. They appear as "Ngoài DT" / Phần B.

## 4. NCC and MST
- Every invoice NCC has an MST in the workbook, stored as text, so leading zeros are kept.
- In the ERP, **only 6 suppliers carry an MST**: the six added on 13/11 (#85–90). There are no duplicates.
- The other 22 invoice NCC therefore have no MST match. They must be mapped by name in the review screen, using Ánh Xạ Tên NCC J/K as the suggestion.
- **Plan change:** the review shows these as `supplier:` conflicts pre-filled from an exact normalised-name match. When the admin confirms a match, it may also fill the ERP supplier's empty `taxCode` (master data, kept on rollback; listed in review).

## 5. Unparseable or missing cells
- **Hóa Đơn:** none.
- **Thực Tế Nhập:**
  - 140 item rows have no date in D. These are the 2nd and later lines of one delivery, so the date carries down within the delivery.
  - No E/F/G value is non-numeric.
- **Chi Thực Tế:**
  - 12 dates are embedded in voucher text, e.g. "PC03 Đoàn; 14/01/2026" or "PC Chiến, 24/09/2026". They are extracted with a regex, and the voucher text goes to `dateText`.
  - **24 rows have no date at all** (section IV, rows 112–134: Bê tông HP, Anh Thư, Nam Hương, Việt Đức, Quang Minh, Nhôm kính, Phương Vũ…). They are stored with `date = null` and `dateText = ''`; the review lists them as "chưa có ngày" (warning, not blocking).

## 6. Plan changes from this phase
- Phase 2/3: the DT-line key includes loại. `normUnit` is confirmed.
- Phase 3: a local status rule (2 % tolerance and the workbook labels) instead of `bucketOf`. O = N − S − T and P = M − N are pinned. Phần I "do KL / do đơn giá" is pinned as above.
- Phase 4:
  - suppliers are mapped mainly by name (MST exists for only 6), with an optional fill of empty `taxCode`;
  - Chi Thực Tế dates are extracted from text; missing dates are allowed with a warning;
  - receipt dates carry down within a delivery.
- Gate 12 (Phần III) depends on the Dự toán decision below.

## Unresolved questions
1. Dự toán: the ERP lacks 72.186.959 (Vật liệu khác %, Máy khác %), has 16.830.000 of vữa the workbook does not, and has Thanh cái at 3 hệ instead of 2. It also uses older names and one wrong unit. Which Dự toán is correct, and how should the ERP be brought in line?
