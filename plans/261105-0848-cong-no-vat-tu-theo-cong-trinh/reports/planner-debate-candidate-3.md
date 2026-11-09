# Ứng viên kế hoạch #3 — Góc nhìn luồng người dùng và vận hành Import

- Ngày: 05/11/2026. Lăng kính: kế toán nhập theo công trình, nạp 26 file qua sản phẩm, thấy lỗi ở đâu, tin số ở đâu.
- Quyết định D1–D7 coi là đã chốt. Mọi chỗ ghi `file:dòng` đã đọc trực tiếp trong repo.
- Hai điểm packet nói khác mã nguồn, kế hoạch bám theo mã nguồn:
  - `app/(app)/admin/import/[runId]/commit-panel.tsx:26` gửi `mapping = "{}"` và bắt tải lại file; trang run (`[runId]/page.tsx`) chỉ hiện lỗi, không hiện conflict hay dòng dữ liệu; `ImportRun` không lưu nội dung đã phân tích. Tức là **chưa có UI ánh xạ hay xem trước nào** — đây là lỗ hổng lớn nhất của D7.
  - `app/(app)/du-an/[id]/cong-no` đọc `project_transactions` qua `lib/du-an/supplier-debt-service.ts:1-10`, không phải snapshot tĩnh. Vẫn phải chuyển sang sổ cái vật tư.

## 1. Tóm tắt kiến trúc

1. Sổ cái `ledger_transactions` + `ledger_opening_balances` vẫn là nguồn sự thật duy nhất; mọi báo cáo chạy trên `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts:108`) không sửa câu truy vấn.
2. Phạm vi khóa, kỳ, ký, snapshot đổi từ NCC sang **cặp (NCC, công trình)**: `SupplierReconciliation.projectId`, khóa advisory `vat-tu-ncc:<ncc>:<ct>`, mọi đường ghi vật tư bắt buộc có công trình.
3. Lịch sử tới 26/10/2026: số tiền lấy từ Nhập Liệu; khối lượng lấy từ 24 file theo công trình và **ghép vào dòng Nhập Liệu tương ứng** (link `deliveryId` + qty + giá). Phiếu không ghép được nhận một **sự kiện 0 đồng** để không sinh nợ trùng và để kỳ ký được.
4. Mỗi cặp có **một marker chuyển đổi** 01/01/2026 → 26/10/2026 (chưa ký khi import); nó ép kỳ ERP đầu tiên bắt đầu 27/10 và là bảng đối chiếu "lịch sử Excel" trong ERP.
5. Lũy kế trọn đời: 2 dòng sổ cái 31/12/2025 cho cặp được duyệt; dòng số dư ban đầu của cặp đó được **đưa về 0 kèm ghi chú** (không xóa) để hoàn tác được và để biên kỳ không đổi.
6. Import: engine lưu file vào `ImportRun.fileData`, thêm bước `review(data, mapping)` trả về bảng duyệt chung (generic) và các quyết định; commit không cần tải lại file; hoàn tác theo thứ tự ngược trong nhóm adapter; 3 adapter mới/viết lại: file tổng, CSV lũy kế, file theo công trình (tải cả thư mục).
7. UI: trang `/vat-tu-ncc/cong-trinh/[projectId]`, chọn công trình trong layout NCC (`?project=`), trang `/cong-no-vt/tong-hop-cong-trinh` xoay chiều, trang `/admin/import/kiem-tra-vat-tu` đối chiếu số ERP với số Excel ngay sau commit.

## 2. Trả lời 9 vấn đề

### 2.1 Phạm vi (NCC × công trình)
- Cơ chế: thêm `projectId` vào `SupplierReconciliation`; `lockScopes(client, [{supplierId, projectId}])` thay `lockSuppliers` (`lib/vat-tu-ncc/period-lock.ts:36`), khóa theo thứ tự (ncc, ct) tăng dần; `assertPeriodOpen`, `findSignedPeriodCovering`, `loadPeriodBoundsContext`, `suggestRange…` nhận cặp; `period-bounds.ts` giữ nguyên (thuần). `assertSupplierOpeningEditable` (`lib/ledger/ledger-service.ts:87-99`) kiểm theo cặp. `syncClosedRoundToLedger` (`lib/payment/payment-ledger-sync.ts:35-39`) khóa theo cặp và từ chối dòng `vat_tu` thiếu công trình; `payment-service` bắt buộc `projectId` khi `category = vat_tu`. Sổ cái tay (`material-ledger-service`) bắt buộc công trình cho sổ vật tư. Unique một phần mới `(supplierId, projectId, periodFrom, periodTo) WHERE deletedAt IS NULL` thay `supplier_recon_period_unique`.
- Giả định lớn nhất: `projectId` để nullable trong schema (hàng pilot chưa dọn khi migrate), còn mã nguồn từ chối ghi khi thiếu; sau khi dọn pilot mới `SET NOT NULL` bằng migration nối tiếp.
- Hỏng đầu tiên khi: còn đường ghi nào gọi `lockSuppliers` cũ mà test không bắt (8 vị trí đã liệt kê ở packet §3); phòng bằng xóa hẳn hàm cũ để TypeScript báo lỗi.

