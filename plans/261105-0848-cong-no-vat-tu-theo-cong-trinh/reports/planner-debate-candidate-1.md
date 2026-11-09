# Ứng viên #1 — Thay đổi nhỏ nhất mà vẫn đủ phạm vi

- Lăng kính: tái dùng tối đa module hiện có, ít khái niệm mới nhất, KISS/DRY, không cắt phạm vi người dùng yêu cầu.
- Đầu vào: `reports/debate-evidence-packet.md`, `plans/reports/brainstorm-261105-1504-…md`, mã nguồn đã đọc lại (trích `file:dòng`), dữ liệu `Quản Lý Công Nợ/` đã kiểm tra bằng openpyxl.
- Ngày lập: 05/11/2026.

## 0. Tóm tắt kiến trúc

1. Phạm vi kỳ đổi sang cặp (NCC × công trình) bằng **một cột `projectId` nullable** trên `supplier_reconciliations`. Mọi hàm khóa kỳ, biên kỳ, khóa số dư, chốt, ký nhận thêm `projectId`. Marker có `projectId = null` là marker cũ, vẫn phủ cả NCC, nên dữ liệu cũ không vỡ.
2. **Khóa advisory giữ theo NCC.** Đây là mutex chứ không phải phạm vi nghiệp vụ; khóa rộng hơn vẫn đúng và không phải sửa thứ tự khóa ở 7 file.
3. Lũy kế dùng 2 dòng sổ cái ngày 31/12/2025 cho mỗi cặp được duyệt (D-default). Không sửa câu SQL báo cáo nào.
4. Chống tính trùng dùng hai cơ chế đã có:
   - Phiếu lịch sử ≤ mốc khớp dòng Nhập Liệu thì được gắn `deliveryId` (một-một).
   - Mỗi cặp có **một marker "Lịch sử Excel" đã ký**, phủ 01/01/2026 → mốc. Không kỳ chốt nào chạm được phiếu lịch sử; theo quy tắc liền kề, kỳ ERP đầu tiên tự là 27/10 → 26/11.
5. Import: **mở rộng adapter `cong-no-vat-tu`** để nhận cả thư mục (file tổng + CSV + 24 file công trình) trong **một ImportRun**: một lần ghi, một lần hoàn tác, không phải xếp thứ tự giữa các adapter. Engine thêm bốn thứ: nhận nhiều tệp, bước duyệt (ánh xạ, duyệt từng cặp, khớp phiếu) trước khi ghi, timeout giao dịch dài, và cột `report`.
6. Nhập theo công trình: thêm trang `/vat-tu-ncc/cong-trinh/[projectId]`. Các trang NCC hiện có nhận `?projectId=`, không nhân bản cây route.
7. Tổng hợp: trang `/cong-no-vt/tong-hop-cong-trinh` gồm `queryDetailReport`, một module xoay thuần TS và xuất Excel. Ma trận `tong-hop` giữ nguyên.

## 1. Phát hiện khi kiểm chứng (khác hoặc bổ sung packet)

Mã nguồn:
- **Preview chưa có UI ánh xạ.** `CommitPanel` luôn gửi `fd.set("mapping", "{}")` (`app/(app)/admin/import/[runId]/commit-panel.tsx:26`). Preview chỉ lưu số dòng và lỗi, không lưu xung đột (`lib/import/import-engine.ts:61-73`). Packet ghi "user resolves a name→id mapping", điều này chưa đúng với mã hiện tại.
- **Adapter Nhập Liệu đang bỏ cả 922 dòng.** Cột NCC trống tiêu đề nên `col("Nhà Cung Cấp","NCC")` trả −1, dẫn tới `r[-1]` rỗng và dòng bị bỏ qua (`lib/import/adapters/cong-no-vat-tu.parse.ts:57,68-69`). `parseTxSheet` còn được dùng chung với adapter nhân công (`cong-no-nhan-cong.adapter.ts:70-71`).
- `parseExcelDate` nhận năm `0206` là năm 206 hợp lệ (`excel-utils.ts:26-34`). Dòng `'26/10/0206'` (Lộc Tài × Dải cây xanh, 2.800.000) là ô dạng chữ.
- `commitImport` chạy `$transaction` với timeout mặc định 5 giây (`import-engine.ts:124-127`). Import cutover sẽ vượt mức này.
- **`du-an/[id]/cong-no` đọc `project_transactions`**, không phải snapshot (`lib/du-an/supplier-debt-service.ts:53-98`).
- **Không có UI gán `Project.entityId`.** Đã grep `master-data` và `du-an`: không có trường này (`lib/master-data/schemas.ts:22`, `projects-client.tsx:16-70`).
- `computeReconciliation` cộng toàn NCC qua `supplierBalanceAsOf(supplierId, …)` (`reconciliation-derive-service.ts:112`, `supplier-balance.ts:21-33`).

Dữ liệu:
- **Sheet "Đối chiếu" mới là nguồn phiếu đầy đủ nhất.** "Vật tư ngày" có 0 dòng ở 6/24 file (Tùng Lâm, Gia Bảo, Phương Minh DCX, Hùng Chi, Lộc Tài MN2, Thép Hiệu Trần).
- Nhãn kỳ của khối không đáng tin:
  - "25/06→26/06" lặp hai lần (Xi măng Anh Thư MN).
  - Khối Lộc Tài MN2 ghi "27/09→26/10" nhưng chứa phiếu 27/10 0,5 ca × 2.800.000, và "Tổng nợ" 261.780.000 đã gồm phiếu này.
  - Nhãn mang sang cũ "Hết 26/5/2026" được chép lại ở các khối sau.
  - Biên kỳ chồng nhau (26/05 nằm ở hai khối).
- Khối gộp có tiểu mục: "Cộng Trại Chuối" rồi "Cộng dải cây xanh" (Lộc Tài, file Trại Chuối, khối 26/05→26/06).
- Có dòng "GTGT" giống phiếu (qty 1, đơn giá 18.656.000) và dòng mẫu trống có thành tiền 0.
- Một số dòng ghi tên vật tư thật ở cột ghi chú ("Cọc khoan nhồi D400mm", "Máy 75W").
- Nhập Liệu là **một dòng cho mỗi phiếu**, số tiền TT = KL × đơn giá. Ví dụ Lộc Tài × Trại Chuối: 30/07 1.400.000 = 0,5 × 2.800.000; ngày 12/08 có hai dòng 1.400.000 và 1.750.000, khớp hai phiếu "08/12/2026" (ngày bị đảo). Ngày trong Nhập Liệu là ô ngày thật.
- CSV: "Đã thanh toán" là cột I (tiêu đề trống). H chỉ có ở dòng "Cộng". J = G − I ở mọi dòng. Bảng chính kết thúc ở dòng 90 ("Tổng cộng").

## 2. Trả lời 9 vấn đề của packet §5

