# Ứng viên kế hoạch 3 — Lăng kính "luồng công việc người dùng trước"

Ngày: 2026-10-06. Nguồn duy nhất: `reports/debate-evidence-packet.md` + đọc kiểm chứng mã nguồn (chỉ đọc). Mọi `path:line` dưới đây đã được grep lại.

Ba luồng người dùng định hình thiết kế:
- **Cán bộ vật tư** nhập phiếu ngày tại `/vat-tu-ncc/[id]/ngay` và cập nhật báo giá tại `/bao-gia`; họ cần thấy giá trước, mức chênh lệch và được gợi ý đơn giá ngay lúc nhập phiếu.
- **Kế toán** làm việc trên một NCC tại `/vat-tu-ncc/[id]`: chốt kỳ với biên linh hoạt, ghi chuyển khoản và thuế hoá đơn ở tab "Thanh toán", rồi đối chiếu và lấy chữ ký. Kế toán không phải nhảy sang `/cong-no-vt/nhap-lieu`.
- **Lãnh đạo** mở `/cong-no-vt/tong-hop` để xem ma trận NCC × Chủ thể theo bất kỳ mốc thời gian nào và xuất file Excel giống sheet "Công Nợ".

## Tổng quan kiến trúc

- **Không cần migration.** `transactionType` là `String` và không có CHECK constraint (packet §2), nên `thue_hd` chỉ là giá trị mới. Thay đổi nằm ở union TS, hai schema zod, các fragment SQL dùng chung và nhãn UI.
- **Một module fragment SQL** `lib/ledger/ledger-sql-fragments.ts` định nghĩa ba biểu thức cho cả TT lẫn HĐ: `signed` (âm cho `thanh_toan`, dương cho phần còn lại), `increase` (`lay_hang`, `thue_hd`, `dieu_chinh>0`) và `decrease` (`thanh_toan`, `|dieu_chinh<0|`). Kèm theo là hằng TS `DEBT_INCREASE_TYPES`. Mọi truy vấn bị chạm đều dùng chung module này, nên quy tắc phân loại chỉ nằm ở một chỗ.
- **Một hàm truy vấn theo cửa sổ** `queryWindowByParty(ledgerType, {from, to, entityId})` thay lõi của `queryMonthlyByParty`. Hàm cũ được giữ làm wrapper để test parity và các lời gọi cũ không vỡ. `queryDebtMatrix` và `queryDetailReport` nhận thêm `from`/`to` theo cùng ngữ nghĩa: đầu kỳ = số dư ban đầu + Σ signed trước `from`; phát sinh và trả tính trong `[from, to]`.
- **Một module mốc thời gian thuần** `lib/ledger/report-period.ts` có hàm `resolveReportPeriod(params)` trả về `{preset, from, to, label}` ở UTC midnight. Module hỗ trợ tuần ISO, kỳ NCC (dùng lại `periodRange`) và đọc được URL cũ `?year&month`. Đi kèm là một component client duy nhất `ReportPeriodSelector` cùng hook `useReportPeriodUrl`, dùng chung cho 3 trang VT và 2 trang NC.
- **Ma trận theo đúng mẫu Excel.** Tái dùng `components/ledger/debt-matrix.tsx` (đã có sẵn nhưng chưa trang nào dùng). Mỗi nhóm Chủ thể gồm 6 cột LH TT, Trả TT, Nợ TT, LH HĐ, Trả HĐ, Nợ HĐ, cuối cùng là nhóm "TỔNG CÔNG TY". Phép quy đổi `toCongNoSheetCell` (LH = đầu kỳ + phát sinh tăng) là hàm thuần, dùng chung cho UI và Excel.
- **Tab "Thanh toán" thuộc mô-đun `vat-tu-ncc`.** Server action mới nằm ở `lib/vat-tu-ncc/supplier-payment-service.ts`, guard theo `vat-tu-ncc`, ghi qua `LedgerService("material").create` và vẫn đi qua `assertMaterialPeriodOpen`.
- **Biên kỳ linh hoạt dùng helper thuần** `lib/vat-tu-ncc/period-bounds.ts` (`validatePeriodBounds`, `suggestNextPeriod`). Helper được gọi ở `commitPeriodClose`, `previewPeriodClose` và `createReconciliation`. Advisory lock đổi sang khoá theo NCC để hai lần chốt có `from` khác nhau không chạy song song.
- **Snapshot kỳ đã ký không đổi schema.** `totalIn` vẫn chỉ là B (lấy hàng). Thuế nằm trong JSON (`totalTax`, `taxRows`). `closingBalance` có cộng thuế, giống cách `totalAdjust` đang được xử lý.

## Quyết định cho 7 điểm mở