### 2.2 Tính trùng giữa Nhập Liệu và lịch sử khối lượng
- Cơ chế: sổ cái ≤ 26/10 chỉ từ Nhập Liệu. Adapter file theo công trình ghép từng phiếu với dòng `lay_hang` của cùng (NCC, công trình, ngày) chưa link, theo thứ tự ưu tiên: (1) `qty × đơn giá đối chiếu = totalTt` (làm tròn đồng) → link đầy đủ (`deliveryId`, `itemId`, `qty`, `unitPriceSnapshot`, giống chốt kỳ sinh ra); (2) ngày đó cặp chỉ có đúng 1 dòng chưa link và đúng 1 phiếu chưa ghép → link, nhãn "khớp theo ngày"; (3) N phiếu cùng ngày có tổng = 1 dòng → dòng nhận `itemId` + ghi chú "gộp N phiếu", N phiếu nhận sự kiện 0 đồng; (4) không khớp → phiếu vẫn được nhập (D6) và nhận sự kiện `lay_hang` 0 đồng có `deliveryId`, nội dung "Lịch sử Excel — số tiền đã nằm trong Nhập Liệu". Dòng Nhập Liệu không có phiếu (NCC không có file, dòng chỉ HĐ) giữ nguyên. Phiếu ≥ 27/10 nhập có giá, không link, không sự kiện → kỳ 27/10→26/11 chốt trong ERP.
- Giả định: Nhập Liệu là bản nhập lại từng phiếu (packet §4 xác nhận ví dụ 06/04 Nam Hương 8.000 × 1.900), nên đa số ghép kiểu (1).
- Hỏng đầu tiên khi: file có giá nhưng Nhập Liệu ghi số đã trừ chiết khấu/bù cước → rơi vào (4), nợ vẫn đúng nhưng bảng đối chiếu lịch sử hiện phiếu 0 đồng; danh sách "không khớp" trong xem trước cho thấy ngay.

### 2.3 Kỳ đối chiếu lịch sử
- Cơ chế: **không** nhập từng khối tháng Excel làm `SupplierReconciliation` (khối tay sửa, chồng lấn, lỗi "27/08→26/07" trong Gạch NH MN, khối trùng trong Xi măng Anh Thư TC — đã quét). Thay vào đó mỗi cặp có ≥ 1 dòng sổ cái hoặc phiếu trong 01/01→26/10 nhận **một marker 01/01/2026→26/10/2026, chưa ký, note "Lịch sử Excel"**, do cả adapter file tổng lẫn adapter file theo công trình tạo idempotent (`ensureCutoverMarker`). Bảng dẫn xuất của marker = A (số dư 31/12) + B (Σ LH 2026) − C = Nợ 26/10, chính là số cần khớp "Tổng nợ" khối 27/09→26/10. Xem theo tháng dùng preset "Kỳ chuẩn 27→26" của trang tổng hợp. Sau khi kiểm tra khớp, người dùng **ký** marker qua nút sẵn có (hoặc nút ký hàng loạt ở trang kiểm tra) để khóa lịch sử; ký được vì mọi phiếu ≤ 26/10 đều có sự kiện (2.2).
- Giả định: ngày `asOf` số dư ban đầu được ghi là 31/12/2025 (sheet ghi 01/01/2026 nghĩa là "đầu ngày 01/01"); nếu để 01/01 thì luật 3 của `validatePeriodBounds` (`period-bounds.ts:106-114`) bác marker.
- Hỏng đầu tiên khi: có dòng Nhập Liệu ghi ngày < 01/01/2026 (packet nói không có) → marker không bao trùm; adapter liệt kê các dòng đó làm lỗi chặn.

### 2.4 Lũy kế và duyệt từng cặp trong sản phẩm
- Cơ chế: adapter `cong-no-luy-ke` (CSV) có bước `review`: mỗi cặp (NCC, công trình) sau ánh xạ bí danh hiện G, I, M, N của CSV; LH2026/Trả2026 TT và HĐ từ sổ cái; số dư ngụ ý `(G − LH2026) − (I − Trả2026)`; Số Dư Ban Đầu đã nhập; chênh TT, chênh HĐ; Chủ thể sẽ dùng (từ dòng số dư, nếu không có thì `Project.entityId`). Quyết định mỗi dòng: **Duyệt** / **Bỏ qua**; mặc định Duyệt khi chênh TT = chênh HĐ = 0 và có Chủ thể. Hai danh sách phụ: cặp CSV không tìm thấy trong ERP; cặp ERP có số dư mà CSV không có. Khi ghi: cặp duyệt → 2 dòng 31/12/2025 (`lay_hang` G/M, `thanh_toan` I/N, nội dung ghi số hợp đồng), dòng số dư ban đầu đưa về 0/0 với note "Thay bằng lũy kế (import #N)", giá trị cũ cất trong `ImportRun.decisions.parkedOpenings`; hook `rollback` khôi phục.
- Giả định: không cần báo cáo riêng năm 2025 (brainstorm đã chốt).
- Hỏng đầu tiên khi: một cặp có 2 dòng số dư ở 2 Chủ thể (unique cho phép) → review hiện cả hai và mặc định Bỏ qua; người dùng chọn tay.

### 2.5 UX import cho D7
- Cơ chế: (a) `ImportRun` lưu `fileData`, `sourcePath`, `batchId`, `decisions`, `review`; (b) form tải lên nhận `.csv`, nhiều file, và chế độ **chọn thư mục** (`webkitdirectory`) gửi kèm đường dẫn tương đối để lấy tên công trình từ thư mục; (c) trang run có 4 khối: Ánh xạ tên (bảng conflict với ô chọn ứng viên, "Tạo mới", "Bỏ qua"), Xem trước & duyệt (bảng generic theo `review`), Lỗi (chặn / cảnh báo), Ghi dữ liệu (không tải lại file); (d) hoàn tác chỉ cho run **mới nhất trong nhóm** `cong-no-vat-tu` (LIFO) và gọi `adapter.rollback` trước khi xóa theo `importRunId`; (e) adapter file tổng và CSV là `singleCommit` (chỉ một run committed, muốn nhập lại phải hoàn tác); adapter file theo công trình chống trùng theo khóa phiếu `(NCC, công trình, ngày, vật tư, KL, giá)`; (f) trang kiểm tra sau commit (2.9).
- Giả định: trình duyệt Chromium (Windows 11) hỗ trợ `webkitdirectory`; `bodySizeLimit` đã 25mb (`next.config.ts`), tổng dữ liệu < 1 MB.
- Hỏng đầu tiên khi: người dùng tải file lẻ không qua thư mục → không có gợi ý công trình → mapping bắt buộc chọn tay, có cảnh báo; không hỏng dữ liệu.

