# Gói bằng chứng chung cho tranh luận kế hoạch (debate evidence packet)

Ngày: 2026-10-06. Repo: `C:\Users\tranv\OneDrive\Desktop\ngoquyen-erp` (Next.js 16, Prisma 7, Postgres, pnpm, vitest). Nhánh: `main`.
Nguồn: `plans/reports/brainstorm-261006-0953-vat-tu-ncc-bao-gia-cong-no-tong.md` (đã chốt với người dùng) + khảo sát mã nguồn bên dưới. Mọi planner dùng đúng gói này, không đọc kế hoạch nháp nào khác.

## 1. Phạm vi đã chốt (bắt buộc giao đủ, không cắt)

1. Loại giao dịch sổ cái mới `thue_hd` (thuế hoá đơn NCC) làm **tăng nợ**; hiển thị tách dòng trong bảng đối chiếu; mọi truy vấn, đối chiếu, grid, schema phải nhận.
2. Truy vấn sổ cái theo cửa sổ `[from, to]` + trang `/cong-no-vt/tong-hop` (ma trận NCC × Chủ thể, Lấy hàng / Trả / Nợ cho TT và HĐ, nhóm TỔNG CÔNG TY) + bộ chọn mốc thời gian dùng chung (Toàn bộ / Năm / Quý / Tháng / Tuần ISO thứ Hai→Chủ nhật / Kỳ NCC 27→26 / Tuỳ chọn) cho `tong-hop`, `bao-cao-thang`, `chi-tiet` + xuất Excel tổng hợp theo mẫu sheet "Công Nợ".
3. Báo giá: hiện giá trước + chênh lệch + nhãn Tăng/Giảm/Mới; sửa dòng; gợi ý đơn giá khi nhập phiếu ngày. Tab "Thanh toán" trong `/vat-tu-ncc/[supplierId]` để ghi chuyển khoản (và thuế hoá đơn).
4. Biên kỳ chốt linh hoạt `[from, to]`, mặc định 27→26, kỳ đầu của NCC mặc định từ phiếu sớm nhất chưa chốt, chặn chồng lấn kỳ đã ký và bắt buộc liền kề kỳ ký trước.
5. Cập nhật `docs/user-guide/ke-toan.md`, `docs/user-guide/can-bo-vat-tu.md`, `docs/system-architecture.md`.

Bất biến: nguồn sự thật là `ledger_transactions` + `ledger_opening_balances`, không lưu số dẫn xuất (trừ snapshot kỳ đã ký); kỳ đã ký bất biến; unit 698 / integration 41 giữ xanh.

## 2. Mô hình dữ liệu hiện có (`prisma/schema.prisma`)

- `LedgerTransaction` (dòng 693): `ledgerType "material"|"labor"`, `transactionType String` (hiện "lay_hang"|"thanh_toan"|"dieu_chinh", **không CHECK constraint** trong `prisma/migrations` → thêm loại mới không cần migration), `entityId`, `partyId`, `projectId?`, `itemId?`, `amountTt/vatPctTt/vatTt/totalTt`, `amountHd/.../totalHd`, `invoiceNo`, `invoiceDate`, `content`, `status`, `deliveryId?` (1 phiếu ↔ ≤1 event), `qty`, `unitPriceSnapshot`, `paymentRoundItemId?`. Index `(ledgerType, entityId, partyId, projectId, date)`.
- `LedgerOpeningBalance` (747): unique `(ledgerType, entityId, partyId, projectId)`, `balanceTt/Hd`, `asOfDate`.
- `SupplierDeliveryDaily` (551): phiếu ngày `supplierId, projectId?, date, itemId, qty, unit, unitPrice?, totalAmount?, cbVatTu, chiHuyCt, keToan, note`.
- `SupplierPriceQuote` (582): `supplierId, itemId, unitPrice, effectiveFrom, note`.
- `SupplierReconciliation` (597): `supplierId, periodFrom, periodTo, openingBalance?, totalIn?, totalPaid?, closingBalance?` (chỉ ghi khi ký), `signedBySupplier`, `signedDate`, `signedSnapshotJson`.
- `Supplier`, `Entity` (Chủ thể), `Project.entityId`, `Item(type "material")`.