1. **Gom `thue_hd`.** Dùng một module fragment chung `ledgerAmountSql(kind, col)` (trả `Prisma.Sql`) cho `querySummary`, `queryWindowByParty`, `queryDebtMatrix` và `queryDetailReport`. Ở `getBalancesBulk` chỉ sửa điều kiện FILTER thành `IN ('lay_hang','thue_hd')`, vì hàm này cố ý loại `dieu_chinh` (`lib/ledger/balance-service.ts:10`). `computeReconciliation` dùng hằng TS. Các truy vấn kiểu `CASE thanh_toan THEN - ELSE +` (`ledger-aggregations.ts:255`, `reconciliation-derive-service.ts:95`, `tai-chinh/dashboard-service.ts:107,120`, `tai-chinh/pr-sync-service.ts:128`) đã tự đúng nhờ nhánh ELSE nên không sửa. Snapshot ghi `totalIn` = B, `closingBalance` có cộng thuế, còn thuế lưu trong JSON. *Lý do:* có một nguồn quy tắc duy nhất, không cần migration, và nhất quán với cách `totalAdjust` đang được lưu.
2. **Truy vấn cửa sổ.** Thêm hàm mới `queryWindowByParty`; `queryMonthlyByParty` trở thành wrapper `{from: 1/m, to: cuối tháng}`. `queryDebtMatrix` nhận thêm `from?/to?` trong filter. `DetailReportFilters` nhận thêm `from?/to?` và vẫn giữ `year/month` cũ (mốc cắt). *Lý do:* test `cong-no-luy-ke.integration.test.ts:145` và các lời gọi cũ vẫn giữ nguyên chữ ký.
3. **Mô-đun mốc.** Logic nằm ở `lib/ledger/report-period.ts`: hàm thuần, UTC, hỗ trợ 7 preset, `isoWeekRange(isoYear, week)` (tuần 1 là tuần chứa ngày 4/1) và `isoWeekOf(date)`. URL dùng `?period=all|year|quarter|month|week|ncc|custom&y=&q=&m=&w=&from=&to=`. Nếu URL chỉ có `year/month`, `bao-cao-thang` hiểu là `month`, còn `chi-tiet` hiểu là "đến hết tháng" (`from = null`) để giữ đúng hành vi cũ. Phía client có `ReportPeriodSelector` (controlled) và hook `useReportPeriodUrl`. Tuần ISO được chọn bằng select Năm ISO + Tuần (1–52/53) kèm nhãn ngày, không dùng `<input type="week">` vì Firefox không hỗ trợ. *Lý do:* chỉ cần một nguồn tính biên cho 5 trang và cho Excel, và tính ở server khớp với cách lưu ngày UTC.
4. **Layout.** Trang `tong-hop` có hàng bộ lọc ở trên (mốc thời gian, multiselect Chủ thể, checkbox ẩn NCC = 0), nút "Xuất Excel" và "In" bên phải, dòng nhãn kỳ, rồi đến ma trận (cột NCC sticky, header 3 tầng). Hàng tổng nằm ở chân bảng, nhóm "TỔNG CÔNG TY" nằm cuối. Excel dựng trực tiếp bằng `XLSX.utils.aoa_to_sheet` trong template mới, gồm 2 hàng header (tên Chủ thể merge 6 cột, rồi 6 nhãn con) và `!merges`. `addSheet` không bị sửa. *Lý do:* sheet giống hệt mẫu "Công Nợ" mà không phải mở rộng API exporter cho một nơi dùng duy nhất.
5. **Tab Thanh toán.** Tạo server action mới `createSupplierPayment/updateSupplierPayment/deleteSupplierPayment/listSupplierPayments` trong `lib/vat-tu-ncc/supplier-payment-service.ts`, guard `vat-tu-ncc` (create/edit), ghi qua `LedgerService("material")`. *Lý do:* kế toán đang làm việc trong mô-đun `vat-tu-ncc`, và đã có tiền lệ `commitPeriodClose` ghi sổ cái dưới quyền `vat-tu-ncc`. Cách này tránh buộc phải cấp quyền create cho `cong-no-vt`.
6. **Quy tắc kỳ.** Hàm thuần `validatePeriodBounds({from, to, existing, selfId?})` lần lượt kiểm tra các điều kiện sau:
   - (a) `from <= to`.
   - (b) Không chồng lấn bất kỳ kỳ đã ký nào.
   - (c) Nếu đã có kỳ ký thì `from` phải bằng `periodTo` của kỳ ký mới nhất cộng 1 ngày.
   - (d) Không chồng lấn kỳ chưa ký có biên khác. Trùng đúng biên được phép, để việc chốt lại vẫn idempotent.

   `suggestNextPeriod` lấy `from` = ngày sau kỳ ký mới nhất. Nếu NCC chưa có kỳ ký nào, `from` = ngày của phiếu sớm nhất chưa có event `lay_hang`. `to` = ngày 26 gần nhất tính từ `from` trở đi. Helper được dùng ở `commitPeriodClose`, `previewPeriodClose` (để cảnh báo sớm) và `createReconciliation`. *Lý do:* một chỗ kiểm tra cho mọi lối tạo kỳ, và test được không cần DB.
7. **Thứ tự.** Có 6 phase:
   - P1 `thue_hd` đi trước, vì mọi truy vấn khác cần nó.
   - Nhánh A: P2 (truy vấn cửa sổ, bộ chọn mốc) rồi P3 (tổng hợp, Excel).
   - Nhánh B: P4 (báo giá, gợi ý giá, tab Thanh toán) rồi P5 (chốt kỳ linh hoạt).
   - P6 tài liệu chạy cuối.

   Hai nhánh không chạm chung file nào (đã kiểm tra trong danh sách file từng phase). *Lý do:* chạy song song an toàn, và mỗi phase tự trả giá trị cho người dùng.

## Phases

### P1 — Loại giao dịch `thue_hd` xuyên suốt (6h, phụ thuộc: không)

**Files to Modify**
- `lib/ledger/ledger-types.ts` (dòng 4: union `TransactionType`)
- `lib/cong-no-vt/schemas.ts` (20) và `lib/cong-no-nc/schemas.ts` (20): enum thêm `"thue_hd"`
- `lib/ledger/ledger-aggregations.ts` (`querySummary` 54–59 và 87–88; `queryMonthlyByParty` 144–177; `queryDebtMatrix` 307–310)
- `lib/ledger/balance-service.ts` (144–148)
- `lib/cong-no-vt/balance-report-service.ts` (136–149)
- `lib/ledger/ledger-service.ts` (44, guard kỳ)
- `lib/cong-no-vt/material-ledger-service.ts` (118, guard `adminPatch`)
- `lib/vat-tu-ncc/reconciliation-derive-service.ts` (`ReconComputed` 47–58; vòng phân loại 147–166; `listReconciliationsDerived` 262–300; `signReconciliation` 323–332)
- `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/[reconciliationId]/page.tsx` (191–208)
- `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/doi-chieu-client.tsx`
- `components/ledger-grid/transaction-grid.tsx` (69–73)
- `components/ledger/transaction-form-dialog.tsx` (27–29)
- `components/ledger/transaction-grid.tsx` (73–75, 142)
- `lib/import/adapters/cong-no-vat-tu.parse.ts` (15–19)