### 2.6 Adapter file tổng
- Cơ chế: viết lại `cong-no-vat-tu.adapter.ts` (giữ tên để test tích hợp và `cong-no-nhan-cong` dùng chung parser): cột D/E trống → lấy vị trí "Chủ Thể"+1/+2; năm ngoài [2000, 2100] mà ngày/tháng hợp lệ → sửa thành 2026 và đưa vào bảng cảnh báo "đã sửa năm" (3 dòng); giữ `projectId` và tên vật tư riêng, `itemId` chỉ khi có Item trùng tên chuẩn hóa (không tự tạo 131 vật tư rác); khóa ánh xạ công trình gồm Chủ thể khi một tên xuất hiện với nhiều Chủ thể ("Cống hộp - Tiên lãng [Lưu Minh Xuân]" → "Tiên Lãng (Việt Úc)", "[Lê Văn Huyên]" → "Tiên Lãng (SH)"); dòng > mốc 26/10 **bị bỏ qua và liệt kê** (11 dòng), riêng "Trả Nợ" sau mốc liệt kê để nhập tay; `asOf` số dư = 31/12/2025; tạo marker chuyển đổi; idempotency = `singleCommit` + hoàn tác, không cần khóa theo dòng.
- Giả định: mọi dòng Nhập Liệu đều có công trình (packet §4: 922 dòng đều gán dự án).
- Hỏng đầu tiên khi: dòng không công trình → lỗi chặn kèm số dòng; người dùng sửa Excel rồi tải lại.

### 2.7 UI nhập theo công trình
- Cơ chế: trang `/vat-tu-ncc/cong-trinh/[projectId]` liệt kê NCC có hoạt động trong công trình, số dư hiện tại (từ `queryDetailReport` lọc `projectIds`), marker gần nhất, link sang 5 tab. Layout `[supplierId]` thêm **thanh chọn công trình** và giữ `?project=` trên mọi tab; `chot-ky`, `doi-chieu`, `kiem-tra-khop` bắt buộc có công trình; `ngay`/`thang` không có tham số thì xem tất cả công trình (chỉ đọc) và form tạo phiếu bắt buộc chọn công trình. `delivery-grid.tsx:160` bọc try/catch + `toast.error`. `du-an/[id]/cong-no` đọc sổ cái vật tư theo công trình. Index `(projectId, date)` cho phiếu và `(ledgerType, projectId, date)` cho sổ cái.
- Giả định: không tạo bộ route lồng `[supplierId]/[projectId]/…` để tránh nhân đôi 7 thư mục; tham số URL đủ.
- Hỏng đầu tiên khi: kế toán quen vào theo NCC và quên chọn công trình ở `chot-ky` → trang hiện bộ chọn công trình thay vì lỗi.

### 2.8 Trang tổng hợp theo công trình
- Cơ chế: `/cong-no-vt/tong-hop-cong-trinh` chạy `queryDetailReport` một lần rồi xoay thuần TypeScript (`project-summary-pivot.ts`): NCC→công trình hoặc công trình→NCC, lọc Chủ thể, preset của `report-period.ts`. Preset có cận dưới: Đầu kỳ / PS tăng / PS giảm / Cuối kỳ (TT, HĐ). Preset Toàn bộ: LH lũy kế = phat_sinh, Đã trả = da_tra, Còn nợ = opening + PS − trả (opening của cặp duyệt = 0). Xuất Excel bằng template mới qua `app/api/export/excel/route.ts`. Ma trận cũ giữ nguyên.
- Giả định: `queryDetailReport` không cần sửa; đã đọc tại `balance-report-service.ts:108-175`, ob không lọc theo ngày nên lũy kế đúng.
- Hỏng đầu tiên khi: ai đó xem năm 2025 → toàn bộ lịch sử hiện như phát sinh 2025 (đánh đổi đã chấp nhận).

### 2.9 Vận hành go-live
- Cơ chế: sao lưu → migrate → dọn pilot theo danh sách đã duyệt (SQL trong runbook, chạy một lần dưới sự chứng kiến của người dùng; đây là xóa, không phải nạp dữ liệu) → nhập 3 bước qua `/admin/import` → trang `kiem-tra-vat-tu` → ký marker → đóng băng Excel → nhập tay phiếu/chuyển khoản từ 01/11 tới ngày chuyển đổi.
- Giả định: Docker Desktop bật được và DB test có `fsync off` để chạy integration trước go-live.
- Hỏng đầu tiên khi: Nam Hương 2 kỳ đã ký của pilot chưa gỡ → migration vẫn chạy (cột nullable) nhưng khóa kỳ cũ theo NCC không còn áp dụng; dọn pilot trước khi import là bắt buộc.

## 3. Các giai đoạn

Thứ tự phụ thuộc: P1 ‖ P3 ‖ P7 chạy song song; P2 sau P1; P4 sau P3; P5 và P6 sau P4 (mã) và dùng chung `ensureCutoverMarker`; P8 sau tất cả.