| # | Cơ chế chọn | Giả định chịu lực | Hỏng đầu tiên khi |
|---|---|---|---|
| 1 Phạm vi (NCC × CT) | `projectId Int?` trên marker. `findSignedPeriodCovering`, `assertPeriodOpen`, `loadPeriodBoundsContext`, `assertPeriodBounds`, `suggestRangeForSupplier` nhận `(supplierId, projectId)` và lọc `projectId = P OR projectId IS NULL`. Khóa số dư, chốt, ký, gỡ ký, snapshot, đồng bộ đợt thanh toán và ghi sổ tay đều truyền `projectId`. Phiếu, dòng sổ vật tư và dòng đợt `vat_tu` mới bắt buộc có công trình (zod). Khóa advisory giữ theo NCC. | Mỗi công trình có đúng một Chủ thể; mọi ghi mới đều mang công trình. | NCC đòi ký một bản gộp nhiều công trình (trái D2); hoặc sửa dòng sổ cũ không có công trình (dòng đó không thuộc snapshot cặp nào nên không bị khóa, đúng chủ đích). |
| 2 Tính trùng | Nợ ≤ mốc **chỉ** lấy từ Nhập Liệu. Phiếu ≤ mốc vẫn import (D6). Phiếu khớp được thì gắn vào dòng Nhập Liệu (`deliveryId`, `qty`, `unitPriceSnapshot`, `itemId`). Không phiếu lịch sử nào sinh event, vì nó nằm trong marker lịch sử đã ký. Dòng Nhập Liệu > mốc: khớp phiếu thì **bỏ** (phiếu là nguồn, chốt trong ERP); không khớp thì ghi sổ trong kỳ mở và cảnh báo. Phiếu > mốc để mở, giữ giá đối chiếu. | Nhập Liệu là một dòng mỗi phiếu, TT = KL × giá (đã kiểm ở Lộc Tài). | Dòng Nhập Liệu gộp nhiều phiếu: phiếu chỉ không được gắn, không gây trùng. Phiếu sau mốc mà dòng Nhập Liệu ghi sai ngày quá ±3 ngày: phát sinh trùng thật, nhưng báo cáo mốc lộ ra phần chênh còn lại khác 0. |
| 3 Kỳ đối chiếu lịch sử | **Một** marker đã ký cho mỗi cặp, phủ 01/01/2026 → mốc. Snapshot đông cứng được tính từ sổ đã import, bằng đúng hàm của nút ký. `importRunId` gắn vào marker; **không cho gỡ ký** marker do import tạo. Không nhập từng khối tháng: nhãn sai, biên chồng sẽ vi phạm partial unique, và khối gộp không tách thành snapshot từng công trình một cách trung thực được. | Không ai cần mở lại một tháng thời Excel trong ERP; sửa sau mốc bằng `dieu_chinh`, hoặc hoàn tác rồi import lại trước go-live. | Người dùng muốn in lại từng bản đối chiếu tháng cũ từ ERP. Các bản này vẫn nằm trong Excel đã đóng băng. |
| 4 Lũy kế + duyệt cặp | `adapter.review` tính cho từng cặp: SDBĐ, CSV (G, I, M, N), phát sinh Nhập Liệu 2026, net trước 2026 và chênh lệch TT/HĐ. Mỗi dòng có quyết định lưu ở `mapping["pair:<ncc>:<ct>"]` (1 = lũy kế CSV, 0 = số dư ban đầu). Mặc định: khớp ±1đ thì 1, còn lại 0. Cấm chọn 1 khi LH hoặc đã trả trước 2026 âm (CSV chưa cập nhật, ví dụ Dải cây xanh). | CSV liên kết với file tổng, nên cùng tập dòng Nhập Liệu. | CSV chụp ở ngày khác file tổng: phần lớn cặp lệch, phải giữ số dư ròng. Số dư vẫn đúng, chỉ thiếu LH trọn đời. |
| 5 UX import | Chọn cả thư mục `Quản Lý Công Nợ` một lần (`webkitdirectory`), một run. Panel duyệt có các phần: phân loại tệp, ánh xạ, tùy chọn mốc, duyệt cặp, khớp phiếu, cảnh báo ngày, kỳ ERP đầu, dữ liệu đang có trong DB, mốc kiểm tra dự kiến. Có nút "Tính lại", rồi "Ghi dữ liệu", cuối cùng là báo cáo sau ghi. Hoàn tác dùng nút có sẵn. | Trình duyệt cho chọn thư mục (Chrome/Edge); tổng dung lượng khoảng 1MB, dưới `bodySizeLimit` 25mb (`next.config.ts`). | Trình duyệt chặn `webkitdirectory`. Phương án dự phòng là chọn nhiều tệp, mất tên thư mục làm gợi ý công trình. |
| 6 Adapter file tổng | **Sửa, không thay.** Sửa parser (tiêu đề trống, `projectName`/`itemName` tách riêng, năm < 1900, đọc giá trị thô), giữ cách ghép `content` cho adapter nhân công. Adapter thành bộ điều phối thư mục; đường một file vẫn chạy được (`parse(buffer)` = `parseFiles([1 tệp])`). Chạy lại: từ chối khi đã có run `committed` cùng adapter. | — | — |
| 7 Nhập theo công trình | Trang mới `/vat-tu-ncc/cong-trinh/[projectId]` và mục "Theo công trình" ở `/vat-tu-ncc`. Các trang NCC nhận `?projectId=` và có thanh chọn công trình. Thêm index `(projectId, date)`, cột Chủ thể ở master-data công trình. `du-an/[id]/cong-no` đọc sổ cái. Lưới phiếu hiện lỗi khóa kỳ. | Layout không đọc được `searchParams`, nên tab dùng client component `useSearchParams`. | Người dùng mở liên kết NCC cũ không có `projectId`: chốt kỳ và đối chiếu buộc chọn công trình trước. |
| 8 Trang tổng hợp | Gồm `getMaterialDetailReport` (đã có), module thuần `buildProjectPivot`, bảng client, dùng lại `DetailReportFilter`, nút chuyển "Nhóm theo" và mẫu Excel mới. Nhãn cột theo preset: `all` hiện LH lũy kế / Đã trả / Còn nợ; preset khác hiện Đầu kỳ / PS tăng / PS giảm / Cuối kỳ (TT, HĐ). | `queryDetailReport` đã đúng ngữ nghĩa cửa sổ (`balance-report-service.ts:108-172`). | Cần xem riêng năm 2025: toàn bộ lịch sử sẽ hiện như phát sinh, đây là đánh đổi đã chấp nhận ở D-default. |
| 9 Go-live | Sao lưu, liệt kê dữ liệu pilot để duyệt, xóa trong một transaction, chuẩn bị master data, preview, duyệt, ghi, đọc báo cáo, ký xác nhận, đóng băng Excel (§6). | Thời điểm dừng sửa Excel trùng ngày import. | Có phiếu chỉ nằm trên giấy sau ngày đóng băng: phải nhập tay ngay sau import. |

## 3. Các phase (theo thứ tự phụ thuộc)

Sơ đồ: **P1** → song song {**P2**, **P4**, **P5**, **P6**, **P7**} → **P3** (sau P2) và **P8** (sau P2, P5, P6, P7) → **P9** → **P10** (vận hành).
P2 và P3 phát hành cùng một PR, vì P2 đổi chữ ký server action còn P3 sửa nơi gọi trong `app/` và `components/`.

### P1 — Schema và migration (2h)

- Mục tiêu: có cột và index cho phạm vi cặp, index theo công trình và báo cáo import.
- Tệp:
  - `prisma/schema.prisma` (sửa):
    - `SupplierReconciliation.projectId Int?`; thay `@@index([supplierId, periodFrom])` bằng `@@index([supplierId, projectId, periodFrom])`.
    - `SupplierDeliveryDaily @@index([projectId, date])`.
    - `ImportRun.report Json?`.
  - `prisma/migrations/20261106090000_material_debt_pair_scope/migration.sql` (tạo): xem §4.
