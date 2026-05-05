# Import Adapter Diagnostic Report
**Date:** 2026-05-05  
**Investigator:** debugger agent  
**Scope:** 5 non-material adapters (DuAnXayDung, TaiChinhNq, GachNamHuong, QuangMinh, SlDt)

---

## Executive Summary

All 5 adapters are broken. Root cause falls into 2 categories:

1. **Excel structure mismatch** (DuAnXayDung, GachNamHuong, QuangMinh, SlDt): adapter's `sheet_to_json` (no `header` option) treats the **first row as column headers**. The SOP files have 3–7 title/banner rows before the real header row. Result: all data columns arrive as `__EMPTY_N` keys; every named lookup (`r['Ngày']`, `r['Tên VT']`, etc.) returns undefined → parse yields 0 usable data rows.

2. **Wrong sheet detection / column mismatch** (TaiChinhNq): sheets are found correctly, but column names in the Excel differ from what the adapter expects. No loan rows parsed (0); 727 journal rows parsed but will all commit to DB with `entryType` incorrectly classified and `Số tiền` will be accepted correctly but `fromAccount`/`toAccount`/`Danh mục` columns are absent.

Priority fix order: **GachNamHuong = QuangMinh > SlDt > DuAnXayDung > TaiChinhNq**

---

## Adapter 1: DuAnXayDung (`du-an-xay-dung.adapter.ts`)

**Status: BROKEN-PARSE**

### Parse Result
- Meta sheet (Dashboard): 47 rows, all with emoji header key `📊  DASHBOARD TỔNG QUAN DỰ ÁN`. Keys `Mã DA`, `Tên dự án`, `Code`, `Name` absent → defaults to `code='DA001'`, `name='Dự án nhập'`.
- Estimate sheets ("Dự Toán", "Dự Toán Điều Chỉnh"): 49 + 53 rows, but **header row in the Excel is row index 1** (title `📋  DỰ TOÁN NGÂN SÁCH` is row 0). `sheet_to_json` uses row 0 as header → all data columns are `__EMPTY_N`. Key `Mã VT` / `Code` never present → 0 estimate rows emitted.
- Transaction sheet ("Giao Dịch"): 199 rows with emoji title `📝  GIAO DỊCH THỰC TẾ` as header. Key `Ngày` / `Date` never present → 0 transaction rows emitted.
- **Total rows parsed: 1** (the project stub with hardcoded defaults only).

### Bugs

| # | File:Line | Bug | Fix |
|---|-----------|-----|-----|
| 1 | `du-an-xay-dung.adapter.ts:47` | `sheet_to_json` without `header` option treats emoji title row as header. Real headers are on row index 1. | Use `XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false, header: 1 })` then slice off title rows until the real header row is detected (e.g., first row containing "Hạng Mục" or "Mã Item"). |
| 2 | `du-an-xay-dung.adapter.ts:46–63` | Meta extraction from Dashboard sheet fails. Keys `Mã DA`, `Tên dự án` don't exist in `__EMPTY_N`-keyed rows. Project code/name always defaults. | Skip Dashboard; extract project info from a `CauHinh`/`README` approach, or prompt user via `meta` field instead. |
| 3 | `du-an-xay-dung.adapter.ts:71` | Estimate column key is `Mã Item` in actual sheet, not `Mã VT`. | Change lookup to `r['Mã Item'] ?? r['Code'] ?? r['Mã VT']`. |
| 4 | `du-an-xay-dung.adapter.ts:131` | `apply()` signature omits `importRunId` param (4th). `project_estimates` and `project_transactions` tables lack `importRunId` column → rows tagged only at project level, not run level. Rollback impossible. | Add `importRunId` to `project_estimates` and `project_transactions` tables and pass it in INSERT statements. |
| 5 | `du-an-xay-dung.adapter.ts:146` | `prismaRef.project.create` and `prismaRef.projectCategory.create` go through audit extension's `.create` hook — this writes an extra audit row per insert. Not a crash but creates noise for bulk imports. | These are single-record creates (project, category), not bulk — acceptable as-is. |

### Estimated rows when fixed: ~49 estimates + ~198 transactions

---

## Adapter 2: TaiChinhNq (`tai-chinh-nq.adapter.ts`)

**Status: BROKEN-PARSE (loans), BROKEN-APPLY (journals — wrong column mapping)**

### Parse Result

**Loan sheets:**
- `Thanh toán vay`: 0 rows (sheet is empty — confirmed).
- `Hợp đồng vay`: 989 rows, all null/empty. Sheet has columns `Mã hợp đồng`, `Tên đối tác`, `Ngày bắt đầu`, etc. — none match adapter keys `Chủ nợ`, `Bên vay`, `Lender`. → **0 loan rows parsed**.