### P1 — Phạm vi cặp NCC × công trình (backend) — 16h
Mục tiêu: mọi khóa, biên kỳ, ký, snapshot, chốt kỳ, đồng bộ đợt thanh toán chạy theo cặp.
Files:
- `prisma/schema.prisma` — sửa: `SupplierReconciliation.projectId Int?` + index `(supplierId, projectId, periodFrom)`; `SupplierDeliveryDaily` thêm `@@index([projectId, date])`; `LedgerTransaction` thêm `@@index([ledgerType, projectId, date])`.
- `prisma/migrations/<ts>_reconciliation_per_project/migration.sql` — tạo: thêm cột, drop `supplier_recon_period_unique`, tạo unique một phần `(supplierId, projectId, periodFrom, periodTo) WHERE "deletedAt" IS NULL`, 2 index.
- `lib/vat-tu-ncc/period-lock.ts` — sửa: `lockScopes`, `collectScopes`, `assertPeriodOpen(scope, date, client)`, `findSignedPeriodCovering(scope…)`, `loadPeriodBoundsContext(scope…)`, `suggestRangeForScope`; xóa `lockSuppliers`.
- `lib/vat-tu-ncc/period-close-service.ts` — sửa: `previewPeriodClose(scope, range)`, `commitPeriodClose(scope, range, prices)`; lọc phiếu theo cả hai; marker tạo với `projectId`.
- `lib/vat-tu-ncc/reconciliation-service.ts`, `reconciliation-derive-service.ts`, `supplier-balance.ts`, `period-recon-check-service.ts`, `schemas.ts` — sửa: thêm `projectId` bắt buộc, lọc sổ cái theo cặp, `unsign` chỉ xét kỳ sau của cùng cặp, `ReconPaymentRow/ReconTaxRow` có `projectId`.
- `lib/vat-tu-ncc/delivery-service.ts` — sửa: khóa theo cặp; `updateDelivery` đổi công trình thì khóa và kiểm cả cặp cũ lẫn mới; `listDeliveries` nhận `projectId`.
- `lib/ledger/ledger-service.ts` — sửa: `lockParties` → scopes; `assertMaterialPeriodOpen(type, partyId, projectId, date)`; sổ vật tư loại bị khóa kỳ mà thiếu `projectId` → ném lỗi; `assertSupplierOpeningEditable(partyId, projectId)`.
- `lib/cong-no-vt/material-ledger-service.ts`, `lib/cong-no-vt/schemas.ts` — sửa: `projectId` bắt buộc cho sổ vật tư; gom scopes từ (partyId, projectId).
- `lib/payment/payment-ledger-sync.ts`, `lib/payment/payment-service.ts` — sửa: khóa theo cặp; `vat_tu` bắt buộc công trình.
Bước: (1) schema + migration; (2) period-lock + ledger-service; (3) 5 service vat-tu-ncc; (4) payment; (5) chạy `npx tsc --noEmit` để bắt hết chỗ gọi cũ; (6) test.
Tests: `lib/vat-tu-ncc/__tests__/period-lock-scopes.test.ts` (thứ tự khóa (3,1) < (3,2) < (7,1), chuỗi khóa `vat-tu-ncc:3:1`); `test/integration/vat-tu-ncc-chot-ky-linh-hoat.integration.test.ts` cập nhật + ca mới "ký NCC A × X ngày 10/05 không chặn phiếu NCC A × Y ngày 10/05, nhưng chặn phiếu A × X cùng ngày"; `test/integration/payment-service.integration.test.ts` thêm "đóng đợt có dòng vat_tu thiếu công trình bị từ chối"; test `ledger-service` số dư ban đầu khóa theo cặp.
Sở hữu file: toàn bộ `lib/vat-tu-ncc/*`, `lib/ledger/ledger-service.ts`, `lib/payment/*`, `lib/cong-no-vt/{material-ledger-service,schemas}.ts`, `prisma/*`.

### P2 — UI theo công trình — 14h (sau P1)
Files:
- `app/(app)/vat-tu-ncc/page.tsx` — sửa: khối "Theo công trình" (thẻ công trình có hoạt động) phía trên danh sách NCC.
- `app/(app)/vat-tu-ncc/cong-trinh/[projectId]/page.tsx` — tạo: bảng NCC trong công trình (số dư TT/HĐ, marker gần nhất, trạng thái ký, link).
- `lib/vat-tu-ncc/project-overview-service.ts` — tạo: `listProjectsWithMaterialActivity`, `listSuppliersInProject`.
- `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx` — sửa: thanh chọn công trình, giữ `?project=` trên tab.
- `app/(app)/vat-tu-ncc/[supplierId]/{ngay,thang,chot-ky,doi-chieu,doi-chieu/[reconciliationId],thanh-toan,kiem-tra-khop}/page.tsx` — sửa: đọc `project`; 3 trang bắt buộc hiện bộ chọn khi thiếu.
- `components/vat-tu-ncc/delivery-grid.tsx` — sửa: try/catch + toast ở create/edit/delete; `projectId` mặc định từ URL.
- `components/vat-tu-ncc/delivery-form.tsx`, `reconciliation-form.tsx`, component chốt kỳ hiện có — sửa: công trình bắt buộc.
- `app/(app)/du-an/[id]/cong-no/page.tsx`, `cong-no-client.tsx` — sửa: đọc `queryDetailReport({ledgerType:"material", projectIds:[id]})` nhóm theo NCC; giữ bộ lọc NCC.
Tests: unit `project-overview-service` (mock prisma); `test/unit/module-release-entrypoints.test.ts` vẫn xanh; Playwright smoke "vào công trình → NCC → tab Chốt kỳ có công trình sẵn".
Sở hữu file: `app/(app)/vat-tu-ncc/**`, `components/vat-tu-ncc/*`, `app/(app)/du-an/[id]/cong-no/*`.

