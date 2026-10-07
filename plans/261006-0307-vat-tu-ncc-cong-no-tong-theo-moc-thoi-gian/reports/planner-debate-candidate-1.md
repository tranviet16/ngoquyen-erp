# Ứng viên kế hoạch 1 — Lăng kính THAY ĐỔI TỐI THIỂU

Ngày: 2026-10-06. Nguồn: `reports/debate-evidence-packet.md` + đọc lại mã nguồn (mọi `path:line` dưới đây đã grep lại).

## Tổng quan kiến trúc

- Không migration Prisma nào. `thue_hd` chỉ là một giá trị chuỗi mới của `LedgerTransaction.transactionType` (không có CHECK constraint); snapshot kỳ ký dùng lại 4 cột sẵn có + JSON.
- Một hằng số dùng chung `DEBT_INCREASE_TYPES = ["lay_hang", "thue_hd"]` đặt trong file có sẵn `lib/ledger/ledger-types.ts`, chèn vào SQL bằng `Prisma.join(...)`. Không tạo file SQL-fragment riêng.
- Một mô-đun thuần mới duy nhất cho mốc thời gian: `lib/ledger/time-window.ts` (preset sang `[from, to]` UTC, gồm tuần ISO và kỳ NCC tái dùng `periodRange`). Một component client mới duy nhất: `components/ledger/time-window-picker.tsx`, dùng ở 5 trang (VT: tong-hop, bao-cao-thang, chi-tiet; NC: bao-cao-thang, chi-tiet).
- Truy vấn cửa sổ: thân SQL của `queryMonthlyByParty` được chuyển thành `queryPartyWindow(ledgerType, entityId, {from, to})`; `queryMonthlyByParty` thành wrapper 3 dòng nên test parity và mẫu Excel cũ không đổi hành vi. `queryDebtMatrix` và `queryDetailReport` chỉ nhận thêm trường tuỳ chọn `from/to`.
- Trang mới `/cong-no-vt/tong-hop` gọi `getMaterialDebtMatrix` (đã có, chưa ai dùng) và một component bảng mới `components/ledger/debt-matrix-table.tsx`. Excel tổng hợp là một template mới, exporter chỉ thêm tuỳ chọn `groupHeader` (hàng nhóm gộp ô) tương thích ngược.
- Tab "Thanh toán" là trang mới trong `vat-tu-ncc/[supplierId]/thanh-toan` nhưng ghi sổ qua server action có sẵn `createMaterialTransaction`/`softDeleteMaterialTransaction`; không có đường ghi thứ hai.
- Kỳ chốt linh hoạt: helper thuần `checkPeriodBounds` và `defaultPeriodTo` thêm vào file có sẵn `lib/vat-tu-ncc/period.ts`; `previewPeriodClose/commitPeriodClose` đổi tham số từ `(year, month)` sang `{from, to}`; khoá advisory đổi sang mức NCC.
- Báo giá: helper thuần `annotateQuoteChanges` thêm vào file có sẵn `lib/vat-tu-ncc/quote-resolver.ts`; gợi ý giá phiếu ngày dùng lại `resolveQuotePrice` phía client.
- Bất biến giữ nguyên: nguồn sự thật là `ledger_transactions` + `ledger_opening_balances`; kỳ đã ký đọc snapshot; không lưu số dẫn xuất mới.

## Quyết định cho 7 điểm mở