**Files to Create:** `lib/ledger/ledger-sql-fragments.ts`, `lib/ledger/__tests__/ledger-sql-fragments.test.ts`, `test/integration/cong-no-thue-hd.integration.test.ts`

**Các bước**
1. Thêm `"thue_hd"` vào `TransactionType` và vào cả hai enum zod. NC cũng nhận loại mới vì sổ cái dùng chung và lưới nhập liệu dùng chung một `TX_TYPES`.
2. Tạo `ledger-sql-fragments.ts`:
   - `export const DEBT_INCREASE_TYPES = ["lay_hang","thue_hd"] as const`
   - `export function ledgerAmountSql(kind: "signed"|"increase"|"decrease", col: "Tt"|"Hd"): Prisma.Sql`. Cột được ghép bằng `Prisma.raw('"total' + col + '"')` từ whitelist hai giá trị, nên không có rủi ro injection.
   - Fragment `increase`: `CASE WHEN "transactionType" IN ('lay_hang','thue_hd') THEN c WHEN "transactionType"='dieu_chinh' AND c>0 THEN c ELSE 0 END`.
3. `querySummary`: thêm `thue_hd_tt/hd` bằng `FILTER (WHERE "transactionType"='thue_hd')`, công thức balance thành `opening + lay + thue − tra + dieu_chinh`, và `SummaryRow` thêm `thueHdTt/Hd`.
4. Ở period CTE của `queryMonthlyByParty` và CTE `tx` của `queryDetailReport`, thay các CASE tay bằng `SUM(${ledgerAmountSql("increase","Tt")})`, tương tự cho `decrease`. `queryDebtMatrix` được sửa đầy đủ ở P3; ở P1 chỉ đổi FILTER `lay_hang` thành `IN ('lay_hang','thue_hd')`.
5. `getBalancesBulk`: FILTER lay đổi thành `"transactionType" IN ('lay_hang','thue_hd')`. Cập nhật comment đầu file: `thue_hd` làm tăng nợ phải trả cho đợt thanh toán.
6. Guard kỳ ở `ledger-service.ts:44` và `material-ledger-service.ts:118` đổi sang `["lay_hang","thanh_toan","thue_hd"].includes(...)`.
7. `computeReconciliation`: thêm nhánh `thue_hd` cộng vào `totalTax` và đẩy `taxRows: ReconTaxRow{id,date,amount,invoiceNo,invoiceDate,content,projectLabel}`. Công thức thành `closing = opening + totalIn + totalTax − totalPaid + totalAdjust`. Khi sign, snapshot JSON tự chứa `totalTax`/`taxRows`. Khi đọc snapshot cũ, `totalTax ?? 0` và `taxRows ?? []`. `listReconciliationsDerived` trả thêm `totalTax`; với kỳ đã ký, giá trị lấy từ `signedSnapshotJson`.
8. Trang chi tiết đối chiếu chèn khối sau C: "D. Thuế hoá đơn" gồm từng dòng `Thuế HĐ: {invoiceNo} ngày {invoiceDate}` ở cột Nợ và dòng tổng. Dòng cuối thành `Tổng nợ (A + B − C + D[+ Điều chỉnh])`. Bảng kỳ trong `doi-chieu-client.tsx` thêm cột "Thuế HĐ".
9. Thêm nhãn "Thuế HĐ" ở 3 component lưới/dialog. `normalizeTxType` nhận diện chuỗi chứa "thuế" hoặc "thue" thành `thue_hd`, đặt trước nhánh "trả".

**Tests**
- Unit `lib/ledger/__tests__/ledger-sql-fragments.test.ts`:
  - `ledgerAmountSql("increase","Tt").sql` chứa `'thue_hd'` và `"totalTt"`.
  - `decrease` không chứa `thue_hd`.
  - Đối số `col` ngoài whitelist bị TS chặn; có thêm runtime throw.
- Unit `lib/ledger/__tests__/ledger-aggregations.test.ts` (mở rộng): `querySummary` map `thue_hd_tt` và `balanceTt = opening + lay + thue − tra + dc`.
- Integration `test/integration/cong-no-thue-hd.integration.test.ts`. Fixture dựng từ số Hải Phòng:
  - Số dư ban đầu 315.648.111, đặt theo mẫu pilot.
  - Hai `lay_hang` ngày 2026-04-27: 20.880.000 (14,5 m3 × 1.440.000) và 2.900.000 (bơm).
  - Một `thue_hd` 11.448.000, `date` 2026-05-26, `invoiceNo` "00000232", `invoiceDate` 2026-05-29. Ngày ghi sổ nằm trong kỳ dù ngày HĐ ngoài kỳ, đúng như Excel.

  Các khẳng định:
  - `computeReconciliation(HP, 2026-04-27, 2026-05-26)` cho opening 315.648.111, totalIn 23.780.000, totalTax 11.448.000, closing 350.876.111, `taxRows[0].invoiceNo` = "00000232".
  - `querySummary` balanceTt = 350.876.111.
  - `queryCurrentBalance` = 350.876.111.
  - `getOutstandingDebt` = 350.876.111.
  - `queryDetailReport` phatSinhTt = 34.228.000.
  - Sau `signReconciliation`: `totalIn` = 23.780.000, `closingBalance` = 350.876.111, `signedSnapshotJson.totalTax` = 11.448.000.
  - Tạo `thue_hd` ngày 2026-05-10 sau khi đã ký thì bị từ chối với thông báo kỳ đã ký.

**Verify:** `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`.

### P2 — Truy vấn cửa sổ + bộ chọn mốc dùng chung cho 5 trang (7h, phụ thuộc: P1)