### P3 — Nâng cấp Import engine và UI duyệt — 18h (độc lập)
Files:
- `prisma/schema.prisma` + migration `<ts>_import_run_review` — sửa/tạo: `ImportRun` thêm `fileData Bytes?`, `sourcePath String?`, `batchId String?`, `decisions Json?`, `review Json?`.
- `lib/import/adapters/adapter-types.ts` — sửa: `parse(buffer, ctx: {fileName, sourcePath?})`; `review?(data, mapping, db)`; `apply(data, mapping, tx, runId, decisions)`; `rollback?(run, tx)`; `rollbackGroup?`, `singleCommit?`, `accept?: string[]`.
- `lib/import/review-types.ts` — tạo: `ReviewResult { sections: {key,title,severity,columns,rows}[], decisions: {key,label,options,default}[], blocking: string[] }`.
- `lib/import/import-engine.ts` — sửa: lưu `fileData`; `reviewImport(runId, mapping)`; `commitImport(runId)` đọc buffer/mapping/decisions từ run, guard `singleCommit`, lưu `review` lúc commit; `rollbackImportRun` kiểm LIFO theo `rollbackGroup` và gọi hook.
- `app/(app)/admin/import/import-upload-form.tsx` — sửa: `.xlsx,.csv`, nhiều file, nút "Chọn thư mục", gửi `paths[]`.
- `app/(app)/admin/import/import-actions.ts` — sửa: `startPreview` tạo nhiều run cùng `batchId`; thêm `saveMappingAndReview`, `saveDecisions`, `doCommit(runId)`.
- `app/(app)/admin/import/[runId]/page.tsx` — sửa: 4 khối; `mapping-panel.tsx`, `review-panel.tsx` — tạo (client, dùng `components/sortable-table`); `commit-panel.tsx` — sửa: bỏ tải lại file.
- `app/(app)/admin/import/page.tsx` — sửa: nhóm theo batch, cột trạng thái "cần ánh xạ / sẵn sàng ghi / đã ghi", hướng dẫn thứ tự 3 adapter.
- `lib/import/conflict-resolver.ts` — sửa: thêm `resolveProject`, trả thêm `createNew` sentinel.
Tests: `lib/import/__tests__/import-engine-guards.test.ts` (singleCommit, LIFO); `test/integration/import-engine.integration.test.ts` cập nhật chữ ký commit, kiểm `review` lưu lại, hook rollback được gọi; `lib/import/adapters/__tests__/adapters.test.ts` cập nhật hợp đồng `parse(buffer, ctx)`.
Sở hữu file: `lib/import/**`, `app/(app)/admin/import/**`.

### P4 — Adapter file tổng (viết lại) — 12h (sau P3)
Files: `lib/import/adapters/cong-no-vat-tu.parse.ts` (sửa: cột trống, giữ project/item riêng, `normalizeLedgerYear`), `cong-no-vat-tu.adapter.ts` (viết lại theo 2.6), `cong-no-vat-tu.cutover.ts` (tạo: `ensureCutoverMarker`), `cong-no-nhan-cong.adapter.ts` (sửa tối thiểu cho chữ ký mới).
Bước: parse → conflicts (NCC, Chủ thể, công trình[+Chủ thể]) → validate (thiếu công trình, ngày hỏng) → review (bảng theo cặp: số dòng LH/Trả, Σ TT/HĐ; 11 dòng sau mốc; dòng sửa năm; Trả Nợ sau mốc) → apply (số dư asOf 31/12/2025; tx ≤ mốc; marker).
Tests: `lib/import/adapters/__tests__/cong-no-vat-tu.test.ts`: header D/E trống vẫn đọc NCC/dự án; `26/10/0206` → 26/10/2026 có cờ; "Cống hộp - Tiên lãng" với 2 Chủ thể sinh 2 khóa ánh xạ; dòng 27–31/10 bị bỏ qua và liệt kê đủ 11; integration: sau commit `queryDetailReport` năm 2026 Đầu kỳ TT của cặp = Số Dư Ban Đầu; marker 01/01→26/10 tồn tại cho cặp có tx.

### P5 — Adapter CSV lũy kế + duyệt từng cặp — 10h (sau P3; chạy sau P4)
Files: `lib/import/adapters/cong-no-luy-ke.parse.ts` (tạo: đọc CSV bằng `XLSX.read`, dừng ở "Tổng cộng", bỏ "Cộng", kéo tên NCC xuống các dòng hợp đồng, `#REF!` → cờ), `cong-no-luy-ke.adapter.ts` (tạo theo 2.4), `adapter-registry.ts` (sửa).
Tests: unit parse khối Nam Hương (6 dòng hợp đồng → 5 công trình, bỏ dòng "Cộng"); quyết định mặc định Duyệt khi chênh 0; integration: duyệt một cặp → Toàn bộ Còn nợ = Năm 2026 Cuối kỳ và Đầu kỳ 2026 không đổi; hoàn tác khôi phục số dư ban đầu nguyên giá trị.