1. **`thue_hd` trong SQL và snapshot.** Dùng hằng `DEBT_INCREASE_TYPES` + `Prisma.join` ở mọi nhánh "lấy hàng" (`querySummary`, `queryMonthlyByParty`/`queryPartyWindow`, `queryDebtMatrix`, `getBalancesBulk`, `queryDetailReport`); `queryCurrentBalance` và `supplierBalanceAsOf` đã đúng sẵn vì nhánh `ELSE` dương. Trong snapshot kỳ ký, cột `totalIn` = Σ lấy hàng + Σ thuế HĐ, `closingBalance` đã gồm thuế; chi tiết tách dòng (`taxRows`, `totalTax`) nằm trong `signedSnapshotJson`. Lý do: không migration, công thức danh sách A + B − C vẫn khớp Tổng nợ, chi tiết vẫn tách dòng như Excel.
2. **Truy vấn cửa sổ.** Hàm mới `queryPartyWindow` nhận `{from: Date|null, to: Date|null}`; `queryMonthlyByParty` giữ chữ ký, gọi hàm mới với biên tháng UTC. `queryDebtMatrix` và `queryDetailReport` thêm `from?/to?` tuỳ chọn, giữ nguyên nhánh `year/month` cũ. Lý do: không phá 3 caller cũ và test parity `cong-no-luy-ke`.
3. **Mốc thời gian.** Một file thuần `lib/ledger/time-window.ts` (`resolveTimeWindow`, `parseTimeWindowParams`, `timeWindowToParams`) + một component `TimeWindowPicker` ghi lên URL search params (`preset, year, quarter, month, week, from, to`). Tương thích ngược: URL cũ `?year=&month=` không có `preset` được hiểu là preset `month`. Lý do: một nguồn duy nhất cho 5 trang và route Excel.
4. **Layout tổng hợp + Excel.** Bảng HTML 2 hàng tiêu đề (hàng nhóm theo Chủ thể + TỔNG CÔNG TY, hàng con LH TT / Trả TT / Nợ TT / LH HĐ / Trả HĐ / Nợ HĐ), hàng con dùng `SortableTableHead`. "LH" = dư đầu kỳ + lấy hàng trong cửa sổ, khớp định nghĩa Excel (SUMIFS Nhập liệu + Số dư ban đầu). Excel: thêm tuỳ chọn `groupHeader` vào `addSheet` (dùng `!merges` như hàng title đang làm). Lý do: khớp mẫu sheet "Công Nợ" mà chỉ mở rộng exporter một tuỳ chọn.
5. **Tab Thanh toán.** Gọi `createMaterialTransaction` (quyền `cong-no-vt` create). Trang kiểm tra `canAccessEntitlement(userId, "cong-no-vt", {minLevel: "create"})` để ẩn form khi không đủ quyền. Lý do: kế toán là người sở hữu sổ công nợ; tái dùng zod, guard kỳ ký, revalidate; không nhân đôi đường ghi.
6. **Quy tắc kỳ linh hoạt.** Helper thuần `checkPeriodBounds({from, to}, existing[])` trong `period.ts`: từ chối `from > to`; từ chối chồng lấn mọi kỳ đã ký; từ chối chồng lấn kỳ chưa ký nếu không trùng khớp đúng khoảng; nếu có kỳ ký kết thúc trước `from` thì kỳ ký gần nhất phải kết thúc đúng `from − 1 ngày`. Kỳ đầu: `from` mặc định = ngày phiếu sớm nhất chưa có event sổ cái (sau kỳ ký cuối nếu có), `to` mặc định = `defaultPeriodTo(from)` (ngày 26 kế tiếp ≥ from). Dùng ở `commitPeriodClose`, `createReconciliation`, `updateReconciliation`. Lý do: một quy tắc, ba điểm ghi marker.
7. **Thứ tự phase.** P1 (thue_hd) trước vì mọi truy vấn khác dựa vào nó; sau đó P2 → P3 tuần tự (cùng `ledger-aggregations.ts`), P4 và P5 chạy song song với P2/P3 (không chung file); P6 tài liệu cuối. Tổng 28h.

## Phases

### Phase 1 — Loại giao dịch `thue_hd` xuyên suốt (4h)

Phụ thuộc: không.

Files to Modify:
- `lib/ledger/ledger-types.ts` (union dòng 4; thêm hằng `DEBT_INCREASE_TYPES`)
- `lib/ledger/ledger-aggregations.ts` (FILTER dòng 54–55; CASE dòng 164–169; FILTER dòng 307–308)
- `lib/ledger/balance-service.ts` (FILTER dòng 144; comment đầu file dòng 5–10)
- `lib/cong-no-vt/balance-report-service.ts` (CASE dòng 136–141)
- `lib/ledger/ledger-service.ts` (`assertMaterialPeriodOpen` dòng 45)
- `lib/cong-no-vt/material-ledger-service.ts` (guard admin dòng 118)
- `lib/cong-no-vt/schemas.ts` (dòng 20), `lib/cong-no-nc/schemas.ts` (dòng 20)
- `components/ledger-grid/transaction-grid.tsx` (`TX_TYPES` dòng 69–73), `components/ledger/transaction-form-dialog.tsx` (27–29), `components/ledger/transaction-grid.tsx` (73–75)
- `lib/vat-tu-ncc/reconciliation-derive-service.ts` (interface `ReconComputed` dòng 47; vòng lặp dòng 145–170; `listReconciliationsDerived` dòng 262; `signReconciliation` dòng 302)
- `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/[reconciliationId]/page.tsx` (khối điều chỉnh dòng 191–208)
- `test/integration/vat-tu-ncc-pilot.integration.test.ts`, `lib/ledger/__tests__/ledger-aggregations.test.ts`