- Bước: sửa schema, viết SQL tay cho partial unique, chạy `npx prisma migrate dev --create-only`, sửa lại SQL, rồi `npx prisma generate`.
- Test: `npx prisma migrate deploy` trên DB test và `npx tsc --noEmit`. P2 có test xác nhận ràng buộc unique.
- Phụ thuộc: không. Chủ sở hữu tệp: chỉ P1 sửa `schema.prisma`.
- Rollback: chạy SQL ngược (drop cột/index, tạo lại `supplier_recon_period_unique`). Chỉ an toàn khi chưa có hai marker cùng NCC và cùng kỳ ở hai công trình; sau go-live thì sửa tiến, không lùi.

### P2 — Lõi kỳ theo cặp (12h)

- Mục tiêu: chốt, ký, khóa của NCC A tại X không ảnh hưởng A tại Y; mọi đường ghi kiểm theo cặp.
- Tệp (đều là sửa, trừ chỗ ghi "tạo"):

  | Tệp | Thay đổi |
  |---|---|
  | `lib/vat-tu-ncc/period-lock.ts` | Năm hàm nhận `projectId` (`:67-84`, `:87-99`, `:102-126`, `:129-137`, `:143-168`). Marker lọc theo cặp hoặc `IS NULL`. Mốc số dư lấy theo cặp (cộng dòng số dư không công trình của NCC nếu có). `lockSuppliers` giữ nguyên. |
  | `lib/vat-tu-ncc/reconciliation-compute.ts` (tạo, không "use server") | Chuyển `computeReconciliation` và `headerNames` (`reconciliation-derive-service.ts:104-209, 264-277`) sang đây với tham số `(supplierId, projectId, from, to, db)`. Thêm `freezeReconciliationSnapshot(db, reconId)` (logic `:368-384`). Bỏ dòng TT = 0 khỏi danh sách chi tiết; tổng không đổi. |
  | `lib/vat-tu-ncc/reconciliation-derive-service.ts` | Xem, danh sách, ký đều theo `recon.projectId`. Ký dùng `freezeReconciliationSnapshot`. Khi gỡ ký: tìm `laterSigned` trong cùng cặp, và từ chối nếu `importRunId != null`. |
  | `lib/vat-tu-ncc/reconciliation-service.ts` | list/check/create/update/delete nhận `projectId`; kiểm trùng theo cặp (`:67-71`). |
  | `lib/vat-tu-ncc/period-close-service.ts` | `previewPeriodClose(supplierId, projectId, range?)` và `commitPeriodClose(supplierId, projectId, range, prices)`: lọc phiếu theo cặp (`:94-99`, `:253-256`), tạo marker có `projectId` (`:314-322`), revalidate thêm `/vat-tu-ncc/cong-trinh/${projectId}`. |
  | `lib/vat-tu-ncc/supplier-balance.ts` | Thêm tham số `projectId?` cho cả hai vế SQL. |
  | `lib/vat-tu-ncc/delivery-service.ts` | `assertPeriodOpen` theo (công trình cũ, ngày cũ) và (công trình mới, ngày mới) (`:57`, `:93-94`, `:113`, `:148`, `:156`). `listDeliveries` và `listDeliveriesMonthly` có `projectId?`; tháng truy vấn bảng có `GROUP BY`, không đụng view. |
  | `lib/vat-tu-ncc/schemas.ts` | `deliverySchema.projectId` và `reconciliationSchema.projectId` bắt buộc. |
  | `lib/ledger/ledger-service.ts` | `assertMaterialPeriodOpen(type, partyId, projectId, date)` (`:55-64`), truyền ở `create/update/softDelete/upsertFromDelivery` (`:138`, `:191-193`, `:245`, `:276`, `:320`). `assertSupplierOpeningEditable(partyId, projectId)` (`:87-99`): nếu `projectId` null thì giữ hành vi cũ. |
  | `lib/cong-no-vt/material-ledger-service.ts` | `adminPatch` (`:145`) và patch số dư (`:244`) truyền `projectId`. |
  | `lib/cong-no-vt/schemas.ts` | `transactionSchema.projectId` bắt buộc (`:24`). |
  | `lib/payment/payment-ledger-sync.ts` | `assertPeriodOpen(supplierId, projectId, date)` (`:39`); ném lỗi khi dòng `vat_tu` thiếu công trình. |
  | `lib/payment/payment-service.ts` | `upsertItem` (`:220`): `vat_tu` bắt buộc `projectId`. |

- Bước:
  1. Đổi chữ ký mà không đặt giá trị mặc định, để `tsc` liệt kê đủ mọi nơi gọi.
  2. Sửa từng nơi gọi trong `lib/`.
  3. Tách module compute.
  4. Cập nhật test.
- Test:
  - Tạo `test/integration/vat-tu-ncc-pair-scope.integration.test.ts`. Dữ liệu: NCC A, hai công trình X và Y cùng Chủ thể; phiếu Bê tông 18 m³ × 1.610.000 ở X và 0,5 ca × 2.800.000 ở Y. Khẳng định:
    1. Chốt và ký A×X kỳ 27/09→26/10, sau đó phiếu A×X ngày 15/10 bị từ chối với thông báo "đã được NCC ký xác nhận"; phiếu A×Y ngày 15/10 vẫn được.
    2. Chốt A×Y cùng kỳ không lỗi chồng lấn.
    3. Snapshot A×X chỉ có dòng của X; A (dư mang sang) chỉ tính X.
    4. Số dư ban đầu A×X bị khóa, A×Y vẫn sửa được.
    5. Dòng đợt `vat_tu` không có công trình bị từ chối; đóng đợt rơi vào kỳ đã ký của X bị từ chối, của Y thì qua.
    6. Marker `projectId = null` khóa cả X lẫn Y.
    7. Hai marker cùng kỳ ở X và Y thì được; trùng ở X thì vi phạm unique.
    8. Không gỡ ký được marker có `importRunId`.
  - Cập nhật chữ ký trong: `test/integration/{ledger-business-date,vat-tu-ncc-chot-ky-linh-hoat,vat-tu-ncc-pilot,vat-tu-ncc-thanh-toan,payment-service,cong-no-thue-hd}.integration.test.ts`, `lib/payment/__tests__/payment-service.test.ts`.
  - `period-bounds.test.ts` giữ nguyên, vì là hàm thuần nhận `ctx`.
- Phụ thuộc: P1. Chủ sở hữu tệp: các tệp `lib/` ở bảng trên và các test vừa liệt kê.
- Rollback: revert commit. Marker có `projectId` khi đó bị code cũ hiểu là phủ cả NCC, tức khóa chặt hơn, theo hướng an toàn.

### P3 — Lối vào theo công trình và UI cặp (10h)