**Files to Modify**
- `lib/ledger/ledger-aggregations.ts` (`queryMonthlyByParty` 120 thành wrapper)
- `lib/ledger/ledger-service.ts` (`monthlyByParty` 234–240 thêm `windowByParty`)
- `lib/cong-no-vt/balance-report-service.ts` (filter 60–67, cutoff 106–113, CTE opening)
- `lib/cong-no-vt/material-ledger-service.ts` (`getMaterialMonthlyReport` 264 đổi tham số thành `(window, entityId)`)
- `lib/cong-no-nc/labor-ledger-service.ts` (262–268, tương tự)
- `lib/cong-no-nc/balance-report-service.ts` (`LaborDetailReportFilters` thêm `from/to`)
- `lib/export/templates/cong-no-monthly.ts` (30)
- `app/api/export/excel/route.ts` (case `cong-no-monthly` 72–87 nhận `from/to`, fallback `year/month`)
- `app/(app)/cong-no-vt/bao-cao-thang/page.tsx` và `bao-cao-thang-filter.tsx`
- `app/(app)/cong-no-vt/chi-tiet/page.tsx`
- `app/(app)/cong-no-nc/bao-cao-thang/page.tsx` và `bao-cao-thang-filter-nc.tsx`
- `app/(app)/cong-no-nc/chi-tiet/page.tsx`
- `components/ledger/detail-report-filter.tsx` (bỏ select Năm/Tháng 36–41, 84–85)
- `components/ledger/monthly-report.tsx` (props 19–23, dòng 76)

**Files to Create:** `lib/ledger/report-period.ts`, `components/ledger/report-period-selector.tsx`, `components/ledger/use-report-period-url.ts`, `lib/ledger/__tests__/report-period.test.ts`, `test/integration/cong-no-window.integration.test.ts`

**Các bước**
1. `report-period.ts` export các thành phần sau:
   - `type PeriodPreset`.
   - `resolveReportPeriod(sp: Record<string,string|undefined>, opts: {defaultPreset; legacyMode: "month"|"cutoff"; today: Date})` trả về `{preset, from: Date|null, to: Date|null, label, params}`.
   - `isoWeekRange`, `isoWeekOf`.
   - `toIsoDate`.

   Preset `ncc` gọi `periodRange(y,m)` từ `lib/vat-tu-ncc/period.ts`. Với `custom`, nếu `from > to` thì trả lỗi `error` và trang hiển thị cảnh báo thay vì âm thầm hoán đổi.
2. `queryWindowByParty(ledgerType, {from: Date|null, to: Date|null, entityId})`:
   - Opening = số dư ban đầu + `SUM(${ledgerAmountSql("signed",…)})` với điều kiện `${from}::date IS NOT NULL AND date < ${from}::date`.
   - Period = `increase/decrease` với `(${from}::date IS NULL OR date >= ${from}::date) AND (${to}::date IS NULL OR date <= ${to}::date)`.
   - Phần map kết quả giữ nguyên.

   `queryMonthlyByParty(lt,y,m,e)` chỉ còn gọi `queryWindowByParty(lt, {from: UTC(y,m-1,1), to: UTC(y,m,0), entityId: e})`.
3. `queryDetailReport` nhận `from?/to?`. Nếu có `to` thì cutoff = `to + 1 ngày` (exclusive). Nếu có `from` thì CTE `ob` cộng thêm tx trước `from` (signed), còn phát sinh/đã trả chỉ tính tx trong `[from, cutoff)`. Khi vẫn dùng `year/month`, đi đúng nhánh cũ ở dòng 111–113.
4. `ReportPeriodSelector` gồm:
   - Props `{value: ReportPeriodParams; onChange: (v) => void; presets?: PeriodPreset[]}`.
   - UI: Select preset (Toàn bộ, Năm, Quý, Tháng, Tuần, Kỳ NCC 27→26, Tuỳ chọn), sau đó là control phụ theo preset: Năm (select), Quý (Q1–Q4), Tháng (`MonthYearPicker`), Tuần (select năm ISO + tuần, mỗi option có dạng "T41 · 05/10–11/10"), Kỳ NCC (`MonthYearPicker`, nhãn "27/05–26/06"), Tuỳ chọn (hai `DateInput`).
   - Bên dưới luôn có dòng nhãn biên đã tính, để người dùng thấy đúng khoảng ngày.

   `useReportPeriodUrl()` đọc `useSearchParams`, ghi `router.push("?…", {scroll:false})`, giữ các tham số khác và xoá các key mốc cũ.
5. Trang `bao-cao-thang` (VT/NC) dùng mặc định `month`. Chủ thể vẫn bắt buộc. Fallback `firstMaterialEntityWithActivity` lấy năm/tháng của `to ?? today`. `MonthlyReport` thay `year/month` bằng `periodLabel`. `ExcelExportButton` gửi `{from, to, periodLabel, entityId}`.
6. Trang `chi-tiet` (VT/NC) dùng mặc định `all`. `DetailReportFilter` nhúng `ReportPeriodSelector` (controlled) và gửi params mốc cùng lúc với Chủ thể/Công trình khi bấm Áp dụng. URL cũ `?year=2026&month=5` ánh xạ sang `{from:null, to:31/05}`, giữ ngữ nghĩa mốc cắt.

**Tests**
- Unit `lib/ledger/__tests__/report-period.test.ts`:
  - Tuần 41/2026 cho 2026-10-05..2026-10-11.
  - Tuần 53/2026 cho 2026-12-28..2027-01-03.
  - `isoWeekOf(2027-01-01)` = {2026, 53}.
  - Q2/2026 cho 04-01..06-30.
  - Tháng 2/2028 cho 02-01..02-29.
  - Kỳ NCC 6/2026 cho 2026-05-27..2026-06-26.
  - `all` cho null/null.
  - Legacy `{year:"2026",month:"5"}` cho month 05-01..05-31 ở chế độ month, và null..05-31 ở chế độ cutoff.
  - Custom đảo ngược trả `error`.
  - Mọi `from/to` đều có `getUTCHours() === 0`.
