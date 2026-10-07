# Ứng viên kế hoạch 2 — Đúng đắn và bất biến trước tiên

Lăng kính: mọi phân loại "tăng nợ / giảm nợ" và mọi phép tính cửa sổ thời gian đi qua đúng một mô-đun dùng chung, và các đẳng thức kế toán được chứng minh bằng test chứ không bằng niềm tin. Tất cả `path:line` dưới đây đã được grep/đọc lại ngày 2026-10-06.

## Tổng quan kiến trúc

- **Một nguồn phân loại duy nhất** `lib/ledger/transaction-classification.ts` (thuần, không "use server"): tuple `TRANSACTION_TYPES = ["lay_hang","thue_hd","thanh_toan","dieu_chinh"]`, nhãn tiếng Việt, hàm TS `classifyAmount(type, amount) → {increase, decrease}` và `signedAmount(type, amount)`, cùng ba fragment `Prisma.sql`: `signedSql(col)`, `increaseSql(col)`, `decreaseSql(col)` với `col` là union literal `"totalTt" | "totalHd"` (không nhận chuỗi tự do nên `Prisma.raw` an toàn). Quy tắc: `lay_hang`, `thue_hd` và `dieu_chinh > 0` là tăng nợ; `thanh_toan` và `dieu_chinh < 0` là giảm nợ.
- **Thay toàn bộ CASE/FILTER chép tay** bằng fragment: `lib/ledger/ledger-aggregations.ts:54-59, 141-151, 162-177, 255-256, 307-310`, `lib/cong-no-vt/balance-report-service.ts:134-149`, `lib/ledger/balance-service.ts:143-148`, `lib/vat-tu-ncc/reconciliation-derive-service.ts:95`, `lib/tai-chinh/dashboard-service.ts:107,120`, `lib/tai-chinh/pr-sync-service.ts:128`. Sau phase 1, grep `'thanh_toan'` trong SQL thô chỉ còn trong file phân loại (có test khẳng định điều này).
- **Một truy vấn cửa sổ lõi** `queryLedgerWindow(ledgerType, {from?, to?, entityIds?, partyIds?, projectIds?})` trả hàng ở hạt mịn nhất `(entityId, partyId, projectId)` với `open, inc, dec` cho TT/HĐ. Ba báo cáo (tháng theo NCC, ma trận NCC × Chủ thể, lũy kế chi tiết) chỉ là các phép gộp TS thuần `rollupWindowRows(rows, keyOf)` trên cùng kết quả, nên chúng không thể lệch nhau.
- **Định nghĩa cửa sổ** `[from, to]` bao gồm hai đầu, UTC midnight: `open = Σ ledger_opening_balances + Σ signed(tx, date < from)`, `inc/dec = Σ tx trong [from, to]`, `close = open + inc − dec`. `from = null` nghĩa là `open = opening balances`; `to = null` nghĩa là không chặn trên. Hệ quả chứng minh được: `close(from, T) = lũy kế tại T` với mọi `from`.
- **Mô-đun mốc thời gian thuần** `lib/ledger/date-window.ts`: preset `all | year | quarter | month | week | ncc | custom` thành `{from, to}` UTC; tuần ISO thứ Hai đến Chủ nhật; preset `ncc` gọi lại `periodRange` ở `lib/vat-tu-ncc/period.ts:6`. Kèm `parseDateWindow(searchParams)` và `toSearchParams(window)` để URL là nguồn trạng thái; URL cũ `?year&month` tự hiểu là preset `month`.
- **Một component chọn mốc** `components/ledger/date-window-picker.tsx` dùng cho `cong-no-vt/{tong-hop,bao-cao-thang,chi-tiet}` và `cong-no-nc/{bao-cao-thang,chi-tiet}`.
- **Biên kỳ NCC** là helper thuần `lib/vat-tu-ncc/period-boundary.ts` (`validatePeriodBoundary`, `defaultNextPeriod`) được gọi ở cả bốn điểm ghi marker: `commitPeriodClose`, `createReconciliation`, `updateReconciliation`, `signReconciliation`. Khoá advisory đổi sang theo NCC (`vat-tu-close:{supplierId}`) vì `from` linh hoạt làm khoá theo `from` hiện tại không còn loại trừ lẫn nhau.
- **Đối chiếu** tách `taxRows/totalTax` khỏi `adjustRows`; đẳng thức `closing = opening + totalIn + totalTax − totalPaid + totalAdjust` được kiểm ở cả đường tính động lẫn snapshot.
- **Tab Thanh toán** không thêm server action mới: tái dùng `createMaterialTransaction`/`softDeleteMaterialTransaction` (guard `cong-no-vt`), giữ một cổng ghi sổ cái và một quy tắc ACL.

## Quyết định cho 7 điểm mở