- Mục tiêu: nhập phiếu, xem tháng, chốt, đối chiếu, thanh toán theo đúng NCC × công trình; xem nợ dự án từ sổ cái.
- Tệp:
  - Tạo:
    - `app/(app)/vat-tu-ncc/cong-trinh/[projectId]/page.tsx`: danh sách NCC trong công trình. Số dư lấy từ `queryDetailReport({ledgerType:"material", projectIds:[id], to: hôm nay})`, kèm số phiếu (`groupBy`) và trạng thái marker gần nhất. Liên kết dạng `/vat-tu-ncc/[ncc]/ngay?projectId=`.
    - `components/vat-tu-ncc/pair-context-bar.tsx` (client): chọn công trình của NCC, tab giữ `?projectId`.
  - Sửa:
    - `app/(app)/vat-tu-ncc/page.tsx`: thêm mục "Theo công trình".
    - `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx`: thay tab tĩnh (`:9-15`, `:65-77`) bằng thanh ngữ cảnh; truyền danh sách công trình có phiếu hoặc sổ của NCC.
    - `[supplierId]/ngay/page.tsx`, `thang/page.tsx`, `thang/thang-grid.tsx`: lọc theo `projectId` khi có.
    - `[supplierId]/chot-ky/{page,chot-ky-client}.tsx`, `doi-chieu/{page,doi-chieu-client}.tsx`, `doi-chieu/[reconciliationId]/{page,sign-button}.tsx`: bắt buộc có `projectId`, thiếu thì hiện bộ chọn; truyền `projectId` vào action.
    - `[supplierId]/thanh-toan/{page,thanh-toan-client}.tsx`: công trình bắt buộc, khóa sẵn theo `?projectId`; dùng `supplierBalanceAsOf(id, hôm nay, prisma, projectId)`.
    - `components/vat-tu-ncc/{delivery-grid,delivery-form,reconciliation-form}.tsx`: thêm prop `projectId`; `try/catch` kèm `toast.error` cho tạo, sửa, xóa (`delivery-grid.tsx:160-171`).
    - `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx`: bắt chọn công trình khi loại là `vat_tu`.
    - `lib/du-an/supplier-debt-service.ts`: thay `aggregateFromTransactions` (`:53-98`) bằng truy vấn sổ cái (`queryDetailReport`, gộp theo NCC). Giữ nguyên kiểu `SupplierDebtRow`, nên trang và client không đổi.
    - `lib/master-data/schemas.ts`, `lib/master-data/project-service.ts`, `app/(app)/master-data/projects/{page,projects-client}.tsx`: thêm cột "Chủ thể" (select sửa trực tiếp được).
- Test:
  - Integration: mở rộng `vat-tu-ncc-pair-scope` để kiểm `listDeliveries(supplierId, {projectId})` chỉ trả phiếu của X.
  - Integration `test/integration/du-an-cong-no-ledger.integration.test.ts` (tạo): tổng "Còn nợ" của dự án bằng Σ cuối kỳ sổ cái theo công trình.
  - Unit `lib/master-data/__tests__/patch-actions.test.ts`: thêm ca `entityId`.
  - Chạy `test/unit/module-release-entrypoints.test.ts`.
- Phụ thuộc: P2. Chủ sở hữu tệp: mọi tệp `app/(app)/vat-tu-ncc/**`, `components/vat-tu-ncc/**`, `lib/du-an/supplier-debt-service.ts`, master-data project, `round-detail-client.tsx`.
- Rollback: revert chung PR với P2.

### P4 — Trang tổng hợp theo công trình (7h)

- Mục tiêu: xem theo năm và từ đầu, nhóm NCC → công trình hoặc công trình → NCC, lọc Chủ thể, xuất Excel.
- Tệp:
  - Tạo:
    - `lib/cong-no-vt/project-pivot.ts`: `buildProjectPivot(rows: DetailRow[], groupBy)` trả nhóm, con và tổng (TT/HĐ: đầu kỳ, PS tăng, PS giảm, cuối kỳ). Kèm `pivotColumnLabels(preset)`.
    - `components/ledger/project-pivot-table.tsx`: bảng mở/thu nhóm, đầu cột theo `components/sortable-table`.
    - `app/(app)/cong-no-vt/tong-hop-cong-trinh/page.tsx`: theo mẫu `chi-tiet/page.tsx`, dùng lại `DetailReportFilter`; tham số `?groupBy=ncc|cong-trinh`.
    - `app/(app)/cong-no-vt/tong-hop-cong-trinh/group-by-toggle.tsx`.
    - `lib/export/templates/cong-no-cong-trinh.ts`: dùng cùng pivot, xuất đúng nhóm đang xem.
  - Sửa:
    - `app/api/export/excel/route.ts`: đăng ký template `cong-no-cong-trinh` với quyền `cong-no-vt`, theo mẫu `:22,:54,:113-129`.
    - `app/(app)/cong-no-vt/page.tsx`: thêm liên kết điều hướng.
- Test:
  - Unit `lib/cong-no-vt/__tests__/project-pivot.test.ts`: Σ con = cha; tổng hai cách nhóm bằng nhau; mỗi nút có Đầu kỳ + PS tăng − PS giảm = Cuối kỳ.
  - Unit `lib/export/__tests__/cong-no-cong-trinh.route.test.ts`: kiểm quyền và tham số.
  - Integration `test/integration/cong-no-cong-trinh-pivot.integration.test.ts`. Dữ liệu: dòng lũy kế 31/12/2025 cho Nam Hương × Trại Chuối với net 59.868.420 (số Kongming đã kiểm), cộng phát sinh 2026. Khẳng định:
    1. Năm 2026: Đầu kỳ = 59.868.420.
    2. Còn nợ (`all`, đến T) = Cuối kỳ (năm 2026, đến T) cho mọi cặp.
    3. LH lũy kế ở `all` = LH CSV + LH 2026.
- Phụ thuộc: P1, chỉ để build xanh; không phụ thuộc P2. Chủ sở hữu tệp: các tệp trên, không chung tệp với P2 hay P3.
- Rollback: xóa route và template, gỡ liên kết.

### P5 — Engine import: thư mục, bước duyệt, báo cáo (10h)

- Mục tiêu: hạ tầng D7 dùng chung, không biết gì về dữ liệu công nợ.
- Tệp:

  | Tệp | Thay đổi |
  |---|---|
  | `lib/import/adapters/adapter-types.ts` | Thêm `ImportFile {path, buffer}`, `ReviewSection {key, title, severity, columns, rows, decision?}`, `ImportReview {sections, blockers}`. Adapter có thêm `acceptsFolder?`, `parseFiles?(files)`, `review?(data, mapping)`, `buildReport?(data, mapping, runId)`. Thêm `ConflictItem.context?`. |
  | `lib/import/file-hash.ts` | `folderHash(files)` = sha256 của các dòng `path\nsha256` đã sắp xếp. |
  | `lib/import/import-engine.ts` | `previewImport(input: Buffer \| ImportFile[], adapter, fileName, createdBy, {mapping?, runId?})` trả thêm `review` và cập nhật `run.mapping` làm bản nháp. `commitImport(runId, input, mapping)`: kiểm hash; gọi `review` trước và ném lỗi nếu còn chặn; với adapter `singleCommittedRun` thì từ chối khi đã có run `committed`; `$transaction(…, { timeout: 300_000, maxWait: 10_000 })`; sau khi transaction xong gọi `buildReport` và lưu vào `run.report` (lỗi báo cáo không làm hỏng commit). `rollbackImportRun`: từ chối khi có dòng sổ ngoài run tham chiếu phiếu của run (đã chốt kỳ ERP trên phiếu import). |
  | `lib/import/adapters/adapter-registry.ts` | `listAdapters` trả thêm `acceptsFolder`. |
  | `app/(app)/admin/import/import-actions.ts` | `startPreview` và `doCommit` nhận `files[]`, `paths[]`, `mapping`, `runId`. Thêm `getMappingOptions()` (NCC, công trình, Chủ thể, vật tư) và `getLastMapping(adapter)`. Giữ guard `admin.import`. |
  | `app/(app)/admin/import/import-upload-form.tsx` | Adapter `acceptsFolder` thì dùng ô chọn thư mục; sau preview hiện panel tại chỗ, không chuyển trang. |
  | `app/(app)/admin/import/import-review-panel.tsx` (tạo) | Khung panel; giữ `File[]` trong bộ nhớ; có "Tính lại", "Dùng lại ánh xạ lần trước", "Ghi dữ liệu" (khóa khi còn chặn). |
  | `app/(app)/admin/import/import-mapping-section.tsx` (tạo) | Mỗi tên nguồn có một select: ứng viên, toàn bộ bản ghi, "Tạo mới theo tên" (giá trị 0). Chưa chọn thì là chặn. |
  | `app/(app)/admin/import/import-review-sections.tsx` (tạo) | Hiển thị chung `ReviewSection` (bảng sortable, radio quyết định ghi vào mapping, lọc "chỉ dòng lệch"). |
  | `app/(app)/admin/import/[runId]/page.tsx` | Hiện `run.report`; ẩn `CommitPanel` với adapter thư mục. |