Các bước:
1. `ledger-types.ts`: `TransactionType = "lay_hang" | "thanh_toan" | "dieu_chinh" | "thue_hd"`; `export const DEBT_INCREASE_TYPES = ["lay_hang", "thue_hd"] as const;`.
2. `ledger-aggregations.ts`: thay `"transactionType" = 'lay_hang'` bằng `"transactionType" IN (${Prisma.join([...DEBT_INCREASE_TYPES])})` trong `querySummary` (FILTER lay_hang_tt/hd), CTE `period` của `queryMonthlyByParty` (2 nhánh WHEN lay), CTE `tx` của `queryDebtMatrix`. Không đụng CTE `opening` (nhánh `ELSE` đã dương) và `queryCurrentBalance`.
3. `balance-service.ts`: FILTER `lay_hang` thành `IN (...)`, cập nhật comment công thức (`outstanding = opening + Σ lay_hang + Σ thue_hd − Σ thanh_toan`).
4. `balance-report-service.ts`: 2 nhánh `WHEN "transactionType" = 'lay_hang'` của `phat_sinh_tt/hd` thành `IN (...)`.
5. Guard kỳ ký: `ledger-service.ts:45` và `material-ledger-service.ts:118` đổi điều kiện thành "khác `dieu_chinh`", tức `lay_hang | thanh_toan | thue_hd` đều bị khoá trong kỳ đã ký.
6. Zod: thêm `"thue_hd"` vào `z.enum` của cả hai schema (grid nhập liệu dùng chung VT/NC). Nhãn hiển thị "Thuế HĐ" ở 3 chỗ nhãn.
7. `reconciliation-derive-service.ts`: thêm `taxRows: ReconPaymentRow[]` và `totalTax: number` vào `ReconComputed`; trong vòng lặp thêm nhánh `else if (t.transactionType === "thue_hd")` trước nhánh `else`; `closing = opening + totalIn + totalTax − totalPaid + totalAdjust`. `listReconciliationsDerived` nhánh chưa ký trả `totalIn: c.totalIn + c.totalTax`. `signReconciliation` ghi `totalIn: computed.totalIn + computed.totalTax`. `getReconciliationView` mặc định `taxRows ?? []`, `totalTax ?? 0` cho snapshot cũ.
8. Trang chi tiết đối chiếu: thêm khối "Thuế hoá đơn (tăng nợ)" liệt kê `taxRows` (ngày, nội dung, số tiền) cạnh khối C; dòng tổng ghi "A + B + Thuế HĐ − C".

Tests:
- Unit `lib/ledger/__tests__/ledger-aggregations.test.ts`: mock `$queryRaw`, khẳng định SQL được gọi chứa tham số `thue_hd` (kiểm tra `values` của `Prisma.Sql`) và map kết quả không đổi.
- Integration `test/integration/vat-tu-ncc-pilot.integration.test.ts`, case mới "thuế HĐ tăng nợ (Bê tông Hải Phòng)": opening 315.648.111; 27/4 BT M250 14,5 × 1.440.000 = 20.880.000 và Bơm 1 × 2.900.000 (ghi qua phiếu + chốt kỳ); `thue_hd` ngày 2026-05-26, `invoiceNo` "00000232", `invoiceDate` 2026-05-29, `amountTt` 11.448.000. Khẳng định `computeReconciliation` (qua `getReconciliationView`) cho `totalTax` 11.448.000, `taxRows.length` 1, `closing` 350.876.111; `queryDebtMatrix` `closeTt` và `getOutstandingDebt` cùng bằng 350.876.111; sau ký, cột `totalIn` = 35.228.000 và `closingBalance` = 350.876.111; ghi `thue_hd` mới trong kỳ đã ký bị từ chối.

Verify: `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`.

### Phase 2 — Mốc thời gian dùng chung + truy vấn cửa sổ cho báo cáo tháng và lũy kế (7h)

Phụ thuộc: P1.

Files to Create:
- `lib/ledger/time-window.ts`, `lib/ledger/__tests__/time-window.test.ts`
- `components/ledger/time-window-picker.tsx`
- `test/integration/cong-no-time-window.integration.test.ts`

Files to Modify:
- `lib/ledger/ledger-aggregations.ts` (`queryMonthlyByParty` dòng 120)
- `lib/ledger/ledger-service.ts` (`monthlyByParty` dòng 234)
- `lib/cong-no-vt/material-ledger-service.ts` (`getMaterialMonthlyReport` dòng 264), `lib/cong-no-nc/labor-ledger-service.ts` (`getLaborMonthlyReport` dòng 262)
- `lib/cong-no-vt/balance-report-service.ts` (`DetailReportFilters` dòng 60, `queryDetailReport` dòng 100)
- `components/ledger/monthly-report.tsx` (props dòng 19–23, tiêu đề dòng 76), `components/ledger/detail-report-filter.tsx`
- `app/(app)/cong-no-vt/bao-cao-thang/page.tsx` + `bao-cao-thang-filter.tsx`; `app/(app)/cong-no-nc/bao-cao-thang/page.tsx` + `bao-cao-thang-filter-nc.tsx`
- `app/(app)/cong-no-vt/chi-tiet/page.tsx`, `app/(app)/cong-no-nc/chi-tiet/page.tsx`
- `lib/export/templates/cong-no-monthly.ts`, `app/api/export/excel/route.ts` (case `cong-no-monthly`)