1. **`thue_hd` và snapshot.** Dùng fragment chung (không sửa từng chỗ) vì sáu truy vấn hiện đã lệch nhau: `queryDebtMatrix` bỏ qua `dieu_chinh` (`lib/ledger/ledger-aggregations.ts:307-310`), `querySummary` sẽ bỏ qua `thue_hd` (FILTER dòng 54-59), còn `balance-service` cố ý bỏ `dieu_chinh` (`lib/ledger/balance-service.ts:8`). Ngoại lệ duy nhất được giữ có chủ đích là `balance-service` (trần thanh toán của `lib/payment/payment-service.ts:209`): nó dùng `typeIn(DEBT_INCREASE_TYPES)` nên nhận `thue_hd` nhưng tiếp tục loại `dieu_chinh`, ghi rõ trong comment và test. Snapshot: không thêm cột; 4 cột giữ nguyên nghĩa (`totalIn` = B chỉ lấy hàng), `totalTax`/`taxRows` nằm trong `signedSnapshotJson`; danh sách kỳ hiển thị cột "Thuế/ĐC" tính bằng `closing − opening − totalIn + totalPaid`, nên đúng cả với snapshot cũ chưa có `totalTax`. Lý do: không migration, không phá kỳ đã ký, đẳng thức vẫn kiểm được.
2. **Truy vấn cửa sổ.** Viết `queryLedgerWindow` mới; giữ nguyên chữ ký `queryMonthlyByParty(ledgerType, year, month, entityId)` làm wrapper (template Excel và `ledger-service` đang gọi), `queryDebtMatrix` thêm `from?/to?` vào filter hiện có, `DetailReportFilters` thêm `from?/to?` và quy `year/month` cũ về `to` UTC. Lý do: tương thích ngược cho mọi caller, đồng thời ba báo cáo dùng chung một SQL nên parity là cấu trúc chứ không phải may mắn.
3. **Mốc thời gian.** Mô-đun thuần `lib/ledger/date-window.ts` (UTC, tuần ISO tự viết khoảng 15 dòng, không thêm thư viện) và một client component `DateWindowPicker` ghi URL qua `router.replace`. Lý do: một chỗ test ranh giới năm/tuần 53; trang server chỉ việc `parseDateWindow(await searchParams)`.
4. **Layout.** Trang `/cong-no-vt/tong-hop` tái dùng `components/ledger/debt-matrix.tsx` (đã có 4 nhóm Đầu kỳ / Lấy hàng / Trả tiền / Cuối kỳ × TT/HĐ, sortable 3 trạng thái), chỉ đổi nhãn cột tổng thành "TỔNG CÔNG TY". Excel theo đúng sheet "Công Nợ": mỗi Chủ thể và TỔNG CÔNG TY có 6 cột phẳng `"{Chủ thể} - LH TT"`, `"- Trả TT"`, `"- Nợ TT"`, `"- LH HĐ"`, `"- Trả HĐ"`, `"- Nợ HĐ"` với LH = Đầu kỳ + Phát sinh tăng (đúng nghĩa SUMIFS Excel), dòng title ghi cửa sổ. Lý do: exporter chỉ hỗ trợ header phẳng (`lib/export/excel-exporter.ts` `addSheet`), và Nợ = LH − Trả vẫn đúng đẳng thức.
5. **Tab Thanh toán.** Trang `/vat-tu-ncc/[supplierId]/thanh-toan` gọi `createMaterialTransaction` (`lib/cong-no-vt/material-ledger-service.ts:28`) với `partyId` cố định; tab chỉ hiện khi người dùng có `cong-no-vt` read, form chỉ hiện khi có create. Lý do: test `test/unit/module-release-entrypoints.test.ts:132` buộc action trong `lib/vat-tu-ncc/` phải guard bằng `"vat-tu-ncc"`, nên một action mới ở đó sẽ hoặc nới quyền ghi sổ cái cho cán bộ vật tư, hoặc phải guard hai lần; tái dùng giữ đúng một quy tắc quyền.
6. **Biên kỳ.** Helper thuần `validatePeriodBoundary({from, to}, existing, selfId?)`: (a) `from ≤ to`; (b) không chồng lấn kỳ đã ký nào; (c) nếu có kỳ đã ký thì `from` phải bằng `max(periodTo đã ký) + 1 ngày`; (d) không chồng lấn marker chưa ký khác, trừ marker trùng khít khoảng (commit chạy lại idempotent). `defaultNextPeriod`: có kỳ ký thì `from = lastSigned.periodTo + 1`, chưa có thì `from = ngày phiếu sớm nhất chưa có event lay_hang`; `to = ngày 26` đầu tiên `≥ from` (ngày 27 trở đi nhảy sang tháng sau). Gọi lại trong transaction của `signReconciliation` vì ký là lúc bất biến bắt đầu. Lý do: một helper, bốn điểm gọi, không đường nào bỏ sót.
7. **Thứ tự.** P1 phân loại + `thue_hd`; sau đó P2 (cửa sổ) và P4 (biên kỳ) song song vì không chung file; P3 (UI cửa sổ + Excel) sau P2; P5 (báo giá + thanh toán) sau P4 vì cùng chạm `period-close-service.ts`; P6 tài liệu cuối. Lý do: bất biến được khoá trước, UI dựng trên lõi đã có test.