### P6 — Adapter file theo công trình (24 file) — 20h (sau P3; chạy sau P4)
Files:
- `lib/import/adapters/theo-doi-vat-tu.parse.ts` — tạo: tách khối theo tiêu đề "từ ngày X đến hết ngày Y" (biên lỗi → `prev.to + 1 → ngày 26 kế`, cờ cảnh báo); tìm cột STT/Ngày/KL/ĐVT/Đơn giá/Thành tiền; đọc "Vật tư ngày" và "Đối chiếu công nợ*", bỏ "Vật tư tháng*" và "SGV".
- `lib/import/adapters/theo-doi-vat-tu.dates.ts` — tạo: `resolveDirtyDate(cell, range, neighbors)` theo mục 5.
- `lib/import/adapters/theo-doi-vat-tu.match.ts` — tạo: thuật toán ghép 2.2 (thuần, test được).
- `lib/import/adapters/theo-doi-vat-tu.adapter.ts` — tạo: conflicts NCC (tên file), công trình (thư mục/"Công trình:"), vật tư ("Tên vật tư:"); review; apply (chèn phiếu, link/sự kiện 0 đồng, marker); rollback (xóa qty/unitPriceSnapshot/itemId ở dòng đã link; `deliveryId` tự về NULL nhờ `onDelete: SetNull`; xóa sự kiện 0 đồng theo `importRunId`).
- `lib/import/adapters/excel-utils.ts` — sửa: tách `parseDmyText`; giữ `parseReconciliationSheet` cho adapter cũ.
Tests: `theo-doi-vat-tu.dates.test.ts`: ô Date `04/11/2026` trong khối 01/04→26/04 → 11/04/2026; chữ `27/10/2026` giữ nguyên; `19/4/2025` trong khối 04/2026 → 19/04/2026 cờ "sửa năm"; ô ngoài biên không sửa được → cảnh báo, không chặn. `theo-doi-vat-tu.match.test.ts`: 8.000 viên × 1.900 ↔ dòng 15.200.000 (link đầy đủ); 3 phiếu 4/4/8 m³ × 450.000 ↔ 3 dòng 1.800.000/1.800.000/3.600.000; 2 phiếu tổng 9.090.000 ↔ 1 dòng → sự kiện 0 đồng; không khớp → 0 đồng. `theo-doi-vat-tu.parse.test.ts`: phiếu 27/10 lặp ở 2 khối → 1 phiếu; 2 phiếu giống nhau trong cùng khối → 2 phiếu; file "hết 30.4.26" rồi "đến 26.5.26" → run 2 bỏ qua phần trùng. Integration: sau P4 commit, commit file DCX Quang Minh → 3 phiếu 27–31/10 không có sự kiện; các phiếu trước đó có `deliveryId`; marker tồn tại; `signReconciliation(marker)` thành công; rollback gỡ link.

### P7 — Trang tổng hợp theo công trình + Excel — 12h (độc lập)
Files: `lib/cong-no-vt/project-summary-pivot.ts` (tạo, thuần), `lib/cong-no-vt/project-summary-service.ts` (tạo), `app/(app)/cong-no-vt/tong-hop-cong-trinh/{page.tsx, summary-filter.tsx, summary-tree.tsx}` (tạo), `app/(app)/cong-no-vt/layout.tsx` (sửa: link), `lib/export/templates/cong-no-tong-hop-cong-trinh.ts` (tạo), `app/api/export/excel/route.ts` (sửa: case mới).
Tests: unit pivot (Đầu + Tăng − Giảm = Cuối mọi nút; hai chiều xoay cùng tổng); `test/integration/cong-no-tong-hop-cong-trinh.integration.test.ts`: seed số dư 0 + 2 dòng lũy kế 31/12/2025 + tx 2026 cho 1 NCC × 2 công trình → Còn nợ(Toàn bộ, T) = Cuối kỳ(Năm 2026, T) từng cặp; lọc Chủ thể.

### P8 — Trang kiểm tra sau import, tài liệu, go-live — 12h (sau tất cả)
Files: `lib/import/verification-service.ts` (tạo), `app/(app)/admin/import/kiem-tra-vat-tu/page.tsx` (tạo: bảng A số dư 26/10 ERP vs "Tổng nợ" Excel lấy từ `review` của run file theo công trình; bảng B Đầu kỳ 2026 vs Số Dư Ban Đầu; bảng C Toàn bộ vs CSV cặp duyệt; nút "Ký marker lịch sử cho cặp khớp"), `lib/vat-tu-ncc/reconciliation-derive-service.ts` (sửa: `signReconciliations(ids)` gọi lặp hàm ký), `docs/system-architecture.md`, `docs/project-changelog.md`, `lib/import/README.md` (sửa), `plans/261105-0848-…/reports/go-live-runbook.md` (tạo).
Tests: unit so lệch; chạy thủ công theo runbook; `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build`.

## 4. Schema và migration

| # | Thay đổi | Ghi chú |
|---|---|---|
| M1 | `supplier_reconciliations.projectId INT NULL` + FK Project; drop `supplier_recon_period_unique`; unique một phần `(supplierId, projectId, periodFrom, periodTo) WHERE deletedAt IS NULL`; index `(supplierId, projectId, periodFrom)` | Hàng pilot `projectId NULL` được dọn ở go-live; migration nối tiếp `SET NOT NULL` sau đó |
| M2 | `supplier_delivery_daily` index `(projectId, date)`; `ledger_transactions` index `(ledgerType, projectId, date)` | Trang công trình và báo cáo lọc công trình |
| M3 | `import_runs` thêm `fileData BYTEA NULL`, `sourcePath TEXT`, `batchId TEXT`, `decisions JSONB`, `review JSONB` | ≤ 1 MB dữ liệu; cho phép commit không tải lại và trang kiểm tra |

Không đổi `ledger_opening_balances`, không thêm bảng mới.

## 5. Thiết kế import cho D6/D7

**Adapter và thứ tự:** (1) `cong-no-vat-tu` file tổng → (2) `cong-no-luy-ke` CSV → (3) `theo-doi-vat-tu` 24 file. Adapter 2 và 3 kiểm tra trong `review` rằng đã có run (1) committed, nếu chưa thì chặn với thông báo. Hoàn tác theo thứ tự ngược trong nhóm.