## 3. Mã nguồn liên quan (đường dẫn : dòng)

### Truy vấn sổ cái
- `lib/ledger/ledger-aggregations.ts`: `querySummary` (37; FILTER theo `lay_hang`/`thanh_toan`/`dieu_chinh`; balance = opening + lay − tra + dieu_chinh), `queryMonthlyByParty(ledgerType, year, month, entityId)` (120; CTE `first_of_month/last_of_month`; opening = ob + Σ tx trước tháng với CASE `thanh_toan` âm, còn lại dương; period CASE: `lay_hang` và `dieu_chinh>0` → lay, `thanh_toan` và `dieu_chinh<0` → tra), `queryCurrentBalance` (232; CASE `thanh_toan` âm, còn lại dương, `date <= asOf`), `queryDebtMatrix(ledgerType, {entityIds?, partyIds?})` (287; **không có lọc ngày**; trả `MatrixRow {partyId, partyName, cells[entityId]: MatrixCell{openTt,openHd,layTt,layHd,traTt,traHd,closeTt,closeHd}, totals}`; **chưa trang nào gọi**).
- `lib/ledger/ledger-types.ts`: `TransactionType` union (4), `SummaryRow`, `MonthlyByPartyRow`, `MatrixCell`, `MatrixRow`.
- `lib/ledger/ledger-service.ts`: `LedgerService(ledgerType)`: `assertMaterialPeriodOpen` (40–47; chỉ `lay_hang|thanh_toan`), `list`, `create`, `update`, `softDelete`, `upsertFromDelivery` (181), `summary`, `monthlyByParty`, `currentBalance`, `detailedDebtMatrix` (271), opening balance CRUD.
- `lib/ledger/balance-service.ts`: `getBalancesBulk` FILTER chỉ `lay_hang`/`thanh_toan` (143–147); comment đầu file nói `dieu_chinh` bỏ qua.
- `lib/cong-no-vt/balance-report-service.ts`: `queryDetailReport({ledgerType, year?, month?, entityIds?, projectIds?, showZero})` — year/month chỉ là **mốc cắt** (`date < first of next month`), CASE `lay_hang`/`dieu_chinh>0` → phát sinh, `thanh_toan`/`dieu_chinh<0` → đã trả; trả `rows` (Chủ thể × NCC × Công trình) + `subtotals`. Dùng chung cho nhân công qua `lib/cong-no-nc/balance-report-service.ts`.
- `lib/cong-no-vt/material-ledger-service.ts`: server actions có guard `requireReleasedModuleRequest("cong-no-vt", ...)`; `REVALIDATE_PATHS` (dòng 14); `createMaterialTransaction`, `patch`, `adminPatch` (guard kỳ ký cho `lay_hang|thanh_toan`), `bulkUpsert`, `getMaterialSummary`, `getMaterialMonthlyReport(year, month, entityId)`, `firstMaterialEntityWithActivity`, `getMaterialCurrentBalance`, `getMaterialDebtMatrix` (chưa ai dùng).
- `lib/cong-no-vt/schemas.ts`: zod `transactionSchema.transactionType` enum 3 giá trị; `lib/cong-no-nc/schemas.ts` tương tự cho nhân công.