## Phases

### Phase 1 — Mô-đun phân loại dùng chung và loại `thue_hd` (7h)

Phụ thuộc: không.

**Files to Create:** `lib/ledger/transaction-classification.ts`, `lib/ledger/__tests__/transaction-classification.test.ts`, `test/integration/ledger-classification-parity.integration.test.ts`.

**Files to Modify:** `lib/ledger/ledger-types.ts`, `lib/ledger/ledger-aggregations.ts`, `lib/ledger/balance-service.ts`, `lib/ledger/ledger-service.ts`, `lib/cong-no-vt/balance-report-service.ts`, `lib/cong-no-vt/material-ledger-service.ts`, `lib/cong-no-vt/schemas.ts`, `lib/cong-no-nc/schemas.ts`, `lib/vat-tu-ncc/reconciliation-derive-service.ts`, `lib/vat-tu-ncc/period-lock.ts` (chỉ comment), `lib/tai-chinh/dashboard-service.ts`, `lib/tai-chinh/pr-sync-service.ts`, `components/ledger-grid/transaction-grid.tsx`, `components/ledger/transaction-form-dialog.tsx`, `components/ledger/transaction-grid.tsx`, `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/doi-chieu-client.tsx`, `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/[reconciliationId]/page.tsx`.

Các bước:
1. Tạo `transaction-classification.ts`: `TRANSACTION_TYPES` (as const), `TRANSACTION_TYPE_LABELS` (`thue_hd: "Thuế HĐ"`), `DEBT_INCREASE_TYPES = ["lay_hang","thue_hd"]`, `PERIOD_LOCKED_TYPES = ["lay_hang","thue_hd","thanh_toan"]`, `classifyAmount`, `signedAmount`, và fragment `signedSql(col)` (`CASE WHEN "transactionType" = 'thanh_toan' THEN -col ELSE col END`), `increaseSql(col)` (`WHEN "transactionType" IN ('lay_hang','thue_hd') THEN col WHEN 'dieu_chinh' AND col > 0 THEN col ELSE 0`), `decreaseSql(col)`, `typeInSql(types)`.
2. `ledger-types.ts:4` đổi `TransactionType` thành `(typeof TRANSACTION_TYPES)[number]`; `LedgerTransactionFilter` (dòng 26) thêm `transactionTypes?: TransactionType[]` (dùng ở P5).
3. Zod: `lib/cong-no-vt/schemas.ts:20` và `lib/cong-no-nc/schemas.ts:20` thành `z.enum(TRANSACTION_TYPES)`.
4. Thay SQL: `querySummary` FILTER `lay_hang` (dòng 54-55) thành `typeInSql(DEBT_INCREASE_TYPES)` để `balance` (dòng 87-88) gồm thuế; `queryMonthlyByParty` dòng 141-151 thành `signedSql`, 162-177 thành `increaseSql/decreaseSql`; `queryCurrentBalance` 255-256 thành `signedSql`; `queryDebtMatrix` 307-310 thành `increaseSql/decreaseSql` (đồng thời sửa lỗi bỏ sót `dieu_chinh`); `balance-report-service.ts:134-149`; `balance-service.ts:143-148` dùng `typeInSql(DEBT_INCREASE_TYPES)` và giữ loại trừ `dieu_chinh` kèm comment; `reconciliation-derive-service.ts:95`, `dashboard-service.ts:107,120`, `pr-sync-service.ts:128` thành `signedSql("totalTt")`.
5. Guard kỳ ký: `ledger-service.ts:45` và `material-ledger-service.ts:118` dùng `PERIOD_LOCKED_TYPES.includes(...)`, để `thue_hd` cũng bị chặn trong kỳ đã ký.
6. Đối chiếu: trong `computeReconciliation` (vòng lặp dòng 146-168) thêm nhánh `thue_hd` vào `taxRows/totalTax`; `ReconComputed` thêm `totalTax`, `taxRows`; `closing = opening + totalIn + totalTax − totalPaid + totalAdjust`. `getReconciliationView` mặc định `totalTax ?? 0`, `taxRows ?? []` khi đọc snapshot cũ. `listReconciliationsDerived` thêm trường `other = closing − opening − totalIn + totalPaid`.
7. UI: `TX_TYPES` ở `components/ledger-grid/transaction-grid.tsx:69-73`, `TYPES` ở `components/ledger/transaction-form-dialog.tsx:27-29`, map nhãn ở `components/ledger/transaction-grid.tsx:73-75` và cast dòng 142 đều sinh từ `TRANSACTION_TYPE_LABELS`. Trang chi tiết đối chiếu thêm khối "D. Thuế hoá đơn" giữa B và C; `doi-chieu-client.tsx` thêm cột "Thuế/ĐC".