Các bước:
1. `time-window.ts`: `type TimeWindowPreset = "all" | "year" | "quarter" | "month" | "week" | "ky-ncc" | "custom"`; `resolveTimeWindow(p)` trả `{from: Date|null, to: Date|null, label: string}` bằng `Date.UTC`: năm `[1/1, 31/12]`, quý `[1/(3q−2), ngày cuối tháng 3q]`, tháng `[1, ngày 0 tháng sau]`, tuần ISO (thứ Hai của tuần chứa 4/1 cộng `(week−1)×7`, đến Chủ nhật), kỳ NCC = `periodRange(year, month)` từ `lib/vat-tu-ncc/period.ts`, custom từ chuỗi `YYYY-MM-DD` (lỗi nếu from > to). `parseTimeWindowParams(sp, fallbackPreset)` đọc search params; nếu thiếu `preset` mà có `year&month` thì coi là `month`. `timeWindowToParams` cho route Excel.
2. `TimeWindowPicker` (client): select preset, rồi các input phụ thuộc preset (năm; quý 1–4; tháng; tuần 1–53; ngày from/to qua `DateInput`), `router.push` với search params mới và giữ nguyên param khác (`entityId`, `entityIds`...).
3. `ledger-aggregations.ts`: đổi tên thân `queryMonthlyByParty` thành `queryPartyWindow(ledgerType, entityId, {from, to})`; thay 2 CTE `first_of_month/last_of_month` bằng điều kiện `(${from}::date IS NULL OR date < ${from}::date)` cho opening (khi `from` null thì opening chỉ là ob) và `(${from}::date IS NULL OR date >= ${from}::date) AND (${to}::date IS NULL OR date <= ${to}::date)` cho period. `queryMonthlyByParty(ledgerType, year, month, entityId)` gọi `queryPartyWindow` với `from = Date.UTC(year, month−1, 1)`, `to = Date.UTC(year, month, 0)`.
4. `LedgerService.monthlyByParty(window, entityId)`; `getMaterialMonthlyReport(window, entityId)` và `getLaborMonthlyReport(window, entityId)` nhận `{from: string|null, to: string|null}` (chuỗi ISO vì là server action) rồi chuyển `Date`.
5. `queryDetailReport`: thêm `from?: Date; to?: Date` vào `DetailReportFilters`. Khi có, `effectiveCutoff` = `to + 1 ngày` và CTE `tx` thêm cột `prior_tt/prior_hd` = Σ có dấu (`thanh_toan` âm, `dieu_chinh` theo dấu, còn lại dương) với `date < from`; các cột `phat_sinh/da_tra` thêm điều kiện `date >= from`. `opening = ob + prior`. Nhánh `year/month` cũ giữ nguyên.
6. `MonthlyReport`: thay props `year, month` bằng `periodLabel: string`.
7. Trang bao-cao-thang VT/NC: `parseTimeWindowParams(sp, "month")` mặc định tháng hiện tại; fallback chủ thể dùng `year/month` của `to ?? hôm nay` khi gọi `firstMaterialEntityWithActivity`; filter thay `MonthYearPicker` bằng `TimeWindowPicker` cạnh select Chủ thể. Nút Excel truyền `timeWindowToParams(window)`.
8. Trang chi-tiet VT/NC: `parseTimeWindowParams(sp, "all")`; `DetailReportFilter` thay 2 select Năm/Tháng bằng `TimeWindowPicker`, giữ multiselect và checkbox.
9. `cong-no-monthly.ts`: `buildCongNoMonthlyExcel(ledgerType, window, entityId)` gọi `queryPartyWindow`; route parse `params` bằng `parseTimeWindowParams` (vẫn nhận `year/month` cũ), bỏ ràng buộc `month required` khi có preset.