### Vật tư NCC
- `lib/vat-tu-ncc/period.ts`: `periodRange(year, month)` cố định 27 tháng trước → 26 tháng đích (UTC midnight), `periodLabel`.
- `lib/vat-tu-ncc/period-lock.ts`: `findSignedPeriodCovering`, `assertPeriodOpen(supplierId, date)`.
- `lib/vat-tu-ncc/period-close-service.ts`: `previewPeriodClose(supplierId, year, month)` (104; gợi ý giá = `resolveQuotePrice` rồi fallback giá nhập gần nhất), `commitPeriodClose(supplierId, year, month, prices)` (172; advisory lock `vat-tu-close:{supplierId}:{from}`, từ chối nếu có kỳ ký chồng lấn, từ chối phiếu thiếu công trình/Chủ thể hoặc thiếu giá, `upsertFromDelivery` idempotent, tạo marker `SupplierReconciliation(periodFrom, periodTo)` nếu chưa có).
- `lib/vat-tu-ncc/reconciliation-derive-service.ts`: `supplierBalanceAsOf` (CASE `thanh_toan` âm, còn lại dương), `computeReconciliation(supplierId, from, to)` → `{opening, totalIn, totalPaid, totalAdjust, closing, layHangRows, thanhToanRows, adjustRows, byProject, byItem}`; `getReconciliationView(id)`; `listReconciliationsDerived`; `signReconciliation` (tx + advisory lock, ghi 4 cột tổng + JSON); `unsignReconciliation` (admin, chỉ kỳ ký mới nhất).
- `lib/vat-tu-ncc/reconciliation-service.ts`: `createReconciliation` thủ công với `periodFrom/periodTo` tuỳ ý (chỉ chặn trùng đúng khoảng), `update`, `softDelete`.
- `lib/vat-tu-ncc/price-quote-service.ts`: `listPriceQuotes`, `createPriceQuote`, `updatePriceQuote` (có service, **UI chưa có nút sửa**), `softDeletePriceQuote`. `quote-resolver.ts`: `resolveQuotePrice(quotes, itemId, date)` (mức `effectiveFrom <= date` mới nhất, tie id lớn hơn).
- `lib/vat-tu-ncc/delivery-service.ts`: `listDeliveries`, `listDeliveriesMonthly` (view `vw_supplier_delivery_monthly`), `createDelivery`/`updateDelivery` (guard kỳ ký), `softDeleteDelivery` (xoá mềm cả event ledger).
- `lib/vat-tu-ncc/schemas.ts`: `deliverySchema` (có `unitPrice?`), `reconciliationSchema`, `priceQuoteSchema`.
- `lib/payment/payment-ledger-sync.ts`: đợt thanh toán đóng → `thanh_toan` (vat_tu), idempotent theo `paymentRoundItemId`.