- Test:
  - Unit `lib/import/__tests__/file-hash.test.ts`: hash không đổi khi đảo thứ tự tệp, đổi khi sửa một tệp.
  - Integration `test/integration/import-engine.integration.test.ts` (P5 sở hữu):
    - Đổi lời gọi commit hiện có sang mapping tường minh (giá trị 0 = tạo theo tên), tương thích cả trước và sau P8.
    - Thêm adapter thư mục giả lập (đăng ký trong test) để kiểm: chặn → commit bị từ chối; `report` được lưu; run `committed` thứ hai bị từ chối; rollback bị từ chối khi dòng sổ ngoài run tham chiếu phiếu của run.
- Phụ thuộc: P1 (cột `report`). Chủ sở hữu tệp: các tệp trên và `test/integration/import-engine.integration.test.ts`.
- Rollback: revert; các adapter một tệp không đổi hành vi.

### P6 — Parser file tổng, CSV và so sánh cặp (6h, thuần)

- Tệp:
  - Sửa `lib/import/adapters/cong-no-vat-tu.parse.ts`:
    - Đọc ma trận `raw: true`.
    - Khi không tìm thấy tiêu đề NCC/Dự án mà ô ngay sau "Chủ Thể" trống, dùng vị trí `cEntity+1` / `cEntity+2` (kiểm tra cột "Tên Vật Tư" ở `cEntity+3`).
    - Thêm các trường `projectName`, `itemName`, `invoiceDate`, `dateWarning`; `content` giữ nguyên cách ghép để adapter nhân công không đổi.
    - Năm < 1900 đổi thành năm chiếm đa số của sheet (2026), kèm cảnh báo có số dòng.
    - Hàm `projectKey(name, entity, multiEntityNames)`: tên xuất hiện dưới ≥ 2 Chủ thể (trong Nhập Liệu và SDBĐ) thì sinh khóa `project:<tên>|<Chủ thể>`.
  - Tạo `lib/import/adapters/tong-cong-no-csv.parse.ts`:
    - Đọc bằng SheetJS `codepage 65001`, `raw`; dòng tiêu đề tìm theo "Tên công ty" và "Tổng phát sinh".
    - Cột: G = LH TT; I = cột ngay trước "Còn nợ" (đã trả TT); M = "Tổng giá trị"; N = "Đã chuyển khoản"; Q = "Ghi chú" (công trình).
    - Tên NCC mang xuống các dòng tiếp theo; bỏ dòng "Cộng"; dừng ở dòng có "Tổng cộng"; bỏ ô `#REF!` kèm cảnh báo.
    - Kiểm J = G − I với dung sai 1đ.
    - Gộp theo (NCC nguồn, công trình nguồn); nối số và ngày hợp đồng vào ghi chú.
  - Tạo `lib/import/adapters/lifetime-pair-compare.ts`: đầu vào là SDBĐ, CSV và phát sinh Nhập Liệu theo cặp đã có id; đầu ra là bảng so sánh (LH, đã trả trước 2026 TT/HĐ, chênh lệch, mặc định, cờ cấm).
- Test (tạo `lib/import/adapters/__tests__/{cong-no-vat-tu-parse,tong-cong-no-csv-parse,lifetime-pair-compare}.test.ts`):
  - Parse:
    - Workbook dựng trong test có tiêu đề D/E trống: đọc được NCC và công trình.
    - Ô chữ `'26/10/0206'` thành 26/10/2026, kèm cảnh báo.
    - "Cống hộp - Tiên lãng" dưới Lưu Minh Xuân và Lê Văn Huyên sinh hai khóa.
  - CSV với đoạn đầu file thật:
    - Nam Hương × Tân lộc CDC: G 1.039.650.000, I 930.313.300, M 1.380.713.400, N 1.380.713.400.
    - Dòng "Cộng" và phần sau "Tổng cộng" bị bỏ.
  - So sánh: cặp có net trước 2026 bằng 59.868.420 thì mặc định lũy kế; cặp HĐ lệch 100.000.000 thì mặc định số dư; cặp có LH trước 2026 âm thì cấm chọn lũy kế.
  - `adapters.test.ts:190-260` phải vẫn xanh.
- Phụ thuộc: không (thuần). Chủ sở hữu tệp: các tệp trên. P8 sở hữu `adapters.test.ts`.

### P7 — Parser file theo dõi công trình (12h, thuần)

- Tệp (đều tạo mới):
  - `lib/import/adapters/theo-doi-vat-tu.parse.ts`:
    - Mỗi tệp tách khối theo các dòng "Công trình:", "Tên vật tư:", "Số công nợ … từ ngày X đến hết ngày Y" và dòng tiêu đề có "STT" + "Ngày".
    - Mỗi dòng phiếu có: ngày (ô gốc), KL, ĐVT, đơn giá, thành tiền, mô tả.
    - Tiểu mục "Cộng <tên>" (khác "Cộng P/S") gán các dòng phía trước cho công trình `<tên>`.
    - Bỏ dòng có mô tả GTGT/VAT/thuế (đưa vào danh sách thông tin) và dòng KL rỗng hoặc 0.
    - Tên vật tư: cột tên vật tư nếu có, nếu không thì mô tả của dòng, nếu không nữa thì "Tên vật tư" của khối.
    - Mốc kiểm tra của khối: A, B, C, "Tổng nợ".
    - Sheet "Vật tư ngày" chỉ thêm phiếu còn thiếu và bổ sung CB vật tư / CHCT / KT. Bỏ qua sheet "Vật tư tháng".
  - `lib/import/adapters/theo-doi-vat-tu-dates.ts`: sinh ngày ứng viên:
    - Ô số: `XLSX.SSF.parse_date_code`, rồi đảo thành (năm, d, m) nếu hợp lệ; cách đọc không đảo là ứng viên phụ.
    - Ô chữ `d/m/yyyy`: đọc thẳng; năm 5 chữ số ("20260") hoặc lệch đúng 1 năm so với khối thì sửa về năm của khối, kèm cảnh báo.
    - Chọn ứng viên nằm trong biên của khối (±3 ngày), nếu không thì lấy ứng viên gần trung vị các ngày đã giải trong khối.
    - Mọi ứng viên được giữ lại để P8 khớp với Nhập Liệu.
  - `lib/import/adapters/theo-doi-vat-tu-dedupe.ts`: theo cặp, khóa (ngày đã giải, vật tư, KL, đơn giá). Số lần xuất hiện = **max theo khối**, không cộng dồn: hai phiếu y hệt trong một khối vẫn là 2; một phiếu lặp ở hai khối hoặc hai tệp chỉ là 1.