Tests:
- Unit `lib/ledger/__tests__/transaction-classification.test.ts`: bảng chân trị 4 loại × dấu số tiền; tính chất `Σ signedAmount = Σ inc − Σ dec` trên 200 giao dịch sinh ngẫu nhiên có seed; fragment `increaseSql("totalTt").sql` chứa `'thue_hd'`; test "không còn CASE chép tay": đọc nguồn các file ở bước 4 và khẳng định không chứa chuỗi `'thanh_toan' THEN`.
- Unit hiện có giữ xanh: `lib/ledger/__tests__/ledger-aggregations.test.ts`, `lib/export/__tests__/*.template.test.ts`, `lib/acl/__tests__/module-service-boundaries.test.ts`.
- Integration `test/integration/ledger-classification-parity.integration.test.ts`: seed một NCC với đủ 4 loại (gồm `dieu_chinh` âm và dương), khẳng định `classifyAmount` cộng dồn ở TS bằng đúng kết quả SQL của `querySummary`, `queryMonthlyByParty`, `queryCurrentBalance`, `queryDetailReport`; seed Bê tông Hải Phòng (đầu kỳ 315.648.111; lay_hang BT M250 14,5 × 1.440.000 = 20.880.000 và Bơm 1 × 2.900.000 ngày 27/4; `thue_hd` 11.448.000 ngày ghi sổ 26/5, `invoiceNo` "00000232", `invoiceDate` 29/5) và khẳng định `computeReconciliation(26/4→26/5)` cho `totalIn` 23.780.000, `totalTax` 11.448.000, `closing` 350.876.111; ghi `thue_hd` vào kỳ đã ký bị từ chối.

Verify: `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`.

### Phase 2 — Truy vấn cửa sổ lõi và mô-đun mốc thời gian (8h)

Phụ thuộc: Phase 1.

**Files to Create:** `lib/ledger/ledger-window.ts` (`queryLedgerWindow`, `rollupWindowRows`), `lib/ledger/date-window.ts`, `lib/ledger/__tests__/date-window.test.ts`, `lib/ledger/__tests__/ledger-window-rollup.test.ts`, `test/integration/ledger-window-invariants.integration.test.ts`.

**Files to Modify:** `lib/ledger/ledger-aggregations.ts`, `lib/ledger/ledger-service.ts`, `lib/cong-no-vt/balance-report-service.ts`, `lib/cong-no-vt/material-ledger-service.ts`, `lib/cong-no-nc/labor-ledger-service.ts`.

Các bước:
1. `queryLedgerWindow`: CTE `ob` (opening balances theo hạt), `pre` (`signedSql` với `date < from`, bỏ qua khi `from` null), `win` (`increaseSql/decreaseSql` với `date >= from AND date <= to`, mỗi vế bỏ qua khi null), FULL OUTER JOIN theo `(entityId, partyId, projectId)` với `IS NOT DISTINCT FROM` như `balance-report-service.ts` đang làm; trả Decimal.
2. `rollupWindowRows(rows, keyOf)` cộng Decimal, tính `close = open + inc − dec`, lọc hàng toàn 0 theo cờ `showZero`.
3. `date-window.ts`: `resolveDateWindow(preset)` với `year → [1/1, 31/12]`, `quarter`, `month`, `week` (thứ Hai của tuần ISO, Chủ nhật +6 ngày), `ncc → periodRange(y, m)`, `custom` (ném lỗi nếu `from > to`), `all → {null, null}`; `parseDateWindow`, `toSearchParams`, `formatDateWindowLabel`.
4. `queryMonthlyByParty` (dòng 120) thành wrapper: cửa sổ tháng UTC, `entityIds=[entityId]`, gộp theo `partyId`, giữ nguyên `MonthlyByPartyRow`. Thêm `queryWindowByParty(ledgerType, window, entityId)` cho P3.
5. `queryDebtMatrix` (dòng 287) nhận `{entityIds?, partyIds?, from?, to?}`, gộp theo `(partyId, entityId)`, giữ `MatrixRow`/`MatrixCell`. `ledger-service.ts:271` truyền tiếp filter.
6. `queryDetailReport`: `DetailReportFilters` thêm `from?/to?`; `year/month` cũ quy về `to = ngày cuối tháng UTC` (bỏ `new Date(year, month, 1)` giờ địa phương ở dòng 112); thân hàm gọi `queryLedgerWindow` rồi giữ nguyên phần dựng `rows/subtotals`.
7. Server action: `getMaterialMonthlyReport` thêm biến thể `getMaterialWindowReport(window, entityId)`; tương tự `getLaborWindowReport` trong `lib/cong-no-nc/labor-ledger-service.ts`; mỗi hàm mới có `await requireReleasedModuleRequest(...)` đúng module.