- Integration `test/integration/cong-no-window.integration.test.ts`. Fixture dựng từ số Nam Hương: số dư ban đầu 310.605.120; `lay_hang` 44.400.000 ngày 2026-05-05; `thanh_toan` 100.000.000 ngày 2026-05-20; `lay_hang` 30.460.000 ngày 2026-06-05.
  - Cửa sổ 2026-04-27..2026-05-26 cho opening 310.605.120, lay 44.400.000, tra 100.000.000, close 255.005.120.
  - Cửa sổ 2026-05-27..2026-06-26 cho opening 255.005.120, lay 30.460.000, close 285.465.120.
  - `all` cho opening 310.605.120, lay 74.860.000, close 285.465.120.
  - Parity: `queryMonthlyByParty(2026,5)` bằng `queryWindowByParty(05-01..05-31)`.
  - `queryDetailReport({from 27/5, to 26/6})` có cuoiKyTt = 285.465.120 và openingTt = 255.005.120.

**Verify:** như P1. Kiểm tra thêm bằng tay: mở `/cong-no-vt/bao-cao-thang?year=2026&month=5` (URL cũ) và `/cong-no-nc/chi-tiet`.

### P3 — Trang `/cong-no-vt/tong-hop` + Excel mẫu "Công Nợ" (6h, phụ thuộc: P2)

**Files to Modify**
- `lib/ledger/ledger-aggregations.ts` (`queryDebtMatrix` 287–330)
- `lib/ledger/ledger-service.ts` (`detailedDebtMatrix` 271)
- `lib/cong-no-vt/material-ledger-service.ts` (`REVALIDATE_PATHS` 13 thêm `/cong-no-vt/tong-hop`)
- `components/ledger/debt-matrix.tsx` (GROUPS 42–47 và header)
- `app/api/export/excel/route.ts` (`moduleByTemplate` 49–53, admin gate 59, switch)
- `app/(app)/cong-no-vt/page.tsx` (navLinks 20–23 thêm "Tổng hợp")

**Files to Create:** `app/(app)/cong-no-vt/tong-hop/page.tsx`, `app/(app)/cong-no-vt/tong-hop/tong-hop-filter.tsx`, `lib/ledger/debt-matrix-columns.ts`, `lib/export/templates/cong-no-tong-hop.ts`, `lib/ledger/__tests__/debt-matrix-columns.test.ts`, `lib/export/__tests__/cong-no-tong-hop.test.ts`

**Các bước**
1. `queryDebtMatrix(ledgerType, {entityIds?, partyIds?, from?, to?})`:
   - CTE `ob` = số dư ban đầu UNION ALL tx `signed` với `date < from` (chỉ khi `from` khác null).
   - CTE `tx` dùng `increase`/`decrease` trong cửa sổ.
   - `close = open + lay − tra`.

   Bản cũ đang bỏ sót `dieu_chinh`; sửa luôn để ma trận khớp `querySummary`.
2. `debt-matrix-columns.ts` export `toCongNoSheetCell(cell: MatrixCell)` trả về `{lhTt: open+lay, traTt, noTt: close, lhHd, traHd, noHd}` và `CONG_NO_SHEET_COLUMNS` (6 nhãn: "LH TT", "Trả TT", "Nợ TT", "LH HĐ", "Trả HĐ", "Nợ HĐ").
3. `DebtMatrix` đổi sang 6 cột mỗi nhóm theo `CONG_NO_SHEET_COLUMNS` (bỏ 4 nhóm × 2). Nhóm tổng đổi tên thành "TỔNG CÔNG TY". Header có tooltip "LH gồm số dư đầu kỳ". Sort key đổi thành `${entityId}:${colKey}`, vẫn theo hợp đồng sắp xếp 3 trạng thái. Thêm prop `hideZero`.
4. `tong-hop/page.tsx` (server):
   - `searchParams: Promise<…>`, theo mẫu `bao-cao-thang/page.tsx:9-14`.
   - Gọi `resolveReportPeriod(sp, {defaultPreset:"all"})`, sau đó `getMaterialDebtMatrix({from, to, entityIds})`.
   - `entities` = các Chủ thể có mặt trong kết quả, sắp theo tên.
   - Header gồm tiêu đề "Tổng hợp công nợ vật tư", nhãn kỳ, `ExcelExportButton template="cong-no-tong-hop"` và `PrintButton`.
   - `tong-hop-filter.tsx` (client) gồm `ReportPeriodSelector`, `MultiSelectFilter` Chủ thể và checkbox ẩn dòng 0.
5. `cong-no-tong-hop.ts` có `buildCongNoTongHopExcel({from, to, entityIds, label})`:
   - `aoa` gồm hàng 1 là tiêu đề + nhãn kỳ; hàng 2 là "Nhà cung cấp" rồi tên từng Chủ thể (ô đầu nhóm) và "TỔNG CÔNG TY"; hàng 3 là 6 nhãn con lặp lại; tiếp theo là dữ liệu và hàng "TỔNG".
   - `ws["!merges"]` chứa `{s:{r:1,c:1+6i}, e:{r:1,c:6+6i}}` cho mỗi nhóm, cùng merge dọc cho ô "Nhà cung cấp".
   - Ô số dùng `z: "#,##0"`.
   - Dùng `createWorkbook`/`workbookToBuffer`.
6. Route: thêm `"cong-no-tong-hop": "cong-no-vt"` và đưa vào admin gate ở dòng 59, giống `cong-no-monthly`. Filename `cong-no-tong-hop-{from|toan-bo}-{to}.xlsx`.