Tests:
- Unit `lib/ledger/__tests__/time-window.test.ts`: tháng 5/2026 thành `[2026-05-01, 2026-05-31]`; quý 2 thành `[2026-04-01, 2026-06-30]`; năm 2026; tuần ISO 2026-W01 thành `[2025-12-29, 2026-01-04]`; 2026-W53 thành `[2026-12-28, 2027-01-03]`; kỳ NCC 6/2026 thành `[2026-05-27, 2026-06-26]`; `all` thành null/null; custom from > to ném lỗi; `{year: "2026", month: "5"}` không preset thành preset month.
- Integration `test/integration/cong-no-time-window.integration.test.ts` (fixture Nam Hương tối giản qua `LedgerService.create`: ob 310.605.120; 3 `lay_hang` 14.800.000 trong 28/4–26/5; 1 `thanh_toan` 100.000.000): cửa sổ `[2026-04-28, 2026-05-26]` qua `queryPartyWindow` cho opening 310.605.120, lấy 44.400.000, trả 100.000.000, closing 255.005.120; `queryDetailReport({from, to})` cho cùng 4 số; preset `all` closing 255.005.120; `queryMonthlyByParty` vẫn khớp `queryPartyWindow` cùng biên tháng.

Verify: `pnpm test`, `pnpm test:integration` (đặc biệt `cong-no-luy-ke` parity), `npx tsc --noEmit`, `pnpm lint`; thủ công mở 4 trang với URL cũ `?year=2026&month=5`.

### Phase 3 — Trang `/cong-no-vt/tong-hop` + xuất Excel tổng hợp (5h)

Phụ thuộc: P2 (cùng `ledger-aggregations.ts`, `route.ts`, cần `time-window.ts`).

Files to Create:
- `app/(app)/cong-no-vt/tong-hop/page.tsx`
- `components/ledger/debt-matrix-table.tsx`
- `lib/export/templates/cong-no-tong-hop.ts`, `lib/export/templates/__tests__/cong-no-tong-hop.test.ts`

Files to Modify:
- `lib/ledger/ledger-aggregations.ts` (`queryDebtMatrix` dòng 287), `lib/ledger/ledger-service.ts` (`detailedDebtMatrix` dòng 271), `lib/cong-no-vt/material-ledger-service.ts` (`getMaterialDebtMatrix` dòng 298)
- `lib/export/excel-exporter.ts` (`addSheet` dòng 36), `app/api/export/excel/route.ts`
- `app/(app)/cong-no-vt/page.tsx` (`navLinks` dòng 19–23)
- `test/integration/cong-no-time-window.integration.test.ts`

Các bước:
1. `queryDebtMatrix(ledgerType, {entityIds?, partyIds?, from?, to?})`: CTE `tx` thêm `prior_tt/hd` (Σ có dấu, `date < from`) cộng vào `open`; `lay` = `IN (DEBT_INCREASE_TYPES)` hoặc `dieu_chinh > 0`, `tra` = `thanh_toan` hoặc `−dieu_chinh < 0` (cùng quy ước `queryMonthlyByParty`), lọc `date` trong cửa sổ. `close = open + lay − tra`.
2. `getMaterialDebtMatrix` điền `partyName` từ `prisma.supplier` và sắp theo tên (giống `getMaterialMonthlyReport`), nhận window dạng chuỗi ISO.
3. `page.tsx` (server, `requireModuleAccess("cong-no-vt", read)`): `parseTimeWindowParams(sp, "all")`; lấy danh sách Chủ thể có dữ liệu; render `TimeWindowPicker`, nút `ExcelExportButton template="cong-no-tong-hop"`, `DebtMatrixTable`.
4. `DebtMatrixTable` (client): hàng tiêu đề nhóm (`colSpan=6` mỗi Chủ thể + TỔNG CÔNG TY), hàng con 6 cột LH TT, Trả TT, Nợ TT, LH HĐ, Trả HĐ, Nợ HĐ với `LH = open + lay`. Sắp xếp bằng `useSortableRows` + `SortableTableHead` cho cột NCC và 6 cột TỔNG CÔNG TY. Hàng tổng cuối bảng.
5. `addSheet`: thêm tuỳ chọn `groupHeader?: Array<{label: string; span: number}>`, chèn một hàng trước header và đẩy `!merges` tương ứng, giữ nguyên hành vi khi không truyền.
6. `cong-no-tong-hop.ts`: `buildCongNoTongHopExcel(window)` gọi `queryDebtMatrix`, cột phẳng `party` + `{entityId}_lhTt...` + `total_*`, `groupHeader` theo Chủ thể, `title` "Công Nợ — {label}", footer tổng. Route thêm `"cong-no-tong-hop": "cong-no-vt"` vào `moduleByTemplate` và áp cùng chính sách admin-only như `cong-no-monthly`.
7. Thêm `{ href: "/cong-no-vt/tong-hop", label: "Tổng hợp NCC × Chủ thể" }` vào `navLinks`; nhãn breadcrumb `tong-hop` đã có (`components/layout/breadcrumb.tsx:57`).