**Ánh xạ tên:** bảng conflict chung (NCC, Chủ thể, công trình, vật tư) với ứng viên fuzzy từ `conflict-resolver`, lựa chọn "Tạo mới" hoặc "Bỏ qua"; `mapping` lưu trên run như hiện nay. Tiên Lãng: file tổng sinh 2 khóa theo Chủ thể (2.6); CSV có tên "Tiên Lãng (Việt Úc)" / "(SH)" ánh xạ thẳng; file theo công trình không có Tiên Lãng. "CDC" trong Số Dư Ban Đầu là một công trình riêng; CSV có "Tân lộc CDC" và "ĐVP -CDC" → người dùng ánh xạ cả hai về "CDC" hoặc tạo 2 công trình (mặc định gợi ý gộp về "CDC" vì Số Dư Ban Đầu chỉ có một). Bí danh NCC ("Cty (Anh Công)" → Khánh Đức, "Cty Hiệu Trần (Anh Hiếu)" → Thương Hiệu Trần) chọn trong bảng; mapping của run (2) được gợi ý lại từ run (1) cùng tên để đỡ chọn lại.

**Ngày bẩn theo biên khối (adapter 3):** ô chữ `dd/mm/yyyy` → đọc nguyên văn; ô Date → hai ứng viên (nguyên và đảo ngày/tháng khi ngày ≤ 12), chọn ứng viên nằm trong [X, Y] của khối; nếu năm lệch mà đổi năm theo khối thì vào biên → sửa năm, cờ "sửa năm"; nếu vẫn không vào biên → giữ nguyên văn, cờ "ngoài biên khối" (cảnh báo, không chặn, vì biên khối tay sửa như 28/04→26/05). Sheet "Vật tư ngày" không có biên: ghép với dòng đối chiếu cùng (vật tư, KL) có ngày tương thích; nếu không có thì chọn ứng viên nằm giữa dòng trước và dòng sau đã xác định.

**Chống trùng:** trong file: khóa `(ngày, vật tư, KL, giá?)`; số lần giữ = số lần xuất hiện lớn nhất trong **một** khối/sheet (lặp giữa khối là trùng, lặp trong khối là hai chuyến). Giữa file: trước khi chèn, bỏ qua phiếu đã có cùng `(NCC, công trình, ngày, vật tư, KL)` (báo "đã có từ run #N"); phiếu giống hệt ở công trình khác được liệt kê "có thể trùng với #id (công trình X)" với quyết định mặc định Bỏ qua (xử lý bản gộp Lộc Tài Trại Chuối + DCX).

**Chống tính trùng nợ:** mục 2.2; đơn giá/thành tiền lấy từ khối đối chiếu; phiếu chỉ có trong "Vật tư ngày" nhập không giá.