**Tests**
- Unit `debt-matrix-columns.test.ts`: cell `{openTt: 310.605.120, layTt: 44.400.000, traTt: 100.000.000, closeTt: 255.005.120}` cho LH TT 355.005.120, Trả TT 100.000.000, Nợ TT 255.005.120. Hằng đẳng thức Nợ = LH − Trả đúng cho cả HĐ.
- Unit `lib/export/__tests__/cong-no-tong-hop.test.ts`: dùng `vi.mock` cho `queryDebtMatrix` và `prisma` (theo mẫu `ledger-aggregations.test.ts`) với 2 NCC × 3 Chủ thể. Đọc buffer lại bằng `XLSX.read` rồi kiểm tra:
  - `!merges` có đúng 4 nhóm ngang.
  - Ô B2 là tên Chủ thể đầu.
  - Nhóm cuối là "TỔNG CÔNG TY".
  - Hàng "TỔNG" bằng tổng cột.
- Integration (mở rộng `cong-no-window.integration.test.ts`): thêm Chủ thể thứ hai, Lê Văn Huyên, có `lay_hang` 1.000.000 cho cùng NCC. `queryDebtMatrix({from: 2026-04-27, to: 2026-05-26})` cho ô Chủ thể 1 bằng đúng các số P2, và `totals.closeTt` = 255.005.120 + 1.000.000.

**Verify:** như P1, cộng `pnpm build` để bắt lỗi route/page của Next 16. Kiểm tra bằng tay: mở file xuất ra trong Excel và so với sheet "Công Nợ".

### P4 — Báo giá có giá trước/chênh lệch, gợi ý giá khi nhập phiếu, tab Thanh toán (7h, phụ thuộc: P1)

**Files to Modify**
- `lib/vat-tu-ncc/quote-resolver.ts`
- `lib/vat-tu-ncc/price-quote-service.ts`
- `lib/vat-tu-ncc/schemas.ts` (thêm `supplierPaymentSchema`)
- `app/(app)/vat-tu-ncc/[supplierId]/bao-gia/bao-gia-client.tsx`
- `components/vat-tu-ncc/delivery-form.tsx` (Props 15–20, form 44+)
- `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx` (TABS 6–12 thêm `{href:"/thanh-toan", label:"Thanh toán"}` sau "Chốt kỳ")

**Files to Create:** `lib/vat-tu-ncc/price-suggestion.ts`, `lib/vat-tu-ncc/supplier-payment-service.ts`, `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx`, `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/thanh-toan-client.tsx`, `test/integration/vat-tu-ncc-thanh-toan.integration.test.ts`

**Các bước**
1. `quote-resolver.ts` thêm `annotateQuoteHistory(quotes)`. Hàm sắp theo `(itemId, effectiveFrom, id)` và gắn `prevPrice | null`, `diff | null`, `trend: "moi"|"tang"|"giam"|"giu_nguyen"`.
2. Bảng `bao-gia-client`:
   - Cột: Vật tư, Hiệu lực từ, Giá trước, Đơn giá, Chênh lệch (dấu ±, đỏ khi tăng, xanh khi giảm), Nhận xét (badge Tăng/Giảm/Mới/Giữ nguyên), Ghi chú, Thao tác (Sửa/Xoá). Tất cả cột đều sortable.
   - Bấm Sửa sẽ đổ dòng vào chính form phía trên (`editingId` state, nút đổi thành "Lưu"/"Huỷ"), lưu bằng `updatePriceQuote`.
   - Khi chọn vật tư trong form, hiện "Giá hiện hành: X từ dd/mm" để cán bộ thấy giá cũ trước khi nhập giá mới.
3. `price-suggestion.ts` (module thường, không phải "use server") export `loadPriceSources(supplierId, itemIds, {before, quotesUpTo})`, trả về `{quoteList, lastPriceMap}`. SQL `DISTINCT ON` được chuyển nguyên từ `period-close-service.ts:121-130`. Server action mới `suggestDeliveryUnitPrice(supplierId, itemId, date)` nằm trong `price-quote-service.ts`, guard read `vat-tu-ncc`, trả `{price, source: "quote"|"last"|null}`.
4. `DeliveryForm` thêm trường "Đơn giá" (tuỳ chọn). Khi `itemId` hoặc `date` đổi, gọi `suggestDeliveryUnitPrice`. Nếu field chưa dirty thì tự điền giá gợi ý; nếu đã dirty thì chỉ hiện hint "Gợi ý: 1.850 (báo giá)" kèm nút "Dùng". `deliverySchema.unitPrice` đã có sẵn (`schemas.ts:10`).
5. `supplierPaymentSchema` có các trường `{supplierId, kind: z.enum(["thanh_toan","thue_hd"]), date, entityId, projectId?, amountTt, amountHd?, invoiceNo?, invoiceDate?, content?}`. Ràng buộc `superRefine`: với `thue_hd` thì `invoiceNo` là bắt buộc. Nếu `amountHd` trống, mặc định lấy bằng `amountTt`.
6. `supplier-payment-service.ts` ("use server"):
   - `listSupplierPayments(supplierId)` đọc sổ cái material với `partyId` và `transactionType IN (thanh_toan, thue_hd)`, kèm cờ `locked` (`findSignedPeriodCovering`) và `fromRound` (`paymentRoundItemId != null`).
   - Các hàm `create/update/delete` guard `vat-tu-ncc` create/edit, map sang `LedgerTransactionInput` (`vatPct 0`) và gọi `new LedgerService("material").create/update/softDelete`, nên vẫn đi qua `assertMaterialPeriodOpen`.
   - Từ chối sửa/xoá các dòng `fromRound`.
   - Revalidate `/vat-tu-ncc/{id}/thanh-toan`, `/vat-tu-ncc/{id}/doi-chieu`, `/cong-no-vt` và `/cong-no-vt/tong-hop`.