Tests:
- Unit `cong-no-tong-hop.test.ts` (mock `queryDebtMatrix`): 2 Chủ thể, cột LH TT = open + lay, TỔNG CÔNG TY = tổng các Chủ thể, `groupHeader` span 6 mỗi nhóm.
- Integration (file P2): thêm Chủ thể thứ hai cho cùng NCC (ob 0, lấy 1.000.000); `queryDebtMatrix({from: 2026-04-28, to: 2026-05-26})` cho ô Chủ thể 1 open 310.605.120 / lay 44.400.000 / tra 100.000.000 / close 255.005.120, `totals.closeTt` 256.005.120; thêm một `thue_hd` 11.448.000 trong cửa sổ thì `layTt` tăng đúng 11.448.000.

Verify: `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`; thủ công tải Excel và mở trong Excel xem hàng nhóm gộp ô.

### Phase 4 — Biên kỳ chốt linh hoạt (5h)

Phụ thuộc: P1 (cùng `reconciliation-derive-service.ts` và file test pilot). Song song được với P2/P3/P5.

Files to Modify:
- `lib/vat-tu-ncc/period.ts`, `lib/vat-tu-ncc/__tests__/period.test.ts`
- `lib/vat-tu-ncc/period-close-service.ts` (`previewPeriodClose` dòng 104, `commitPeriodClose` dòng 175, lock dòng 191)
- `lib/vat-tu-ncc/reconciliation-derive-service.ts` (lock dòng 309, 349)
- `lib/vat-tu-ncc/reconciliation-service.ts` (`createReconciliation` dòng 22, `updateReconciliation` dòng 44)
- `app/(app)/vat-tu-ncc/[supplierId]/chot-ky/chot-ky-client.tsx` (dòng 58, 103)
- `test/integration/vat-tu-ncc-pilot.integration.test.ts` (call site dòng 105–116, 211–212, 233–240)

Các bước:
1. `period.ts`: thêm `defaultPeriodTo(from: Date): Date` (nếu ngày UTC ≤ 26 thì ngày 26 cùng tháng, ngược lại ngày 26 tháng sau) và `checkPeriodBounds(range, existing: Array<{periodFrom, periodTo, signedBySupplier}>): string | null` theo quy tắc ở quyết định 6.
2. `period-close-service.ts`: thêm action `suggestNextPeriod(supplierId)` trả `{from, to}` (from = kỳ ký cuối `periodTo + 1` nếu có, nếu không là `MIN(date)` của `supplier_delivery_daily` không có event `ledger_transactions.deliveryId`). Đổi `previewPeriodClose(supplierId, range: {from: string; to: string})` và `commitPeriodClose(supplierId, range, prices)`; bên trong transaction, nạp mọi marker của NCC rồi gọi `checkPeriodBounds`, ném lỗi tiếng Việt nếu vi phạm. Marker tạo khi chưa có marker trùng đúng khoảng (giữ hành vi cũ).
3. Khoá advisory: đổi khoá thành `vat-tu-close:${supplierId}` ở cả 3 chỗ (close, sign, unsign) để hai thao tác khác biên trên cùng NCC vẫn tuần tự.
4. `reconciliation-service.ts`: `createReconciliation` và `updateReconciliation` gọi `checkPeriodBounds` (loại chính bản ghi đang sửa) thay cho kiểm tra trùng đúng khoảng.
5. `chot-ky-client.tsx`: thay input `type="month"` bằng 2 `DateInput` từ/đến, khởi tạo từ `suggestNextPeriod`, đổi "đến" mặc định bằng `defaultPeriodTo` khi đổi "từ".
6. Cập nhật call site trong test pilot: `periodRange(2026, 5)` chuyển sang `{from, to}` dạng chuỗi.

Tests:
- Unit `period.test.ts`: `defaultPeriodTo(2026-04-01)` = 2026-04-26; `defaultPeriodTo(2026-04-28)` = 2026-05-26; `defaultPeriodTo(2026-05-27)` = 2026-06-26; `checkPeriodBounds` từ chối from > to, chồng lấn kỳ ký, khoảng hở 1 ngày sau kỳ ký, chồng lấn marker chưa ký khác khoảng; chấp nhận trùng đúng khoảng và kỳ liền kề.
- Integration pilot, case mới "kỳ linh hoạt Nam Hương theo Excel": ob 189.805.120; 8 phiếu 8.000 viên tháng 4 (6 @1.900, 2 @1.850); chốt `[2026-04-01, 2026-04-27]` cho closing 310.605.120 rồi ký; chốt `[2026-04-28, 2026-05-26]` với 3 phiếu @1.850 + thanh toán 100.000.000 cho A 310.605.120, B 44.400.000, C 100.000.000, Tổng 255.005.120; chốt `[2026-04-27, …]` bị từ chối (chồng lấn kỳ ký); chốt `[2026-04-29, …]` bị từ chối (không liền kề). Các case cũ vẫn xanh với chữ ký mới.