### UI
- `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx`: TABS `/ngay, /thang, /bao-gia, /chot-ky, /doi-chieu` (+ admin `/kiem-tra-khop`).
- `app/(app)/vat-tu-ncc/[supplierId]/ngay/page.tsx` + `components/vat-tu-ncc/delivery-grid.tsx` (DataGrid cột: date, itemLabel, qty, unit, unitPrice, totalAmount, projectLabel, cbVatTu, chiHuyCt, keToan, note) + `components/vat-tu-ncc/delivery-form.tsx` (react-hook-form; **chưa có trường unitPrice**).
- `app/(app)/vat-tu-ncc/[supplierId]/bao-gia/bao-gia-client.tsx`: form thêm (vật tư, đơn giá, hiệu lực từ, ghi chú) + bảng sortable (vật tư, đơn giá, hiệu lực từ, ghi chú, xoá).
- `app/(app)/vat-tu-ncc/[supplierId]/chot-ky/chot-ky-client.tsx`: input `type="month"` → `previewPeriodClose(supplierId, year, month)`; bảng phiếu + ô giá; `commitPeriodClose`.
- `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/doi-chieu-client.tsx` (bảng kỳ: A, B, C, Tổng nợ, trạng thái) + `doi-chieu/[reconciliationId]/page.tsx` (chi tiết, `sign-button.tsx`) + `components/vat-tu-ncc/reconciliation-form.tsx` (from/to tuỳ ý).
- `app/(app)/cong-no-vt/page.tsx` → `components/ledger/ledger-overview-shell.tsx` (Tổng nợ TT/HĐ, top 5; `navLinks`: nhập liệu, số dư ban đầu, báo cáo tháng, công nợ lũy kế).
- `app/(app)/cong-no-vt/bao-cao-thang/page.tsx` + `bao-cao-thang-filter.tsx` (MonthYearPicker + select Chủ thể, bắt buộc 1 chủ thể) + `components/ledger/monthly-report.tsx` (props `rows, entityName, year, month, partyLabel`) + `ExcelExportButton template="cong-no-monthly"`.
- `app/(app)/cong-no-vt/chi-tiet/page.tsx` + `components/ledger/detail-report-filter.tsx` (select Năm/Tháng "Tất cả", multiselect Chủ thể/Công trình qua `/api/cong-no/cascade-projects`, checkbox hiện dòng 0) + `components/ledger/detail-report-table.tsx`.
- `app/(app)/cong-no-vt/nhap-lieu/page.tsx` → `components/ledger-grid/transaction-grid.tsx` (`TX_TYPES` dòng 69–73; onAddRow stub `transactionType: "lay_hang"`). Nhãn loại còn ở `components/ledger/transaction-form-dialog.tsx` (27–29) và `components/ledger/transaction-grid.tsx` (73–75).
- Nhân công dùng chung component: `app/(app)/cong-no-nc/bao-cao-thang/page.tsx` + `bao-cao-thang-filter-nc.tsx`, `cong-no-nc/chi-tiet/page.tsx` (DetailReportFilter, DetailReportTable), `cong-no-nc/nhap-lieu`.
- `components/layout/breadcrumb.tsx` (nhãn route 13, 53, 54), `components/layout/app-sidebar.tsx` (25, 32), `lib/acl/modules.ts` (`vat-tu-ncc`, `cong-no-vt` level dept, levels read/comment/create/edit).
- Sắp xếp bảng: `components/sortable-table/{sortable-table-head,use-sortable-rows}` (hợp đồng 3 trạng thái, bắt buộc với bảng mới). `components/ui/month-year-picker.tsx`, `components/ui/date-input.tsx`, `components/data-grid` (`DataGridColumn.kind`, `options`, `fk`).

### Xuất Excel
- `app/api/export/excel/route.ts`: POST `{template, params}`; `moduleByTemplate` (cong-no-monthly, doi-chieu, du-toan, sl-dt); admin-only cho cong-no-monthly/doi-chieu/sl-dt; switch gọi builder.
- `lib/export/excel-exporter.ts`: `createWorkbook`, `addSheet(wb, name, columns: SheetColumn[], rows, {title?, footerLabel?, footerValues?})` (chỉ 1 hàng header phẳng, không merged group header), `workbookToBuffer`.
- `lib/export/templates/cong-no-monthly.ts` (gọi `queryMonthlyByParty`), `doi-chieu.ts` (gọi `querySummary`).

### Tiện ích kỳ có sẵn (tham khảo, không bắt buộc dùng)
- `lib/van-hanh/period.ts`: `parsePeriod({period, year, month, q})` cho month/quarter/year (local time), `previousPeriod`, `formatPeriod`. Không có tuần ISO.
- `lib/tai-chinh/state-obligation-matrix-period.ts`: `periodBounds` UTC cho year/quarter/month.
- Ngày sổ cái lưu UTC midnight (`new Date("YYYY-MM-DD")`); `periodRange` cũng UTC. Bộ chọn mới phải nhất quán UTC.

### Test
- Unit: `pnpm test` (vitest project unit; 698). Mock prisma kiểu `lib/ledger/__tests__/ledger-aggregations.test.ts` (`vi.mock("@/lib/prisma")`, chỉ test map kết quả). `lib/vat-tu-ncc/__tests__/{period,quote-resolver}.test.ts` thuần.
- Integration: `pnpm test:integration` (DB `_test` thật; 41). Mẫu: `test/integration/vat-tu-ncc-pilot.integration.test.ts` (Nam Hương: opening 310.605.120 tại 27/4; kỳ 5: B 44.400.000, C 100.000.000 → 255.005.120; kỳ 6: B 30.460.000 → 285.465.120; mock `requireReleasedModuleRequest`, `requireActiveAdmin`, `next/cache`; `truncateAll`), `test/integration/cong-no-luy-ke.integration.test.ts` (parity lũy kế vs báo cáo tháng).
- Typecheck `npx tsc --noEmit`, lint `pnpm lint`.