- Test (tạo `lib/import/adapters/__tests__/theo-doi-vat-tu-{parse,dates,dedupe}.test.ts`, workbook dựng trong test theo layout thật):
  - Ngày:
    - Ô số "08/12/2026" trong khối 27/07→26/08 thành 12/08/2026.
    - "14/8/20260" thành 14/08/2026.
    - "19/4/2025" trong khối tháng 4/2026 thành 19/04/2026.
  - Khối và tiểu mục:
    - Khối gộp Lộc Tài: 22/06 1 ca × 2.600.000 thuộc Trại Chuối; 19/06, 25/06, 26/06 thuộc Dải cây xanh.
    - Dòng GTGT 18.656.000 bị loại.
    - Khối MN2 nhãn 27/09→26/10 chứa phiếu 27/10 0,5 ca × 2.800.000: phiếu được giữ đúng ngày 27/10.
  - Khử trùng: hai phiếu Nam Hương DCX 5.400 viên × 1.350 trong cùng khối vẫn là 2; phiếu Quang Minh lặp giữa hai tệp Trại Chuối chỉ còn 1.
  - Mốc: "Tổng nợ" khối 27/09→26/10 của Bê tông HP Trại Chuối = 509.563.111.
- Phụ thuộc: không. Chủ sở hữu tệp: chỉ các tệp mới.

### P8 — Adapter cutover: kế hoạch ghi, ghi, báo cáo (12h)

- Tệp:
  - Sửa `lib/import/adapters/cong-no-vat-tu.adapter.ts` thành bộ điều phối với `acceptsFolder: true`, `singleCommittedRun: true`, `parseFiles`, `review`, `apply`, `buildReport`.
  - Tạo `cong-no-vat-tu-resolve.ts`:
    - mapping → id; giá trị 0 hoặc khóa vắng là tìm hoặc tạo theo tên (công trình tạo mới nhận Chủ thể duy nhất của nguồn).
    - Kiểm `Project.entityId` khớp Chủ thể nguồn.
    - Chặn khi còn dữ liệu vật tư không thuộc import nào mà ngày ≤ mốc (dấu vết pilot).
  - Tạo `cong-no-vat-tu-plan.ts` (thuần): khớp hai lượt; phân loại theo mốc; quyết định lũy kế/số dư; danh sách marker; các `ReviewSection`; mốc kiểm tra dự kiến.
  - Tạo `cong-no-vat-tu-apply.ts`:
    1. `lockSuppliers(tx, mọi NCC)`.
    2. Ghi số dư ban đầu hoặc 2 dòng lũy kế.
    3. Ghi dòng Nhập Liệu (có `projectId`, Chủ thể nguồn; `itemId` null nếu không gắn phiếu).
    4. Ghi phiếu (`RETURNING id`).
    5. `UPDATE` dòng sổ đã khớp: `deliveryId`, `qty`, `unitPriceSnapshot`, `itemId`.
    6. Ghi marker lịch sử, rồi `freezeReconciliationSnapshot(tx, id)`.
  - Tạo `cong-no-vat-tu-report.ts`: sau commit dùng `prisma` gốc và `queryDetailReport` (§5.8).
- Test:
  - Unit `lib/import/adapters/__tests__/cong-no-vat-tu-plan.test.ts`:
    - Khớp lượt 1 và lượt 2; phiếu sau mốc khớp dòng ≤ mốc thì lấy ngày Nhập Liệu.
    - Dòng Nhập Liệu > mốc khớp phiếu thì không ghi sổ; không khớp thì ghi.
    - Có marker cho mọi cặp có dữ liệu ≤ mốc.
    - Cặp quyết định 1 sinh 2 dòng 31/12/2025, quyết định 0 sinh 1 dòng số dư.
  - Integration `test/integration/import-cong-no-vat-tu-cutover.integration.test.ts`: thư mục tổng hợp dựng trong test (1 NCC × 2 công trình; Nhập Liệu ≤ và > mốc; CSV một cặp khớp, một cặp lệch; file công trình có ngày đảo và tiểu mục gộp). Khẳng định:
    1. Số dòng sổ = dòng Nhập Liệu ≤ 26/10 + dòng > mốc không khớp.
    2. Phiếu đã gắn có `qty` và `unitPriceSnapshot` trên dòng sổ.
    3. Nợ 26/10 từng cặp = "Tổng nợ" khối.
    4. Đầu kỳ 2026 = SDBĐ; LH ở `all` = CSV G.
    5. Kỳ gợi ý = 27/10→26/11; chốt kỳ đó chỉ sinh event cho phiếu sau mốc.
    6. Commit lần hai bị từ chối; hoàn tác xóa sạch, kể cả marker.
    7. Ghi phiếu ngày 20/10 bị từ chối.
  - Cập nhật `lib/import/adapters/__tests__/adapters.test.ts`.
- Phụ thuộc: P2 (`reconciliation-compute`, ngữ nghĩa marker theo cặp), P5, P6, P7. Chủ sở hữu tệp: các tệp trên và `adapters.test.ts`; chỉ import (không sửa) tệp của P2, P6, P7.

### P9 — Kiểm thử đầu-cuối, tài liệu, runbook (6h)

- Bước:
  1. Chạy đủ `pnpm test`, `pnpm test:integration` (Docker Desktop, DB test tắt `fsync` theo `docs/code-standards.md:328`), `npx tsc --noEmit`, `pnpm lint`, `pnpm build`.
  2. **Chạy thử trên dữ liệu thật** với một bản khôi phục của DB thật (đã dọn pilot): preview cả thư mục, ghi, đọc báo cáo, chụp kết quả.
  3. Tạo `reports/go-live-runbook.md`.
  4. Cập nhật tài liệu:
     - `docs/system-architecture.md` (phần Vật tư NCC): phạm vi cặp, dòng lũy kế, marker lịch sử, import thư mục.
     - `docs/project-changelog.md`.
     - `docs/user-guide/{ke-toan,can-bo-vat-tu,admin}.md`.
- Test chấp nhận: bảng báo cáo §5.8 có mọi cặp "Khớp", hoặc chênh lệch có giải thích được người dùng chấp nhận.
- Phụ thuộc: P1–P8.

### P10 — Go-live (vận hành, khoảng 4h, chưa tính thời gian người dùng duyệt)

Xem §6.

## 4. Schema và migration

`prisma/migrations/20261106090000_material_debt_pair_scope/migration.sql`:

```sql
ALTER TABLE "supplier_reconciliations" ADD COLUMN "projectId" INTEGER;
DROP INDEX "supplier_recon_period_unique";
CREATE UNIQUE INDEX "supplier_recon_pair_period_unique"
  ON "supplier_reconciliations"("supplierId", COALESCE("projectId", 0), "periodFrom", "periodTo")
  WHERE "deletedAt" IS NULL;
DROP INDEX "supplier_reconciliations_supplierId_periodFrom_idx";
CREATE INDEX "supplier_reconciliations_supplierId_projectId_periodFrom_idx"
  ON "supplier_reconciliations"("supplierId", "projectId", "periodFrom");
CREATE INDEX "supplier_delivery_daily_projectId_date_idx"
  ON "supplier_delivery_daily"("projectId", "date");
ALTER TABLE "import_runs" ADD COLUMN "report" JSONB;
```