**Xem trước của từng adapter:**
- (1): bảng theo cặp (NCC, công trình, Chủ thể, số dòng LH/Trả, Σ TT, Σ HĐ, số dư ban đầu); 11 dòng sau 26/10 bỏ qua; dòng sửa năm; lỗi chặn (thiếu công trình/NCC/ngày).
- (2): bảng từng cặp CSV vs Số Dư Ban Đầu (G, I, M, N, LH2026, Trả2026, số dư ngụ ý TT/HĐ, số dư đã nhập, chênh, Chủ thể, quyết định); cặp CSV không khớp ERP; cặp ERP không có trong CSV; dòng `#REF!`.
- (3): thông tin file (NCC, công trình, vật tư đã ánh xạ); danh sách khối và biên (kèm cờ biên lỗi); bảng phiếu (ngày gốc → ngày dùng, cờ, KL, ĐVT, giá, thành tiền, nguồn sheet, kết quả ghép: link / theo ngày / gộp / 0 đồng, dòng sổ cái #id); phiếu sau 26/10 (sẽ chờ chốt kỳ); phiếu có thể trùng; dòng Nhập Liệu của cặp chưa có phiếu (chỉ thông tin); "Tổng nợ" của khối ≤ 26/10 gần nhất để trang kiểm tra dùng.

**Idempotency / hoàn tác:** hash file chặn ghi lại cùng file; (1) và (2) `singleCommit`; (3) khóa phiếu; hoàn tác LIFO trong nhóm; hook (2) khôi phục số dư ban đầu; hook (3) gỡ link; phần còn lại xóa theo `importRunId` như engine hiện có (`import-engine.ts:276-345`).

**Báo cáo kiểm tra sau commit** (`/admin/import/kiem-tra-vat-tu`): A — từng cặp: nợ ERP tại 26/10 vs "Tổng nợ" Excel (ví dụ Bê tông HP × Trại Chuối 509.563.111; Quang Minh × DCX 152.160.000; Gạch NH × MN 23.370.400; Nam Hương nhóm Trại Chuối 294.445.120 hiện tổng các công trình thành viên); B — Đầu kỳ 2026 vs Số Dư Ban Đầu; C — Toàn bộ vs CSV cho cặp duyệt; D — số phiếu theo cặp × tháng vs số dòng file. Dòng lệch tô đỏ và link về run tương ứng.

**Hướng dẫn thao tác nạp 26 file trên UI:**
1. Danh mục: tạo/kiểm Chủ thể (3), công trình gồm "Tiên Lãng (Việt Úc)" (Lưu Minh Xuân) và "Tiên Lãng (SH)" (Lê Văn Huyên), gán `entityId` cho mọi công trình kể cả đã xong (Quán Toan, CDC, 326 - Lô 34, 149 Hai Bà Trưng, Phí khác).
2. `/admin/import` → adapter "Công nợ vật tư — file tổng" → chọn `Quản Lý Công Nợ Vật Tư.xlsx` → "Tải lên và phân tích" → trang run: ánh xạ 27 NCC, 3 Chủ thể, ~13 khóa công trình (2 khóa Tiên Lãng) → "Lưu ánh xạ và xem trước" → đọc bảng cặp, 11 dòng bỏ qua, 3 dòng sửa năm → "Ghi dữ liệu".
3. Adapter "Công nợ lũy kế (CSV)" → chọn CSV → ánh xạ bí danh → xem trước 86 cặp, 43 mặc định Duyệt, xét từng cặp lệch (đa số Bỏ qua, riêng cặp lệch do bí danh sẽ tự khớp sau khi ánh xạ) → "Ghi dữ liệu".
4. Adapter "Theo dõi vật tư theo công trình" → "Chọn thư mục" `Theo Dõi Vật Tư` → 24 run cùng batch → với từng run: ánh xạ (NCC gợi ý từ tên file, công trình từ thư mục, vật tư tạo mới nếu chưa có) → xem trước (ngày, khối, ghép) → "Ghi". Làm "Quang Minh cát,gạch hết 30.4.26" trước "đến 26.5.26". Với Lộc Tài Trại Chuối, các phiếu "có thể trùng" với DCX để Bỏ qua.
5. `/admin/import/kiem-tra-vat-tu` → bảng A/B/C/D xanh hết → "Ký marker lịch sử cho cặp khớp". Cặp đỏ: hoàn tác run liên quan (LIFO), sửa ánh xạ hoặc Excel, nạp lại.
6. `/vat-tu-ncc/cong-trinh/<Dải cây xanh>` → thấy 11 phiếu 27–31/10 chờ chốt; cuối tháng 11 chốt kỳ 27/10→26/11 trong ERP.

## 6. Runbook go-live (khung)

1. Tắt ghi: thông báo đóng băng Excel từ mốc; chụp `pg_dump` qua `docker exec` (script `.sh` không chạy trên Windows — ghi nhận ở pilot).
2. `prisma migrate deploy` (M1–M3); `pnpm test:integration` trên DB test.
3. Dọn pilot theo danh sách trong `pilot-result.md` (gỡ ký recon 1–2 Nam Hương qua UI admin; xóa recon 1–4, ledger 1–12, phiếu 1–9, báo giá 1–3, số dư 1/3/5) bằng SQL ghi sẵn trong runbook, người dùng duyệt trước khi chạy; xác nhận các bảng vật tư trống.
4. Nạp theo mục 5 (bước 1–5). Lưu ảnh chụp bảng kiểm tra vào `reports/`.
5. Migration nối tiếp `projectId SET NOT NULL` (sau khi không còn hàng NULL).
6. Nhập tay phiếu ngày và chuyển khoản phát sinh 01/11 → ngày go-live qua trang công trình; đối chiếu lại với giấy.
7. Khóa quyền sửa Excel; lưu 26 file gốc vào `reports/source-archive/` (hash ghi trong ImportRun).

## 7. Rủi ro (5) và câu hỏi mở

Rủi ro:
1. Tỷ lệ ghép phiếu ↔ Nhập Liệu thấp hơn kỳ vọng (file không giá như Gia Bảo, Tùng Lâm; Nhập Liệu gộp theo ngày) → nhiều sự kiện 0 đồng; nợ vẫn đúng nhưng bảng đối chiếu lịch sử khó đọc. Giảm nhẹ: cột "kết quả ghép" trong xem trước và bảng D.
2. Đổi khóa sang cặp chạm 8 đường ghi; sót một chỗ là mất tuần tự hóa. Giảm nhẹ: xóa hàm cũ để compile lỗi; test tích hợp "ký X không khóa Y".
3. Ngày bẩn sửa sai mà không có cảnh báo (ngày = tháng, hai ứng viên cùng vào biên). Giảm nhẹ: cờ "mơ hồ" khi cả hai ứng viên hợp lệ; sai ngày thì ghép số tiền thất bại và hiện trong danh sách không khớp.
4. Ký marker lịch sử rồi phát hiện Excel sai → chỉ sửa qua `dieu_chinh` kỳ sau. Giảm nhẹ: ký là bước cuối, sau bảng kiểm tra; admin gỡ ký được.
5. Mệt mỏi thao tác 26 run × (ánh xạ + duyệt): chọn sai một ánh xạ là lệch cặp. Giảm nhẹ: gợi ý từ thư mục/tên file, ghi nhớ mapping giữa các run cùng batch, bảng kiểm tra A/D bắt lệch ngay.

Câu hỏi mở (không suy ra được từ dữ liệu):
1. Có ký (khóa) marker lịch sử 01/01→26/10 ngay tại go-live không, hay để chưa ký vài tuần phòng sửa? Mặc định: ký sau khi bảng kiểm tra xanh.
2. "Tân lộc CDC" và "ĐVP -CDC" trong CSV gộp về công trình "CDC" của Số Dư Ban Đầu hay tách hai công trình? Mặc định: gộp (một dòng số dư).
3. Trước 26/10 có khoản "Trả Nợ" nào chỉ ghi trên giấy chưa vào Nhập Liệu, và từ 27/10 tới nay có chuyển khoản nào chưa ghi đâu cả? Mặc định: không; danh sách "Trả Nợ sau mốc" của adapter (1) sẽ cho thấy phần trong file.

## 8. Tổng công

P1 16 + P2 14 + P3 18 + P4 12 + P5 10 + P6 20 + P7 12 + P8 12 = **114 giờ** (khoảng 3 tuần một người; rút còn ~2 tuần khi chạy song song P1 ‖ P3 ‖ P7 rồi P2 ‖ P4→P5 ‖ P6).