## 4. Dữ liệu mẫu Excel (số để viết test)

- `Gạch Nam Hương.xlsx` Đối chiếu: kỳ 01/4→27/4/2026: A = 35.866.799 + 109.336.700 + 44.600.000 + 1.621 = 189.805.120; 8 phiếu × 8.000 viên (6 @1.900, 2 @1.850) = 120.800.000 → Tổng 310.605.120. Kỳ 28/4→26/5: A 310.605.120, 3 × 8.000 @1.850 = 44.400.000, C chuyển khoản 100.000.000 → 255.005.120. Kỳ "26/5→26/6" (nhãn Excel chồng 1 ngày; phiếu 05/6, 25/6, 25/6).
- `Bê tông Hải Phòng.xlsx`: kỳ 29/3→26/4 (A = 544.649.722 − 1.611; dòng BT + Bơm BT cùng ngày; C: 16/4 CK 300.000.000); kỳ 26/4→26/5: A 315.648.111, 27/4 BT M250 14,5 m3 @1.440.000 + Bơm 1 ca @2.900.000; **C = "Thuế HĐ: 00000232 ngày 29/5/2026" 11.448.000 ở cột Nợ** (tăng nợ). Kỳ 27/6→26/7.
- `Máy xúc Lộc Tài HT.xlsx`: kỳ 01/5→26/5, 26/5→26/6; đối chiếu gộp 2 công trình (Trại Chuối, Dải cây xanh) có tổng phụ theo công trình; cùng vật tư "Ca" nhưng giá 2.600.000 / 3.300.000 / 3.000.000 khác nhau theo ngày.
- `Báo giá vật tư.xlsx`: mỗi NCC một sheet, cột Ngày tháng, Tên vật tư, Giá cũ, Giá mới, Giá chênh, Ghi chú (Tăng/Giảm/Mới/Giữ nguyên).
- `Quản Lý Công Nợ Vật Tư.xlsx` sheet "Công Nợ": hàng = NCC; nhóm cột = Chủ thể (Công ty quản lý, Lê Văn Huyên, Lưu Minh Xuân) + TỔNG CÔNG TY; mỗi nhóm: LH TT, Trả TT, Nợ TT, LH HĐ, Trả HĐ, Nợ HĐ. Lưu ý: "LH" Excel = số dư ban đầu + lấy hàng (SUMIFS Nhập Liệu + Số Dư Ban Đầu).

## 5. Điểm thiết kế mở (planner tự quyết và biện luận)

1. Cách gom `thue_hd` vào nhóm tăng nợ ở 6 truy vấn SQL (fragment chung vs sửa từng chỗ); cách lưu thuế trong 4 cột snapshot kỳ đã ký.
2. Tổng quát hoá truy vấn cửa sổ: hàm mới nhận `{from?, to?, entityId?}` với wrapper giữ `queryMonthlyByParty` cũ, hay thay thế chữ ký; `queryDebtMatrix` thêm `from/to`; `queryDetailReport` thêm `from`.
3. Mô-đun tính mốc thời gian (preset → `[from, to]` UTC, tuần ISO) và component chọn mốc dùng chung cho 3 trang VT và 2 trang NC.
4. Layout trang tổng hợp + layout Excel (exporter chỉ hỗ trợ header phẳng).
5. Thiết kế tab Thanh toán: ghi `thanh_toan`/`thue_hd` qua `createMaterialTransaction` (cần quyền `cong-no-vt` create) hay server action mới trong `lib/vat-tu-ncc`.
6. Quy tắc kiểm tra kỳ linh hoạt (chồng lấn, liền kề, kỳ đầu) và chỗ đặt (helper thuần + dùng ở cả `commitPeriodClose` lẫn `createReconciliation`).
7. Thứ tự phase và ước lượng giờ; tối thiểu hoá số file chạm nhưng giao đủ phạm vi mục 1.