7. Trang `thanh-toan`:
   - Server tải danh sách giao dịch, Chủ thể và các công trình NCC từng giao hàng (Chủ thể mặc định = Chủ thể của công trình gần nhất), cùng số nợ hiện tại `supplierBalanceAsOf(today)`.
   - Client có thẻ "Nợ hiện tại", form một hàng (Loại · Ngày ghi sổ · Chủ thể · Công trình · Số tiền TT · Số tiền HĐ · Số HĐ/Ngày HĐ chỉ hiện khi chọn Thuế HĐ · Nội dung) và bảng sortable (Ngày, Loại, Chủ thể, Công trình, TT, HĐ, Số HĐ, Ngày HĐ, Nội dung, Nguồn "Nhập tay"/"Đợt TT", biểu tượng khoá nếu thuộc kỳ đã ký).

**Tests**
- Unit `lib/vat-tu-ncc/__tests__/quote-resolver.test.ts` (mở rộng) dùng giá "Ca" của Lộc Tài:
  - 2.600.000 là "moi".
  - 3.300.000 là "tang", diff +700.000.
  - 3.000.000 là "giam", diff −300.000.
  - Cùng giá thì "giu_nguyen".
  - Hai vật tư độc lập với nhau.
  - Cùng `effectiveFrom` thì id lớn hơn đứng sau.
- Unit `lib/vat-tu-ncc/__tests__/supplier-payment-schema.test.ts`: `thue_hd` thiếu `invoiceNo` bị từ chối; `amountHd` mặc định lấy bằng `amountTt`.
- Integration `test/integration/vat-tu-ncc-thanh-toan.integration.test.ts` (mock guard theo pilot):
  - `createSupplierPayment` thanh_toan 100.000.000 ngày 2026-05-20 trên fixture Nam Hương thì `computeReconciliation(27/4..26/5)` có closing 255.005.120.
  - `thue_hd` 11.448.000 thì closing 266.453.120.
  - Sau khi ký kỳ, tạo hoặc sửa trong kỳ bị từ chối.
  - `suggestDeliveryUnitPrice` với báo giá 1.900 (01/04) và 1.850 (20/04): ngày 2026-05-05 trả 1.850 nguồn "quote"; khi không có báo giá thì trả giá phiếu gần nhất, nguồn "last".

**Verify:** như P1, cộng `pnpm build`.

### P5 — Chốt kỳ biên linh hoạt (5h, phụ thuộc: P1, P4)

**Files to Modify**
- `lib/vat-tu-ncc/period-close-service.ts` (`previewPeriodClose` 104–110, `commitPeriodClose` 175–200, lock 191, gợi ý giá 117–143 chuyển sang dùng `loadPriceSources`)
- `lib/vat-tu-ncc/reconciliation-service.ts` (`createReconciliation` 22–31)
- `lib/vat-tu-ncc/reconciliation-derive-service.ts` (lock 309 và 349)
- `app/(app)/vat-tu-ncc/[supplierId]/chot-ky/chot-ky-client.tsx` (58, 103, 129)
- `app/(app)/vat-tu-ncc/[supplierId]/chot-ky/page.tsx` (truyền danh sách kỳ và gợi ý kỳ kế tiếp xuống client)

**Files to Create:** `lib/vat-tu-ncc/period-bounds.ts`, `lib/vat-tu-ncc/__tests__/period-bounds.test.ts`, `test/integration/vat-tu-ncc-chot-ky-linh-hoat.integration.test.ts`

**Các bước**
1. `period-bounds.ts` (thuần):
   - `validatePeriodBounds({from, to, existing: {id, periodFrom, periodTo, signed}[], selfId?})` trả `string | null` (thông báo tiếng Việt có ngày dd/mm/yyyy), theo đúng quy tắc a–d ở mục quyết định 6.
   - `suggestNextPeriod({latestSignedTo, earliestOpenDeliveryDate, today})` trả `{from, to}` với `to` = ngày 26 gần nhất tính từ `from` trở đi.
2. `previewPeriodClose(supplierId, range: number | {from: string; to: string}, month?)` là overload. Nếu tham số thứ hai là số, gọi `periodRange(year, month)` như cũ, để các lời gọi trong pilot test (dòng 105, 115, 211, 233) không phải sửa. Hàm trả thêm `boundsError`. `commitPeriodClose` có overload tương tự và gọi `validatePeriodBounds` trong transaction sau khi lấy lock. Nếu có lỗi thì throw.
3. Thêm server action `suggestNextClosePeriod(supplierId)`. Hàm lấy kỳ ký mới nhất, rồi lấy `MIN(date)` của phiếu không có `ledger_transactions.deliveryId` tương ứng (LEFT JOIN, `deletedAt IS NULL`).
4. Advisory lock ở 3 chỗ đổi sang `vat-tu-close:${supplierId}` (bỏ `:from`), để hai lần chốt có biên khác nhau và việc ký/gỡ ký luôn tuần tự hoá theo NCC.
5. `createReconciliation` thay kiểm tra trùng đúng khoảng (25–31) bằng `validatePeriodBounds` trên danh sách kỳ hiện có của NCC.
6. UI chốt kỳ:
   - Bỏ `type="month"` và thay bằng hai `DateInput` "Từ ngày" / "Đến ngày", điền sẵn từ `suggestNextClosePeriod`.
   - Hiện dòng "Kỳ ký gần nhất: 28/04/2026 – 26/05/2026".
   - Nút nhanh "Kỳ 27→26 tiếp theo" để điền biên chuẩn.
   - Nếu `boundsError` khác null thì khoá nút Chốt và hiện cảnh báo đỏ.

**Tests**
- Unit `period-bounds.test.ts`:
  - Kỳ đầu 2026-04-01..2026-04-27 không có kỳ ký thì hợp lệ.
  - Sau khi ký kỳ đó, `suggestNextPeriod` cho 2026-04-28..2026-05-26.
  - Sau khi ký 28/4..26/5, kỳ 2026-05-26..2026-06-26 báo lỗi chồng lấn (ca nhãn Excel chồng 1 ngày).
  - Kỳ 2026-05-28.. báo lỗi "phải bắt đầu 27/05/2026".
  - `from > to` báo lỗi.
  - Kỳ chưa ký trùng đúng biên thì được phép; kỳ chưa ký khác biên mà chồng lấn thì báo lỗi.
  - `earliestOpenDeliveryDate` 2026-03-29 cho to = 2026-04-26.