- Nguồn của các tên cũ: `supplier_recon_period_unique` ở `20260729162000_reconciliation_derived_snapshot/migration.sql:24-26`; index cũ ở `20260504160000_add_supplier_delivery/migration.sql:50`.
- Không thêm FK cho `projectId`, giống `SupplierDeliveryDaily.projectId` (`schema.prisma:554`).
- Dữ liệu hiện có: không cần migration dữ liệu. Dòng cũ có `projectId = NULL` và vẫn khóa cả NCC cho tới khi dọn pilot.
- Sao lưu: chạy `pg_dump` qua `docker exec` trước `prisma migrate deploy` (`docs/operations/backup-restore.md`). Pilot đã ghi nhận `scripts/backup-db.sh` không chạy trên Windows (`plans/261006-…/reports/pilot-result.md:12`).

## 5. Thiết kế import cho D6/D7

### 5.1 Adapter

Chỉ một adapter, `cong-no-vat-tu` (mở rộng), với `acceptsFolder` và `singleCommittedRun`. Phân loại tệp theo nội dung, không theo tên:
- xlsx có sheet "Nhập Liệu" là file tổng (Nhập Liệu và Số Dư Ban Đầu).
- `.csv` là CSV lũy kế.
- xlsx có sheet "Đối chiếu…" hoặc "Vật tư ngày" là file theo dõi; thư mục cha là gợi ý công trình, tên tệp (bỏ đuôi) là gợi ý NCC.
- Tệp khác bị bỏ qua và liệt kê ra.

Các adapter khác không đổi hành vi.

### 5.2 Quy tắc parse

Xem chi tiết ở P6 và P7. Ngày bẩn được xử lý theo ba tầng:
1. Ứng viên theo kiểu ô: ô số thì đảo ngày/tháng; ô chữ đọc `d/m/y`; năm gõ sai thì sửa.
2. Chọn ứng viên theo biên khối (±3 ngày), hoặc theo trung vị ngày trong khối.
3. **Khi khớp được dòng Nhập Liệu thì lấy ngày của Nhập Liệu**, vì đó là ô ngày thật.

Ngày không giải được là chặn; người dùng sửa Excel rồi bấm "Tính lại".

### 5.3 Ánh xạ

Khóa ánh xạ:
- `supplier:<tên>`: tên trong Nhập Liệu, SDBĐ, CSV và tên tệp.
- `project:<tên>` hoặc `project:<tên>|<Chủ thể>`: tên trong Nhập Liệu, SDBĐ, CSV, thư mục, tiểu mục và nhãn khối gộp.
- `entity:<tên>`, `item:<tên>`.

Giá trị: id > 0, hoặc 0 = tạo mới theo tên. Chưa chọn là chặn.

Mặc định chỉ chọn sẵn khi tên trùng sau chuẩn hóa (`normHeader`). Bí danh, ví dụ "Cty (Anh Công)" → Khánh Đức hay "Cty Hiệu Trần (Anh Hiếu)" → Thương Hiệu Trần, do người dùng chọn một lần; nút "Dùng lại ánh xạ lần trước" nạp lại các chọn lựa này.

Tiên Lãng:
- Trong file tổng, "Cống hộp - Tiên lãng" xuất hiện dưới hai Chủ thể nên sinh hai khóa: `…|Lưu Minh Xuân` → "Tiên Lãng (Việt Úc)", `…|Lê Văn Huyên` → "Tiên Lãng (SH)".
- Trong CSV, "Tiên Lãng (Việt Úc)" và "Tiên Lãng (SH)" ánh xạ thẳng.

CDC:
- "Tân lộc CDC" và "ĐVP -CDC" trong CSV mặc định ánh xạ chung về công trình "CDC" của SDBĐ (xem câu hỏi mở 1).

Chủ thể của dòng lũy kế: lấy từ dòng SDBĐ của cặp, nếu không có thì `Project.entityId`, nếu vẫn không có thì là chặn.

### 5.4 Chống tính trùng

**Khớp phiếu với Nhập Liệu theo từng cặp.** Chỉ xét dòng `lay_hang` có TT > 0. Khóa khớp là (NCC, công trình, số tiền ±1đ).
- Lượt 1: cùng ngày (một trong các ngày ứng viên).
- Lượt 2: chỉ xét phần còn lại, cho phép |Δngày| ≤ 3 khi hai phía là duy nhất.

Ghép tham lam một-một. Sau khi khớp, ngày của phiếu lấy theo ngày Nhập Liệu.

**Bảng phân loại:**

| Đối tượng | ≤ mốc | > mốc |
|---|---|---|
| Dòng Nhập Liệu `lay_hang` khớp phiếu | ghi sổ, gắn `deliveryId` | **không ghi** (phiếu là nguồn) |
| Dòng Nhập Liệu không khớp (kể cả `thanh_toan`, dòng chỉ có HĐ, GTGT) | ghi sổ | ghi sổ, cảnh báo |
| Phiếu | ghi, nằm trong marker lịch sử đã ký | ghi, để mở, giữ giá đối chiếu |

Phiếu lịch sử không bao giờ sinh event vì ba lý do:
1. Marker lịch sử đã ký khiến `assertPeriodOpen` từ chối mọi ghi trong khoảng đó.
2. Quy tắc liền kề (`period-bounds.ts:124-135`) buộc kỳ mới bắt đầu từ mốc + 1, kể cả với phiếu năm 2025.
3. Không gỡ ký được marker do import tạo.

### 5.5 Preview hiển thị

Thứ tự các phần:
1. Phân loại tệp, số dòng mỗi tệp.
2. Ánh xạ (4 tab).
3. Ngày mốc chuyển đổi, mặc định 26/10/2026, lưu ở `mapping["option:cutover"]` = 20261026.
4. **Duyệt từng cặp.** Cột: SDBĐ TT/HĐ, CSV LH/đã trả TT/HĐ, phát sinh 2026, trước 2026, chênh lệch TT/HĐ, quyết định (radio). Có lọc "chỉ cặp lệch".
5. Khớp phiếu theo cặp: số phiếu, đã khớp, đã đổi ngày, phiếu có giá trước mốc mà không có dòng Nhập Liệu (không tính vào nợ), dòng Nhập Liệu không có phiếu. Có danh sách mở rộng; khớp vắt qua mốc được tô nổi.
6. Cảnh báo ngày: tệp, dòng, giá trị gốc → kết quả, quy tắc đã áp.
7. Kỳ ERP đầu tiên: phiếu sau mốc (11 phiếu 27–31/10 và các phiếu ≥ 01/11 nếu có) với KL × giá; dòng Nhập Liệu > mốc đã khớp hoặc chưa.
8. Dữ liệu vật tư đang có trong DB không thuộc import nào (là chặn nếu ngày ≤ mốc).
9. Mốc kiểm tra dự kiến, tính trong bộ nhớ, theo §5.8.

### 5.6 Thứ tự, tính lặp lại, hoàn tác

- Trong một run, thứ tự cố định: master data → số dư hoặc lũy kế → Nhập Liệu → phiếu → gắn phiếu → marker và snapshot. Giữa các adapter không có thứ tự nào phải xếp.
- Tính lặp lại: hash thư mục cùng quy tắc chặn trùng hash (`import-engine.ts:110-118`), cộng với `singleCommittedRun`.
- Hoàn tác: dùng `rollbackImportRun` sẵn có. Nó đã xóa sổ cái, số dư, phiếu và marker theo `importRunId` (`import-engine.ts:286-303`). Thêm chặn khi kỳ ERP đã chốt trên phiếu import.
- Master data tự tạo được giữ lại khi hoàn tác (hành vi hiện có).