Tests:
- Unit `date-window.test.ts`: 2026-10-06 (thứ Ba) thuộc tuần ISO 41 là 05/10 đến 11/10; tuần 53/2026 là 28/12/2026 đến 03/01/2027; tuần 1/2027 bắt đầu 04/01/2027; Q4/2026 là 01/10 đến 31/12; `ncc` 6/2026 là 27/05 đến 26/06; tháng 2/2028 kết thúc 29/02; mọi kết quả có giờ UTC 00:00; `parseDateWindow({year:"2026", month:"5"})` ra preset `month`; `custom` đảo ngược ném lỗi.
- Unit `ledger-window-rollup.test.ts`: gộp theo NCC và theo (NCC, Chủ thể) cho tổng bằng nhau; mọi hàng thoả `close = open + inc − dec`.
- Integration `ledger-window-invariants.integration.test.ts` (seed Nam Hương như pilot: đầu kỳ 189.805.120, 8 phiếu 120.800.000 trong 01/4 đến 27/4; kỳ 5: 44.400.000 lấy hàng, 100.000.000 chuyển khoản; kỳ 6: 30.460.000): (a) cửa sổ 28/4 đến 26/5 cho open 310.605.120, inc 44.400.000, dec 100.000.000, close 255.005.120; (b) `close(from bất kỳ, T) = queryCurrentBalance(asOf T)` với T thuộc {27/4, 26/5, 26/6}, close tại 26/6 là 285.465.120; (c) close kỳ k bằng open kỳ k+1; (d) tổng ma trận = tổng chi tiết = tổng báo cáo theo NCC trên cùng cửa sổ; (e) `queryMonthlyByParty(…,2026,5,…)` trước và sau refactor cho cùng kết quả (snapshot giá trị).
- `test/integration/cong-no-luy-ke.integration.test.ts` hiện có giữ xanh là bằng chứng tương thích.

Verify: `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`.

### Phase 3 — Bộ chọn mốc, trang Tổng hợp, áp cho 5 trang, Excel tổng hợp (9h)

Phụ thuộc: Phase 2.

**Files to Create:** `components/ledger/date-window-picker.tsx`, `app/(app)/cong-no-vt/tong-hop/page.tsx`, `lib/export/templates/cong-no-tong-hop.ts`, `lib/export/__tests__/cong-no-tong-hop.template.test.ts`.

**Files to Modify:** `components/ledger/debt-matrix.tsx` (prop `totalLabel`), `app/(app)/cong-no-vt/bao-cao-thang/page.tsx`, `app/(app)/cong-no-vt/bao-cao-thang/bao-cao-thang-filter.tsx`, `app/(app)/cong-no-vt/chi-tiet/page.tsx`, `components/ledger/detail-report-filter.tsx`, `components/ledger/monthly-report.tsx` (prop `periodLabel` thay `year/month` trong tiêu đề), `app/(app)/cong-no-nc/bao-cao-thang/page.tsx`, `app/(app)/cong-no-nc/bao-cao-thang/bao-cao-thang-filter-nc.tsx`, `app/(app)/cong-no-nc/chi-tiet/page.tsx`, `lib/export/templates/cong-no-monthly.ts`, `app/api/export/excel/route.ts`, `components/ledger/ledger-overview-shell.tsx` (navLink "Tổng hợp"), `components/layout/breadcrumb.tsx` (nhãn `tong-hop`).

Các bước:
1. `DateWindowPicker` (client): select preset, input phụ theo preset (năm, quý, `MonthYearPicker`, tuần ISO dạng `<input type="week">`, tháng kỳ NCC, hai `DateInput` cho tuỳ chọn), ghi URL bằng `toSearchParams`; giữ nguyên các tham số khác trên URL (entityId, entityIds, projectIds, showZero).
2. `tong-hop/page.tsx` (server): `requireModuleAccess("cong-no-vt", {minLevel:"read", scope:"module"})`, `parseDateWindow`, gọi `getMaterialDebtMatrix({from, to})`, nạp tên NCC/Chủ thể, render `DebtMatrix` với `totalLabel="TỔNG CÔNG TY"` và `ExcelExportButton template="cong-no-tong-hop"`. Mặc định preset `all` để khớp sheet Excel.
3. `bao-cao-thang` VT và NC: thay `MonthYearPicker` bằng `DateWindowPicker` (mặc định preset `month` hiện tại), gọi `get*WindowReport`; select Chủ thể giữ nguyên; tham số Excel truyền `from/to`.
4. `chi-tiet` VT và NC: `DetailReportFilter` bỏ select Năm/Tháng, nhúng `DateWindowPicker`; page truyền `from/to` vào `getMaterialDetailReport`/NC tương ứng; hiện tại preset mặc định `all` để giữ hành vi lũy kế.
5. Excel: `cong-no-monthly.ts` chấp nhận `from/to` (ưu tiên khi có), vẫn nhận `year/month`; template mới `cong-no-tong-hop.ts` dựng 1 cột NCC + (số Chủ thể + 1) × 6 cột phẳng như quyết định 4, footer tổng; route `moduleByTemplate` thêm `"cong-no-tong-hop": "cong-no-vt"` và đưa vào nhánh admin-only giống `cong-no-monthly`.