- Integration `vat-tu-ncc-chot-ky-linh-hoat.integration.test.ts`. Fixture Nam Hương: số dư ban đầu 189.805.120 và 8 phiếu × 8.000 viên trong 01/04–27/04 (6 phiếu @1.900, 2 phiếu @1.850).
  - Chốt kỳ `{from:"2026-04-01", to:"2026-04-27"}` cho `closedCount` 8 và `totalAmountTt` 120.800.000. `computeReconciliation` có closing 310.605.120.
  - Ký kỳ 1. Chốt 28/4..26/5 với 3 phiếu × 8.000 @1.850, thêm thanh_toan 100.000.000, cho closing 255.005.120.
  - Ký kỳ 2. Chốt 26/5..26/6 bị từ chối. `createReconciliation` 26/5..26/6 cũng bị từ chối.

**Verify:** như P1. Pilot test `vat-tu-ncc-pilot.integration.test.ts` phải xanh mà không sửa.

### P6 — Tài liệu (2h, phụ thuộc: P1–P5)

**Files to Modify:** `docs/user-guide/ke-toan.md` (tab Thanh toán, Thuế HĐ với ngày ghi sổ khác ngày HĐ, chốt kỳ linh hoạt, trang Tổng hợp và Excel), `docs/user-guide/can-bo-vat-tu.md` (báo giá giá trước/chênh lệch/sửa, gợi ý đơn giá khi nhập phiếu), `docs/system-architecture.md` (`thue_hd`, fragment SQL, `queryWindowByParty`, `report-period`, quy tắc biên kỳ, lock theo NCC).

**Các bước:** Đọc tài liệu hiện có, cập nhật đúng các mục liên quan, đối chiếu tên route/tab với code đã merge.

**Verify:** grep tên route và tab trong docs khớp `layout.tsx` và `page.tsx`.

## Rủi ro và giảm thiểu

| Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|
| Bỏ sót một truy vấn, nên `thue_hd` bị tính sai dấu hoặc bị loại | Trung bình × Cao | Dùng fragment chung. Integration P1 khẳng định cùng một số 350.876.111 qua 5 đường (summary, current, bulk, detail, recon). Các truy vấn dùng ELSE đã liệt kê và kiểm chứng ở quyết định 1. |
| Ranh giới UTC lệch một ngày ở tuần ISO hoặc cuối tháng | Trung bình × Cao | Mọi biên được dựng bằng `Date.UTC`, SQL so sánh `::date`. Unit test kiểm tra `getUTCHours()===0` và ca giao năm của tuần 53. |
| Đổi chữ ký `previewPeriodClose`/`commitPeriodClose` làm vỡ pilot test | Cao × Trung bình | Dùng overload `number | {from,to}`, không sửa test cũ. |
| Quy tắc liền kề chặn dữ liệu lịch sử có kỳ Excel chồng 1 ngày (26/5→26/6, Hải Phòng 26/4→26/5) | Cao × Trung bình | Chủ ý chuẩn hoá thành `to+1`. Thông báo lỗi chỉ rõ ngày đúng. Ghi chú trong `ke-toan.md`. |
| Hai lần chốt song song với `from` khác nhau | Thấp × Cao | Advisory lock theo NCC ở cả 3 chỗ, và kiểm tra biên lại trong transaction. |
| Snapshot kỳ đã ký cũ thiếu `totalTax` | Chắc chắn × Thấp | Đọc với mặc định `?? 0` / `?? []`. Kỳ cũ không thể có `thue_hd`. |
| Ma trận nhiều Chủ thể quá rộng trên màn hình | Trung bình × Thấp | Cột NCC sticky, multiselect Chủ thể, ẩn dòng 0. |
| Tab Thanh toán vượt quyền `cong-no-vt` | Thấp × Trung bình | Có tiền lệ `commitPeriodClose`. Guard edit/create `vat-tu-ncc`. Dòng từ đợt thanh toán là read-only. |
| Rollback P1 khi đã có dòng `thue_hd` | Thấp × Cao | Mỗi phase là một commit, không có migration. Trước khi revert P1, chạy `SELECT count(*) FROM ledger_transactions WHERE "transactionType"='thue_hd'`. Nếu > 0 thì đổi các dòng đó thành `dieu_chinh` dương trước khi revert. |

## Tổng effort

P1 6h + P2 7h + P3 6h + P4 7h + P5 5h + P6 2h = **33h**. Đường găng là P1 → P2 → P3 → P6 (21h). Nhánh P4 → P5 (12h) chạy song song sau P1.

## Câu hỏi còn mở

1. Xuất Excel tổng hợp đang để admin-only giống `cong-no-monthly` (`route.ts:59`). Nếu lãnh đạo không có vai trò admin thì cần nới quyền xuống mức read `cong-no-vt`.
2. Thứ tự nhóm Chủ thể trong ma trận đang sắp theo tên. Nếu sheet "Công Nợ" cần một thứ tự cố định khác (Công ty quản lý, Lê Văn Huyên, Lưu Minh Xuân) thì cần một trường sắp xếp hoặc dùng `id`.

```
Status: DONE_WITH_CONCERNS
Summary: Candidate 3 plans 6 phases (33h) organized around the material officer, accountant and leadership workflows. It covers all 5 scope items without a migration, and keeps old URLs, old signatures and signed snapshots working.
Concerns/Blockers: Whether the tong-hop Excel export should be admin-only, and the Chủ thể column order, need user confirmation. None of the cited paths are unverified.
```