### 5.7 Không dùng script

Mọi nạp dữ liệu đi qua `/admin/import`. Chỉ có việc dọn pilot (xóa, không nạp) là chạy SQL đã duyệt danh sách (§6).

### 5.8 Báo cáo sau ghi (lưu `ImportRun.report`)

1. **Mốc 26/10.** Mỗi khối có nhãn kết thúc = mốc và phiếu lớn nhất ≤ mốc, nếu có nhiều khối thì lấy khối đầu.
   - Cột: Excel "Tổng nợ" | nợ ERP tại mốc | Σ phiếu sau mốc nằm trong khối (ví dụ Lộc Tài MN2: 1.400.000) | phần chênh còn lại | trạng thái.
   - Nhãn khối có "+" được so với tổng các công trình thành viên (ví dụ nhóm Nam Hương Trại Chuối 294.445.120).
2. **Đầu kỳ 2026** theo cặp so với SDBĐ.
3. **LH và đã trả lũy kế** (preset `all`) theo cặp được duyệt so với CSV G, I, M, N. Phần chênh giải thích được bằng phiếu sau mốc chưa chốt.

## 6. Runbook go-live (khung)

1. **Đóng băng:** người dùng dừng sửa Excel. Chốt ngày import và xác nhận các file công trình đã cập nhật tới ngày đó.
2. **Sao lưu:** bật Docker Desktop, chạy `pg_dump` DB `ngoquyyen_erp` (docker-postgres-1:5433), ghi lại tên tệp sao lưu.
3. **Triển khai:** `prisma migrate deploy`, build container, chạy smoke test.
4. **Dọn pilot:**
   - Chạy truy vấn chỉ đọc, liệt kê dòng vật tư không có `importRunId` trong: `ledger_transactions` material, `ledger_opening_balances` material, `supplier_reconciliations`, `supplier_delivery_daily`, `supplier_price_quotes`.
   - **Người dùng duyệt danh sách id.**
   - Xóa trong một transaction theo đúng danh sách đó.
5. **Master data:**
   - Tạo hai công trình Tiên Lãng (Việt Úc → Lưu Minh Xuân; SH → Lê Văn Huyên).
   - Gán Chủ thể cho Trại Chuối (Công Ty Quản Lý), Dải cây xanh và Mầm non (Lê Văn Huyên) cùng các công trình đã hoàn thành ở màn master-data mới.
6. **Import:** `/admin/import`, adapter "Công nợ Vật tư", chọn thư mục `Quản Lý Công Nợ`. Xử lý ánh xạ cho tới khi hết chặn. Duyệt từng cặp. Xem mục khớp phiếu và cảnh báo ngày; nếu cần thì sửa Excel và bấm "Tính lại".
7. **Ghi**, sau đó đọc báo cáo §5.8. Nếu có cặp lệch không giải thích được: hoàn tác, sửa, chạy lại.
8. **Kiểm thực tế:**
   - `/cong-no-vt/tong-hop-cong-trinh`: năm 2026 và Toàn bộ.
   - `/vat-tu-ncc/cong-trinh/<Trại Chuối>`: Bê tông HP có nợ 509.563.111 tại 26/10.
   - Kỳ gợi ý của Quang Minh × DCX là 27/10→26/11, gồm 3 phiếu 4/4/8 m³ × 450.000.
9. **Nghiệm thu:** người dùng ký nhận báo cáo; lưu tệp xuất Excel vào `reports/`.
10. **Đóng băng Excel** thành chỉ đọc. Nhập ngay các phiếu giấy sau ngày đóng băng. Từ đây ERP là nguồn.
11. **Rollback vận hành:** trước khi chốt kỳ ERP đầu tiên thì hoàn tác import; sau đó thì khôi phục từ bản sao lưu bước 2 hoặc sửa bằng `dieu_chinh`.

## 7. Rủi ro hàng đầu

| # | Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|---|
| 1 | Parser file công trình sai: ngày đảo, nhãn khối sai, khối gộp, dòng GTGT. | Cao × Trung bình | Ngày Nhập Liệu là chuẩn khi khớp; preview liệt kê mọi lần sửa ngày; mốc kiểm tra dự kiến trước khi ghi và báo cáo sau ghi; vòng sửa Excel → "Tính lại". Nợ ≤ mốc không phụ thuộc parser này. |
| 2 | Ánh xạ sai (bí danh, CDC, Tiên Lãng) làm lệch cặp. | Trung bình × Cao | Chưa chọn là chặn, không tự tạo ngầm; kiểm Chủ thể của công trình; duyệt cặp; mốc kiểm tra; dùng lại ánh xạ. |
| 3 | Đổi phạm vi khóa bỏ sót một đường ghi. | Trung bình × Cao | Đổi chữ ký không đặt mặc định để `tsc` liệt kê đủ nơi gọi; ma trận test P2 phủ phiếu, sổ tay, số dư, đợt thanh toán, ký, gỡ ký; marker `null` giữ nghĩa cũ. |
| 4 | Giao dịch import dài trên Docker Windows bị hết thời gian hoặc giữ khóa lâu. | Trung bình × Trung bình | Timeout 300 giây; chạy trong giờ bảo trì; báo cáo chạy sau commit, ngoài transaction. |
| 5 | Mốc Excel không tái lập đúng tới từng đồng (khối chứa phiếu sau mốc, lỗi Excel), khiến người dùng nghi ngờ. | Cao × Trung bình | Báo cáo có cột giải thích riêng (phiếu sau mốc); tiêu chí nghiệm thu được phát biểu lại là "chênh còn lại = 0 hoặc được người dùng chấp nhận". |

## 8. Câu hỏi mở cho người dùng (chỉ những gì repo và dữ liệu không trả lời được)

1. "Tân lộc CDC" và "ĐVP-CDC" (CSV) là cùng công trình "CDC" của Số Dư Ban Đầu, hay là hai công trình? Mặc định: gộp về "CDC".
2. Các bản gộp (Nam Hương "Trại Chuối + Tân Lộc CDC + ĐVP-CDC") được nghiệm thu bằng tổng các công trình thành viên. Người dùng có chấp nhận cách so này không?
3. Các file theo dõi có được cập nhật tới đúng ngày import không? Phiếu ≥ 01/11 có trong file sẽ được import thành phiếu mở; phiếu chỉ có trên giấy phải nhập tay.
4. `du-an/[id]/cong-no` sẽ chuyển từ dữ liệu "Dự án xây dựng" (`project_transactions`) sang sổ cái vật tư. Nguồn cũ còn cần hiển thị ở đâu không? Mặc định: không, nhưng giữ bảng.
5. Dòng GTGT trong đối chiếu (ví dụ Lộc Tài 18.656.000) giữ là `lay_hang` như Nhập Liệu, hay chuyển thành `thue_hd`? Mặc định: giữ như Excel, và không tạo phiếu cho các dòng này.

## 9. Tổng công

| P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 | P10 | Tổng |
|---|---|---|---|---|---|---|---|---|---|---|
| 2h | 12h | 10h | 7h | 10h | 6h | 12h | 12h | 6h | 4h | **81h** |

Đường găng: P1 → P5/P7 → P8 → P9 (khoảng 42h). P2, P4 và P6 chạy song song với nhánh import.