**Journal sheet (`Sổ nhật ký giao dịch`):**
- 1269 rows total, 727 have a `Ngày` value → **727 rows parsed**.
- Actual columns: `Ngày`, `Loại`, `Nội dung`, `Số tiền`, `Nguồn`, `Mã hợp đồng`, `Loại cụ thể`.
- Missing: `Tài khoản nợ`, `Tài khoản có`, `Danh mục`, `Ghi chú` → all default to empty string/undefined.
- `Số tiền` format is `"100,000,000 ₫"` → `toNum()` strips non-digit/dot/minus → 100000000 ✓ (correct).
- `entryType` mapping on `Loại` values: `Thu nhập biến đổi/cố định` → `thu`, `Chi phí biến đổi/cố định` → `chi`, `Chuyển tiền đi/đến` → `chuyen_khoan`. All valid enum values ✓.

**Category sheet (`Danh sách Dropdown`):**
- 15 rows, keys are `Loại hợp đồng`, `Loại vay`, `Kỳ hạn` — not `Mã`, `Tên`. → **0 category rows parsed**.

### Bugs

| # | File:Line | Bug | Fix |
|---|-----------|-----|-----|
| 1 | `tai-chinh-nq.adapter.ts:51` | Loan lookup keys `Chủ nợ`, `Bên vay`, `Lender` don't exist in `Hợp đồng vay` sheet. Actual key is `Tên đối tác`. | Change to `r['Tên đối tác'] ?? r['Chủ nợ'] ?? r['Lender'] ?? ''`. |
| 2 | `tai-chinh-nq.adapter.ts:58` | Loan amount key `Số tiền` absent; actual key is `Số tiền gốc ban đầu`. | Change to `r['Số tiền gốc ban đầu'] ?? r['Số tiền'] ?? r['Principal'] ?? 0`. |
| 3 | `tai-chinh-nq.adapter.ts:59` | Rate key `Lãi suất` absent in `Hợp đồng vay`; actual column name is `Lãi suất` (present) ✓ — but VND-formatted rate strings (e.g. `"0.08"` or `"8%"`) may need special parsing. | Verify sample data; `toNum` may suffice. |
| 4 | `tai-chinh-nq.adapter.ts:60–61` | Date keys `Ngày bắt đầu`/`Ngày kết thúc` — actual columns are `Ngày bắt đầu` ✓ and `Ngày đáo hạn` (not `Ngày kết thúc`). | Add `r['Ngày đáo hạn']` as fallback. |
| 5 | `tai-chinh-nq.adapter.ts:92–107` | Category sheet `Danh sách Dropdown` has wrong columns. Adapter expects `Mã`, `Tên` but sheet has `Loại hợp đồng`, `Loại vay`, etc. → 0 categories created. | The SOP file has no separate category sheet. Drop expense_category parsing or map to a dedicated sheet not present in the SOP. |
| 6 | `tai-chinh-nq.adapter.ts:84–88` | Journal rows: `fromAccount`, `toAccount` mapped from `Tài khoản nợ`/`Tài khoản có` (absent). Actual column is `Nguồn`. | Map `fromAccount` from `r['Nguồn'] ?? r['Tài khoản nợ']`. `toAccount` has no equivalent in this file. |
| 7 | `tai-chinh-nq.adapter.ts:126` | `apply()` omits `importRunId` param. `journal_entries` and `loan_contracts` tables lack `importRunId` column → rollback impossible. | Add `importRunId` column to both tables + pass in INSERTs. |

### Estimated rows when fixed: ~0 loans (data all null), ~727 journals

---

## Adapter 3: GachNamHuong (`gach-nam-huong.adapter.ts`)

**Status: BROKEN-PARSE**

### Parse Result

- Adapter reads `wb.SheetNames[0]` = `'SGV'`. This sheet is **empty** (0 rows). → **0 rows parsed, 0 conflicts generated**.
- The real data is in sheet `'Vật tư ngày'` (36 data rows after header) and `'Vật tư tháng'` (38 rows).
- Even if `'Vật tư ngày'` were read: the sheet has a 6-row header block (company name, title, project, material name, date range, blank row) before the actual column header row `STT | Ngày/tháng/năm | Khối lượng | ĐVT | Cán bộ vật tư | Chỉ huy công trường | Kế toán phụ trách`. `sheet_to_json` without `header:1` would treat row 0 (company name) as the column header → all data arrives as `__EMPTY_N` keys → lookup `r['Tên VT']`, `r['Ngày']`, `r['KL']` all return null.
- Additionally, the Excel tracks a **single material per file** (title: "Tên vật tư: Gạch đặc A1") — `itemName` must be extracted from the title row, not a column.

### Bugs