Verify: `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`.

### Phase 5 — Báo giá (giá trước, chênh lệch, sửa, gợi ý) + tab Thanh toán (5h)

Phụ thuộc: P1 (loại `thue_hd`). Song song được với P2/P3/P4.

Files to Create:
- `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx`, `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/thanh-toan-client.tsx`

Files to Modify:
- `lib/vat-tu-ncc/quote-resolver.ts`, `lib/vat-tu-ncc/__tests__/quote-resolver.test.ts`
- `app/(app)/vat-tu-ncc/[supplierId]/bao-gia/bao-gia-client.tsx`
- `app/(app)/vat-tu-ncc/[supplierId]/ngay/page.tsx`, `components/vat-tu-ncc/delivery-grid.tsx`, `components/vat-tu-ncc/delivery-form.tsx`
- `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx` (`TABS` dòng 6–12)

Các bước:
1. `quote-resolver.ts`: thêm `annotateQuoteChanges(quotes)` trả mỗi báo giá kèm `prevPrice: number|null`, `diff: number|null`, `label: "Tăng"|"Giảm"|"Mới"|"Giữ nguyên"`, tính theo từng vật tư, sắp `effectiveFrom` rồi `id` (cùng quy ước tie của `resolveQuotePrice`).
2. `bao-gia-client.tsx`: thêm cột Giá trước, Chênh lệch, Ghi nhận (nhãn màu) vào bảng sortable; thêm nút Sửa mở lại form với giá trị dòng và gọi `updatePriceQuote` (service đã có, `price-quote-service.ts:40`).
3. `ngay/page.tsx`: nạp thêm `listPriceQuotes(id)` và truyền `quotes` xuống `DeliveryGrid` rồi `DeliveryForm`.
4. `delivery-form.tsx`: thêm `FormField name="unitPrice"`; `useEffect` theo `itemId` và `date` gọi `resolveQuotePrice(quotes, itemId, new Date(date))` và chỉ điền khi người dùng chưa sửa tay (`form.getFieldState("unitPrice").isDirty` false); hiện chú thích "Theo báo giá hiệu lực từ …".
5. `delivery-grid.tsx`: thêm `unitPrice` vào `defaultValues` của form sửa (hiện thiếu, dòng 170–181) để "Sửa đầy đủ" không làm mất đơn giá.
6. Tab Thanh toán: `layout.tsx` thêm `{ href: "/thanh-toan", label: "Thanh toán" }`. `page.tsx` nạp Chủ thể, công trình, `listMaterialTransactions({partyId, transactionType})` cho `thanh_toan` và `thue_hd`, và quyền create/edit `cong-no-vt`. Client: bảng sortable (ngày, loại, Chủ thể, công trình, số tiền TT/HĐ, số HĐ, nội dung, xoá) + form (loại Chuyển khoản/Thuế HĐ, ngày, Chủ thể, công trình tuỳ chọn, số tiền TT, số tiền HĐ mặc định 0, số HĐ, ngày HĐ, nội dung tự sinh "Thuế HĐ: {số} ngày {ngày}" khi loại là thuế) gọi `createMaterialTransaction` với `partyId = supplierId`; xoá qua `softDeleteMaterialTransaction`; sau đó `router.refresh()`.

Tests:
- Unit `quote-resolver.test.ts`: Nam Hương 1.900 (01/4) rồi 1.850 (28/4) cho dòng 2 `Giảm`, diff −50, dòng 1 `Mới`; Lộc Tài "Ca" 2.600.000 rồi 3.300.000 (`Tăng`, +700.000) rồi 3.000.000 (`Giảm`, −300.000); hai mức bằng nhau cho `Giữ nguyên`; cùng `effectiveFrom` thì id lớn hơn là mức sau.
- Integration: không thêm file; đường ghi `thue_hd`/khoá kỳ ký đã phủ ở P1 vì tab dùng chính `createMaterialTransaction`.

Verify: `pnpm test`, `npx tsc --noEmit`, `pnpm lint`; thủ công: nhập phiếu ngày cho vật tư có báo giá thấy đơn giá tự điền; ghi thuế HĐ 11.448.000 ở tab Thanh toán rồi mở đối chiếu thấy dòng thuế tách riêng.

### Phase 6 — Tài liệu + hồi quy toàn bộ (2h)

Phụ thuộc: P1–P5.

Files to Modify: `docs/user-guide/ke-toan.md`, `docs/user-guide/can-bo-vat-tu.md`, `docs/system-architecture.md`.