Tests:
- Unit `cong-no-tong-hop.template.test.ts` (mock `queryDebtMatrix` như `cong-no-monthly.template.test.ts`): header đúng thứ tự 6 cột/nhóm và nhóm cuối "TỔNG CÔNG TY"; với ô `open 310.605.120, lay 44.400.000, tra 100.000.000` thì LH TT = 355.005.120, Trả TT = 100.000.000, Nợ TT = 255.005.120; hàng TỔNG CÔNG TY bằng tổng các nhóm.
- Unit bổ sung trong `cong-no-monthly.template.test.ts`: nhận `from/to` và vẫn chạy với `year/month`.
- Integration: thêm vào `ledger-window-invariants` một case gọi `getMaterialDebtMatrix({from, to})` cho cửa sổ kỳ 5 và khẳng định tổng TỔNG CÔNG TY = 255.005.120.

Verify: `pnpm test`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build`, mở thủ công `/cong-no-vt/tong-hop?preset=ncc&y=2026&m=5`.

### Phase 4 — Biên kỳ chốt linh hoạt (6h)

Phụ thuộc: Phase 1 (chạy song song với Phase 2 và 3; không chung file).

**Files to Create:** `lib/vat-tu-ncc/period-boundary.ts`, `lib/vat-tu-ncc/__tests__/period-boundary.test.ts`, `test/integration/vat-tu-ncc-period-boundary.integration.test.ts`.

**Files to Modify:** `lib/vat-tu-ncc/period-close-service.ts`, `lib/vat-tu-ncc/reconciliation-service.ts`, `lib/vat-tu-ncc/reconciliation-derive-service.ts` (chỉ `signReconciliation`/`unsignReconciliation`), `app/(app)/vat-tu-ncc/[supplierId]/chot-ky/chot-ky-client.tsx`, `components/vat-tu-ncc/reconciliation-form.tsx`, `test/integration/vat-tu-ncc-pilot.integration.test.ts` (chỉ helper `closePeriod5`/`closePeriod6` đổi cách gọi).

Các bước:
1. `period-boundary.ts`: `validatePeriodBoundary(range, existing, selfId?)` trả danh sách lỗi theo quyết định 6; `defaultNextPeriod({lastSignedTo, earliestOpenDeliveryDate})`; `nextDay26(from)`. Thuần, không I/O.
2. `previewPeriodClose(supplierId, range?)`: khi `range` thiếu thì tính mặc định (truy vấn kỳ ký mới nhất và phiếu sớm nhất chưa có event `lay_hang` qua `deliveryId`); trả thêm `boundaryErrors`.
3. `commitPeriodClose(supplierId, {from, to}, prices)` (dòng 175): khoá `vat-tu-close:${supplierId}` (dòng 191), nạp mọi marker chưa xoá của NCC trong transaction, gọi `validatePeriodBoundary`, ném lỗi gộp nếu có. Phần còn lại giữ nguyên.
4. `createReconciliation`/`updateReconciliation`: thay check trùng khít bằng `validatePeriodBoundary` (update truyền `selfId`).
5. `signReconciliation`: đổi khoá (dòng 309) sang theo NCC; trong transaction kiểm lại điều kiện liền kề với kỳ ký trước; `unsignReconciliation` đổi khoá (dòng 349).
6. UI chốt kỳ: thay `type="month"` (dòng 129) bằng hai `DateInput` điền sẵn từ `previewPeriodClose` mặc định, hiển thị `boundaryErrors` và khoá nút Chốt khi có lỗi. `reconciliation-form.tsx` hiển thị lỗi trả về.

Tests:
- Unit `period-boundary.test.ts`: kỳ ký 28/4 đến 26/5 thì 27/5 đến 26/6 hợp lệ, 26/5 đến 26/6 lỗi chồng lấn (đúng trường hợp nhãn Excel chồng 1 ngày), 28/5 đến 26/6 lỗi hở; `from > to` lỗi; marker chưa ký trùng khít được phép, chồng lệch bị từ chối; `defaultNextPeriod` khi chưa có kỳ ký và phiếu sớm nhất 01/4/2026 cho 01/4 đến 26/4; phiếu sớm nhất 27/4 cho 27/4 đến 26/5.
- Integration `vat-tu-ncc-period-boundary.integration.test.ts`: commit 01/4 đến 27/4 rồi ký; commit 28/4 đến 26/5 thành công và đối chiếu ra 255.005.120; commit 26/5 đến 26/6 bị từ chối; hai `commitPeriodClose` chạy đồng thời với `from` khác nhau trên cùng NCC không tạo hai marker chồng lấn (`Promise.allSettled`, đúng một thành công).
- Pilot hiện có giữ xanh sau khi đổi helper gọi `commitPeriodClose(supplierId, periodRange-as-iso, prices)`.

Verify: `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`.

### Phase 5 — Báo giá chênh lệch, gợi ý đơn giá, tab Thanh toán (7h)

Phụ thuộc: Phase 1 và Phase 4.

**Files to Create:** `lib/vat-tu-ncc/price-suggestion.ts` (thuần), `lib/vat-tu-ncc/__tests__/price-suggestion.test.ts`, `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx`, `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/thanh-toan-client.tsx`.

**Files to Modify:** `lib/vat-tu-ncc/quote-resolver.ts`, `lib/vat-tu-ncc/__tests__/quote-resolver.test.ts`, `lib/vat-tu-ncc/price-quote-service.ts`, `lib/vat-tu-ncc/period-close-service.ts`, `app/(app)/vat-tu-ncc/[supplierId]/bao-gia/bao-gia-client.tsx`, `components/vat-tu-ncc/delivery-form.tsx`, `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx`, `lib/ledger/ledger-service.ts` (lọc `transactionTypes`), `lib/cong-no-vt/material-ledger-service.ts` (`REVALIDATE_PATHS` dòng 14 thêm `revalidatePath("/vat-tu-ncc/[supplierId]", "layout")`).

Các bước:
1. `quote-resolver.ts` thêm `annotateQuoteHistory(quotes)`: sắp theo `(itemId, effectiveFrom, id)`, gắn `prevPrice`, `diff`, `label` thuộc `"Mới" | "Tăng" | "Giảm" | "Giữ nguyên"`; dùng cùng thứ tự tie-break với `resolveQuotePrice` để "giá trước" luôn là giá mà resolver đã áp trước đó.
2. `bao-gia-client.tsx`: thêm cột Giá trước, Chênh lệch, Ghi chú nhãn (sortable 3 trạng thái); nút Sửa mở form điền sẵn và gọi `updatePriceQuote` (đã có, guard edit).
3. `price-suggestion.ts`: `suggestUnitPrice(quotes, lastPrices, itemId, date)` = `resolveQuotePrice` rồi fallback giá nhập gần nhất. `previewPeriodClose` dùng hàm này thay biểu thức nội tuyến; `price-quote-service.ts` thêm action `suggestDeliveryUnitPrice(supplierId, itemId, date)` (guard `"vat-tu-ncc"`), truy vấn quotes và giá nhập gần nhất trước `date` rồi gọi cùng hàm.
4. `delivery-form.tsx`: thêm trường `unitPrice` (schema đã có ở `lib/vat-tu-ncc/schemas.ts:10`); khi `itemId` hoặc `date` đổi và người dùng chưa gõ tay thì gọi `suggestDeliveryUnitPrice` để điền gợi ý.
5. Tab Thanh toán: thêm `{ href: "/thanh-toan", label: "Thanh toán" }` vào TABS, chỉ hiện khi `canAccess(cong-no-vt, read)`; page nạp `listMaterialTransactions({partyId, transactionTypes:["thanh_toan","thue_hd"], pageSize: 500})`, danh sách Chủ thể và công trình của NCC; client có form (Loại: Chuyển khoản/Thuế HĐ, Ngày, Chủ thể bắt buộc, Công trình tuỳ chọn, Số tiền TT, Số tiền HĐ mặc định 0, Số HĐ và Ngày HĐ hiện khi Thuế HĐ, Nội dung) gọi `createMaterialTransaction` và bảng sortable có nút xoá gọi `softDeleteMaterialTransaction` (bị guard kỳ ký từ Phase 1).

Tests:
- Unit `quote-resolver.test.ts`: chuỗi Nam Hương 1.900 rồi 1.850 cho nhãn "Mới" rồi "Giảm" chênh −50; cùng ngày hiệu lực thì id lớn hơn là bản sau; vật tư khác độc lập.
- Unit `price-suggestion.test.ts`: Lộc Tài "Ca" 2.600.000 / 3.300.000 / 3.000.000 theo ba mốc hiệu lực trả đúng giá theo ngày phiếu; không có báo giá thì dùng giá nhập gần nhất; không có gì thì `null`.
- Integration: thêm case vào `vat-tu-ncc-period-boundary.integration.test.ts` gọi `createMaterialTransaction` loại `thanh_toan` 100.000.000 ngày 15/5 cho Nam Hương và khẳng định đối chiếu kỳ 28/4 đến 26/5 có C = 100.000.000; ghi `thue_hd` vào kỳ đã ký bị từ chối.
- `test/unit/module-release-entrypoints.test.ts` giữ xanh (action mới có guard `"vat-tu-ncc"`).

Verify: `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`, `pnpm risk:verify`.

### Phase 6 — Tài liệu (2h)

Phụ thuộc: Phase 1 đến 5.

**Files to Modify:** `docs/user-guide/ke-toan.md`, `docs/user-guide/can-bo-vat-tu.md`, `docs/system-architecture.md`.

Các bước:
1. `ke-toan.md`: loại Thuế HĐ, tab Thanh toán, trang Tổng hợp và bộ chọn mốc, xuất Excel tổng hợp, ý nghĩa LH = Đầu kỳ + Lấy hàng trong Excel.
2. `can-bo-vat-tu.md`: báo giá chênh lệch và sửa dòng, gợi ý đơn giá khi nhập phiếu, chốt kỳ theo khoảng ngày với quy tắc liền kề (ví dụ 26/5 phải nhập là 27/5).
3. `system-architecture.md`: mô-đun phân loại, định nghĩa cửa sổ và ba bất biến, ngoại lệ có chủ đích của `balance-service`, khoá advisory theo NCC.

Verify: đọc lại so với code đã merge; link và đường dẫn tồn tại.

## Rủi ro và giảm thiểu

| Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|
| Thay fragment làm đổi số báo cáo hiện có (ví dụ `queryDebtMatrix` nay tính `dieu_chinh`) | Trung bình × Cao | Ma trận chưa trang nào gọi; parity test TS và SQL; `cong-no-luy-ke` và pilot giữ xanh; snapshot giá trị `queryMonthlyByParty` trước/sau |
| `thue_hd` lọt khỏi một truy vấn chưa liệt kê | Trung bình × Cao | Test nguồn khẳng định không còn `'thanh_toan' THEN` ngoài file phân loại; grep `transactionType` trong `lib/` khi review |
| Snapshot kỳ đã ký cũ thiếu `totalTax` | Cao × Thấp | Mặc định 0/[]; cột "Thuế/ĐC" suy từ đẳng thức 4 cột nên không cần JSON |
| Lệch múi giờ (code cũ dùng giờ địa phương ở `balance-report-service.ts:112`) | Trung bình × Trung bình | Mọi ranh giới mới UTC; unit test kiểm giờ 00:00 UTC; integration chạy với `TZ=Asia/Bangkok` |
| Chốt kỳ đồng thời với `from` khác nhau tạo kỳ chồng lấn | Thấp × Cao | Khoá advisory theo NCC ở commit/sign/unsign; test đồng thời |
| Quy tắc liền kề chặn dữ liệu Excel nhãn chồng 1 ngày | Cao × Thấp | Thông báo lỗi gợi ý ngày đúng; ghi rõ trong hướng dẫn |
| Đổi chữ ký `commitPeriodClose` làm vỡ caller | Thấp × Trung bình | Caller duy nhất là `chot-ky-client.tsx` và pilot test; tsc bắt mọi chỗ sót |
| Trang dùng hàng ở hạt dự án làm chậm ma trận | Thấp × Thấp | Index `(ledgerType, entityId, partyId, projectId, date)` đã có; số hàng cỡ nghìn |

Rollback: mỗi phase là một commit riêng, không migration, không ghi dữ liệu dẫn xuất mới; revert commit là đủ. Riêng giao dịch `thue_hd` đã ghi sẽ vẫn tăng nợ trong các truy vấn đã revert vì nhánh `ELSE` cộng dương, nên số dư vẫn đúng; chỉ nhãn hiển thị mất.

## Tổng effort

Phase 1: 7h. Phase 2: 8h. Phase 3: 9h. Phase 4: 6h. Phase 5: 7h. Phase 6: 2h. Tổng: 39h (đường găng P1, P2, P3, P6 là 26h nếu P4 và P5 chạy song song nhánh còn lại).

Câu hỏi còn mở:
- Thuế HĐ có tăng nợ cột HĐ không, hay chỉ TT? Kế hoạch mặc định Số tiền HĐ = 0 và cho người dùng nhập.
- Export `cong-no-tong-hop` để admin-only như `cong-no-monthly` hay mở cho quyền read `cong-no-vt`? Kế hoạch theo chính sách hiện có (admin-only).
- `thue_hd` có cần cho sổ nhân công không? Kế hoạch cho NC schema nhận loại này vì dùng chung tuple, không thêm UI riêng.

```
Status: DONE_WITH_CONCERNS
Summary: Ứng viên 2 giao đủ 5 hạng mục, xoay quanh một mô-đun phân loại (fragment SQL + TS) và một truy vấn cửa sổ lõi mà ba báo cáo cùng gộp từ đó; các đẳng thức kế toán được chứng minh bằng test parity và số Excel Nam Hương/Bê tông Hải Phòng.
Concerns/Blockers: Ba câu hỏi nghiệp vụ còn mở (thuế có vào cột HĐ không, quyền xuất Excel tổng hợp, phạm vi thue_hd cho nhân công); quy tắc liền kề sẽ từ chối nhãn kỳ chồng 1 ngày kiểu Excel.
```