| # | File:Line | Bug | Fix |
|---|-----------|-----|-----|
| 1 | `gach-nam-huong.adapter.ts:32–33` | Reads `wb.SheetNames[0]` = `'SGV'` (empty). Data is in `'Vật tư ngày'`. | Find sheet by name: `wb.SheetNames.find(n => n.includes('ngày') \|\| n.includes('ngay') \|\| n.includes('tháng'))`. |
| 2 | `gach-nam-huong.adapter.ts:36–38` | `sheet_to_json` without `header:1` uses company banner as header row. Real header is at row index 6. | Use `{ header: 1 }` and skip rows until finding `['STT', ...]` pattern, or use `{ range: 6 }` option to start parsing from row 6. |
| 3 | `gach-nam-huong.adapter.ts:45` | Lookup `r['Tên VT']` will never match. Actual column header is `Ngày/tháng/năm` (date) and the material name is in the title cell, not per-row. | Parse material `itemName` from header block (row 3: `"Tên vật tư: Gạch đặc A1"`); set as a constant for all data rows. Per-row: map `Ngày/tháng/năm` → date, `Khối lượng` → qty, `ĐVT` → unit, `Cán bộ vật tư` → cbVatTu, `Chỉ huy công trường` → chiHuyCt. |
| 4 | `gach-nam-huong.adapter.ts:85` | `apply()` has `_importRunId` param (underscore = unused). `supplier_delivery_daily` table lacks `importRunId` → rows not rollback-tagged. | Add `importRunId` column to `supplier_delivery_daily` and use it in INSERT. |

### Estimated rows when fixed: ~36 rows (`Vật tư ngày` sheet)

---

## Adapter 4: QuangMinh (`quang-minh.adapter.ts`)

**Status: BROKEN-PARSE**

### Parse Result

Identical structural problem as GachNamHuong. The SOP file has **the same 4-sheet layout**: `SGV` (empty), `Vật tư ngày`, `Vật tư tháng`, `Đối chiếu công nợ`.

- Adapter iterates all sheets (correct approach in principle).
- For each sheet: `sheet_to_json` without `header:1` treats row 0 (company name `"CÔNG TY CP XÂY DỰNG NGÔ QUYỀN"`) as header. All data under `__EMPTY_N` keys.
- Lookup `r['Tên VT']`, `r['Mặt hàng']`, `r['Item']` → all null → 0 rows emitted per sheet.
- File also contains one material per file (`"Tên vật tư: Cát"` in title row), not a per-row column.

### Bugs

| # | File:Line | Bug | Fix |
|---|-----------|-----|-----|
| 1 | `quang-minh.adapter.ts:38–39` | `sheet_to_json` without `header:1`. Same root cause as GachNamHuong. | Use `{ header: 1 }` and detect the actual header row dynamically (row containing `'STT'`). |
| 2 | `quang-minh.adapter.ts:44` | Lookup `r['Tên VT']` never matches. Material name lives in title row, not data column. | Extract material name from header block row 3 (`"Tên vật tư: ..."`) per sheet. Augment each data row with that `itemName`. |
| 3 | `quang-minh.adapter.ts:85` | `_importRunId` unused. `supplier_delivery_daily` lacks `importRunId` column. | Same fix as GachNamHuong. |

### Estimated rows when fixed: ~36 rows (`Vật tư ngày` sheet)

---

## Adapter 5: SlDt (`sl-dt.adapter.ts`)

**Status: BROKEN-PARSE**

### Parse Result

**targetsSheet detection:**
- `findSheet(wb, 'Chỉ tiêu')` splits on space → searches for `n.toLowerCase().includes('chỉ')`.
- First match: `'Chỉ tiêu SL DT Tháng 07'` ✓ (finds a real targets sheet).
- But that sheet has a 7-row title block before the header row. `sheet_to_json` without `header:1` → header becomes the first non-empty cell → all data cols are `__EMPTY_N`. Key `'Dự án'` absent → 0 target rows parsed.

**paymentsSheet detection:**
- `findSheet(wb, 'Tiến độ nộp tiền')` → searches for `n.includes('tiến')`.
- First match: `'TIẾN ĐỘ XÂY DỰNG THÁNG 11'` — **this is a construction progress sheet, NOT the payment schedule sheet**. Correct sheet is `'TIẾN ĐỘ NỌP TIỀN'` which also contains `'tiến'` but is not first.
- Even `'TIẾN ĐỘ NỌP TIỀN'` has a pivot-style layout (Đợt 1..4 as columns, not rows). Adapter expects rows with `Đợt`, `Ngày KH`, `Số tiền KH` columns — these don't exist in either sheet.

**Additional:** There are 6 monthly "Chỉ tiêu SL DT Tháng XX" sheets in the file (one per month). Adapter only reads the first match (`Tháng 07`). Months 08–12 are silently ignored.