Các bước:
1. `ke-toan.md`: tab Thanh toán (chuyển khoản, thuế HĐ tăng nợ), trang Tổng hợp và Excel, bộ chọn mốc thời gian, ý nghĩa "LH = dư đầu kỳ + lấy hàng", chi-tiet theo cửa sổ (đầu kỳ = số dư trước "từ").
2. `can-bo-vat-tu.md`: báo giá có giá trước/chênh lệch/sửa; đơn giá gợi ý khi nhập phiếu; chốt kỳ chọn từ/đến, mặc định 27→26, quy tắc liền kề.
3. `system-architecture.md`: loại `thue_hd`, `DEBT_INCREASE_TYPES`, `time-window.ts`, `queryPartyWindow`, khoá advisory mức NCC, snapshot `totalIn` gồm thuế.

Verify: `pnpm test` (≥ 698 + mới), `pnpm test:integration` (≥ 41 + mới), `npx tsc --noEmit`, `pnpm lint`, `pnpm build`.

## Rủi ro và giảm thiểu

| Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|
| Bỏ sót một truy vấn khi thêm `thue_hd`, số dư lệch giữa các màn hình | Trung bình × Cao | Hằng `DEBT_INCREASE_TYPES` duy nhất; test integration P1 khẳng định 4 đường (đối chiếu, ma trận, `getOutstandingDebt`, lũy kế) cùng ra 350.876.111 |
| `Prisma.join` trong `IN (...)` gặp lỗi suy kiểu tham số Postgres | Thấp × Trung bình | Kiểm bằng integration thật ngay P1; nếu lỗi, ép `::text` từng tham số |
| Kỳ ký cũ có snapshot thiếu `taxRows/totalTax` | Cao × Thấp | Mặc định `?? []`/`?? 0` khi đọc; không viết lại snapshot đã ký |
| Đổi khoá advisory làm ký/chốt dở dang cùng lúc lúc deploy | Thấp × Trung bình | Khoá chỉ là `xact_lock`, hết khi giao dịch xong; deploy ngoài giờ |
| Nhãn Excel chồng 1 ngày ("26/5→26/6") không nhập được do quy tắc liền kề | Trung bình × Thấp | Hướng dẫn trong docs: dùng 27/5→26/6; số không đổi vì phiếu là 05/6, 25/6 |
| Đổi chữ ký `previewPeriodClose/commitPeriodClose` làm vỡ caller | Thấp × Trung bình | Chỉ 2 call site UI + 5 trong test pilot (đã liệt kê), `tsc` bắt hết |
| Chi-tiet theo "Tháng" đổi nghĩa từ mốc cắt sang cửa sổ | Trung bình × Thấp | Cuối kỳ không đổi; chỉ đầu kỳ/phát sinh tách theo cửa sổ; ghi rõ trong docs; nhánh `year/month` của service giữ nguyên cho test parity |
| Lệch múi giờ khi tính biên (UTC vs local) | Trung bình × Trung bình | `time-window.ts` chỉ dùng `Date.UTC`; unit test tuần ISO quanh năm mới |
| Người nhập phiếu không có quyền `cong-no-vt` create không ghi được thanh toán | Trung bình × Thấp | Trang ẩn form và hiển thị lý do; quyền do admin cấp |

Rollback: mỗi phase là một commit độc lập, không migration, nên `git revert` từng phase là đủ. Riêng dữ liệu `thue_hd` đã ghi: nếu revert P1 phải xoá mềm các giao dịch `thue_hd` trước (nếu không, chúng rơi vào nhánh "điều chỉnh"/`ELSE` và vẫn cộng vào số dư ở một số truy vấn).

## Tổng effort

P1 4h + P2 7h + P3 5h + P4 5h + P5 5h + P6 2h = **28h**.

Câu hỏi chưa giải quyết:
- Thuế HĐ ghi vào cột TT, HĐ hay cả hai? Kế hoạch mặc định TT = số thuế (đối chiếu NCC đọc TT), HĐ = 0 nhưng cho sửa; cần kế toán xác nhận.
- `thue_hd` có nên ẩn khỏi grid nhập liệu nhân công không? Kế hoạch cho phép ở cả hai vì grid dùng chung.

```
Status: DONE_WITH_CONCERNS
Summary: Kế hoạch 6 phase, 28h, không migration; tái dùng getMaterialDebtMatrix, createMaterialTransaction, resolveQuotePrice, periodRange và chỉ thêm 1 mô-đun thuần (time-window) cùng 3 component/trang mới cho toàn bộ 5 hạng mục.
Concerns/Blockers: Cách hạch toán thuế HĐ vào TT/HĐ cần kế toán xác nhận; quy tắc liền kề không cho nhập đúng nhãn Excel chồng 1 ngày "26/5→26/6".
```