### Bugs

| # | File:Line | Bug | Fix |
|---|-----------|-----|-----|
| 1 | `sl-dt.adapter.ts:44` | `sheet_to_json` without `header:1` on multi-row-title sheets. 0 target rows parsed. | Use `{ header: 1 }` and skip rows until a row containing `'Dự án'` or `'STT'` is found. |
| 2 | `sl-dt.adapter.ts:26–29` | `findSheet` returns first `'tiến'` match = `'TIẾN ĐỘ XÂY DỰNG THÁNG 11'`, not `'TIẾN ĐỘ NỌP TIỀN'`. Wrong sheet read for payments. | Strengthen match: search for `'nộp'` or `'nop'` in addition to `'tiến'`; prefer `n.includes('nộp tiền')`. |
| 3 | `sl-dt.adapter.ts:41` | Only reads **one** "Chỉ tiêu" sheet (first month found). File has 6 monthly sheets (Tháng 07–12). | Iterate **all** sheets matching `'chỉ tiêu'` pattern, not just the first. |
| 4 | `sl-dt.adapter.ts:69–88` | Payment sheet `'TIẾN ĐỘ NỌP TIỀN'` has a matrix layout (projects as rows, payment batches as columns). Adapter expects row-per-batch with `Đợt`, `Ngày KH`, `Số tiền KH` columns. Schema mismatch — fundamental re-parse needed. | Transpose the matrix: for each data row (project name in col 0), iterate columns for each batch. |
| 5 | `sl-dt.adapter.ts:115` | `_importRunId` unused. `sl_dt_targets` and `payment_schedules` lack `importRunId` column. | Add `importRunId` column + use in INSERTs for rollback support. |

### Estimated rows when fixed: ~6 target sheets × N rows each + payment matrix rows

---

## Cross-Cutting Issues (All 5 Adapters)

| Issue | Adapters | Detail |
|-------|----------|--------|
| `importRunId` not persisted to target tables | All 5 | `project_estimates`, `project_transactions`, `loan_contracts`, `journal_entries`, `sl_dt_targets`, `payment_schedules`, `supplier_delivery_daily` have no `importRunId` column. Rollback via `rollbackImportRun()` only cleans `ledger_transactions` + `ledger_opening_balances`. These adapters write to other tables — full rollback impossible. |
| `apply()` signature missing `importRunId` | DuAnXayDung, TaiChinhNq | Declared as `apply(data, _mapping, tx)` — 4th param absent. JS won't crash (extra args ignored) but the value is inaccessible even if columns are added later. |
| No audit bypass needed for `.create()` | DuAnXayDung, TaiChinhNq | Both use `prismaRef.project.create`, `prismaRef.projectCategory.create`, `prismaRef.expenseCategory.create` (single-record creates). Audit extension's `create` hook fires and writes an audit log row per insert — not a crash, but adds noise and latency for bulk imports. CongNoVatTu correctly avoids this via `$executeRaw`. |

---

## Priority Fix Ranking

| Priority | Adapter | Reason |
|----------|---------|--------|
| 1 | **GachNamHuong** | Simplest fix (wrong sheet + header row). Real-world supplier data at risk of never being imported. ~36 rows. |
| 2 | **QuangMinh** | Identical structure to GachNamHuong. Fix in tandem. ~36 rows. |
| 3 | **SlDt** | Header row fix + sheet detection fix. Multiple monthly sheets present. Data volume significant. |
| 4 | **DuAnXayDung** | Header row fix + column key corrections. Project data is critical but fix is more involved (multi-sheet, header detection). |
| 5 | **TaiChinhNq** | Journal rows do parse (727) and *could* commit, but column mapping gaps (no fromAccount/toAccount/category). Loan data entirely missing. Lower urgency since no crash — but data quality is poor. |

---

## Unresolved Questions

1. **GachNamHuong / QuangMinh single-material-per-file design**: should the adapter accept multiple material files (one per material) or should users combine into one multi-material sheet? This affects whether `itemName` should come from the title row (current SOP) or a per-row column.
2. **SlDt payment matrix**: the `TIẾN ĐỘ NỌP TIỀN` sheet has 4+ payment columns (Đợt 1–4 each with a Nộp tiền + Tiến độ sub-column). Are payment amounts confirmed numbers or progress percentages? Clarify before implementing the matrix-transpose parser.
3. **TaiChinhNq loan data**: `Hợp đồng vay` sheet is entirely null data rows despite having 989 rows with a valid header. Is this an intentional empty template, or is loan data in a different file?
4. **importRunId rollback scope**: should DuAnXayDung/TaiChinhNq/SlDt support rollback? Requires schema migrations to add `importRunId` to 6+ tables. Confirm scope before fixing.
