# Debate evidence packet: module Dự án đọc sổ công nợ vật tư

Ngày 26/11/2026. Repo công khai: NCC chỉ ghi `NCC #id`, không ghi tên hay số tiền.

## Yêu cầu người dùng

"Vì sao ở một số dự án các giao dịch chưa được đưa vào giống dự án Mầm non GĐ1? Kiểm tra vì sao giao dịch chưa xuất hiện đầy đủ tại module dự án." Sau brainstorm, người dùng gọi `/ak-plan --debate` để lập kế hoạch sửa.

Brainstorm: `plans/reports/brainstorm-261126-1650-du-an-giao-dich-thieu-so-cong-no-vt.md`.

## Nguyên nhân đã chứng minh

1. Các tab Giao Dịch, Công Nợ NCC, Cân Đối VT, Định Mức và Dashboard của module Dự án chỉ đọc bảng `project_transactions`:
   - `lib/du-an/transaction-service.ts` `listTransactions` (tab Giao Dịch, `app/(app)/du-an/[id]/giao-dich/page.tsx` + `giao-dich-client.tsx` 340 dòng, có tạo / sửa / xóa / admin patch);
   - `lib/du-an/supplier-debt-service.ts` (159 dòng) gom `project_transactions` theo chuỗi `partyName`, loại tăng `lay_hang, giao_vat_lieu`, loại giảm `tra_tien, thanh_toan, tra_hang`; bỏ sót `thue_hd`, `dieu_chinh`, không có số dư đầu kỳ (tab Công Nợ NCC, `app/(app)/du-an/[id]/cong-no/page.tsx` + `cong-no-client.tsx` 166 dòng, chỉ đọc, đã có link sang `/vat-tu-ncc/cong-trinh/[projectId]`, comment ghi "tab này giữ nguồn cũ");
   - `lib/du-an/can-doi-service.ts`, `lib/du-an/dashboard-service.ts` (aggregate `amountTt/amountHd` của `project_transactions`; Dashboard đổi sang sổ DT-HĐ-TT khi `lib/du-an/dt-hd-tt/book-presence.ts` `projectUsesBook` đúng).
2. Người ghi `project_transactions`: nhập tay tab Giao Dịch; adapter import Excel `bang-can-doi-vat-tu.adapter.ts`, `du-an-xay-dung.adapter.ts`; import sổ đội `du-an-dt-hd-tt/apply-import.ts`; `dt-hd-tt/invoice-transaction-sync.ts` (dòng HĐ-only, `amountTt = 0`, từ sổ Hóa đơn). Không có đường nào từ sổ Công nợ vật tư (`ledger_transactions` material, phiếu ngày `supplier_delivery_daily`, đợt thanh toán).
3. Dữ liệu dev (`ngoquyen-dev-pg` 5434, ảnh khoảng 16–17/11):

| Công trình | project_transactions sống | hạng mục / dự toán | dòng sổ VT | phiếu ngày |
|---|---|---|---|---|
| 4 MNTC-GD1 | 280 (đều từ sổ Hóa đơn, TT = 0) | 6 / 361 | 367 (274 lấy hàng, 92 thanh toán, 1 thuế HĐ) | 180 |
| 1 TC | 0 | 0 / 0 | 490 | 222 |
| 14 DCX | 0 | 0 / 0 | 109 | 134 |
| 2, 3, 15, 16, 17, 18, 19, 21 | 0 | 0 / 0 | 2–14 mỗi công trình | 0–6 |

   Import runs: 2 `bang-can-doi-vat-tu` (08), 4 `du-toan-tong-hop-vt` (08), 7 `vat-tu-chuyen-doi` "Quản Lý Công Nợ (25 file)" (cutover sổ VT, 11/2026), 10 `du-an-dt-hd-tt` (17/11, sổ đội Mầm non).
4. Sổ VT toàn bộ (dev): 832 `lay_hang` (433 có `itemId`), 194 `thanh_toan` (29 có `itemId`), 2 `thue_hd`, 0 `dieu_chinh`. Dòng sổ không có hạng mục. Công trình 4: 55 dòng lấy hàng có HĐ, 28 có `invoiceNo`, so với 280 dòng sổ Hóa đơn → không khử trùng theo số HĐ được. 31 số dư đầu kỳ VT ở công trình 1 (1), 15 (18), 16 (11), 18 (1). Sổ nhân công 0 dòng.
5. `project_transactions.categoryId` NOT NULL; `invoice-transaction-sync` từ chối công trình chưa có hạng mục VL/NC/MTC.
6. `module_availability`: `du-an`, `cong-no-vt`, `vat-tu-ncc` đang `development` (admin vẫn vào được; người dùng khác bị chặn bởi `requireReleasedModuleRequest`).

## Code có sẵn để dùng lại

- `lib/ledger/transaction-classification.ts`: `TRANSACTION_TYPES`, `TRANSACTION_TYPE_LABELS`, `increaseSql`, `decreaseSql`, `signedSql`, `typeInSql`, `AUTO_GENERATED_GUARD`. Mọi SQL phải dùng fragment ở đây, không chép literal loại giao dịch.
- `lib/du-an/contract-detail/ledger-source.ts` (không "use server"): `loadLedgerRows(ledgerType, partyId, projectId)` (dòng sổ của một cặp, kèm tên vật tư, inc/dec TT/HĐ), `loadLedgerOpenings`, `loadPendingDeliveries(supplierId, projectId)` (phiếu chưa chốt, bỏ phiếu lịch sử trước cutover). Hiện theo từng cặp NCC × công trình.
- `lib/cong-no-vt/balance-report-service.ts` `queryDetailReport({ ledgerType, projectIds, entityIds, partyIds, from, to, showZero })`: báo cáo lũy kế của module Công nợ vật tư (số dư đầu kỳ + phát sinh − đã trả, theo Chủ thể × NCC × công trình). Đây là con số "chính thức" của Công nợ vật tư; `contract-detail-loader.ts` và `project-debt-summary-service.ts` đã dùng.
- `lib/ledger/ledger-aggregations.ts` `querySummary(ledgerType, { projectId })` (có cột điều chỉnh), `lib/ledger/balance-service.ts` (bỏ qua `dieu_chinh` theo SOP).
- `lib/vat-tu-ncc/project-overview-service.ts` `listPairsOfProject(projectId, { includeDebt })`: các NCC của công trình, cột nợ chỉ hiện khi có quyền đọc `cong-no-vt`; trang `/vat-tu-ncc/cong-trinh/[projectId]` đã tồn tại.
- Tiền lệ ACL: `lib/du-an/contract-detail/contract-detail-loader.ts` — người đọc được dự án thấy các tổng; danh sách từng dòng sổ cần thêm `canAccess(userId, "cong-no-vt", { minLevel: "read", scope: "module" })`, không có quyền thì không dòng nào sang client.
- Test liên quan: `test/integration/du-an-hop-dong-tie-out.integration.test.ts`, `cong-no-tong-hop-cong-trinh.integration.test.ts`, `cong-no-luy-ke.integration.test.ts`. Integration test chạy trên Postgres tạm 127.0.0.1:5435 (không bao giờ 5433 = production).

## Ràng buộc

- Không tạo bản sao tiền thứ hai (sổ VT có khóa kỳ đã ký, guard dòng tự sinh); không ghi `project_transactions` từ sổ VT.
- Không cộng gộp hai nguồn (HĐ của công trình 4 bị đếm hai lần).
- Không tự tạo hạng mục để qua NOT NULL.
- Next.js trong repo khác bản quen thuộc: đọc `node_modules/next/dist/docs/` trước khi viết code route.
- Server action phải kiểm quyền; hàm nội bộ đọc sổ không nằm trong file "use server".
- File code > 200 dòng cân nhắc tách module; tên file kebab-case.
- Repo công khai: test / plan không ghi tên NCC hay số tiền thật.

## Câu hỏi chủ đầu tư chưa trả lời (mặc định đề xuất)

1. Công trình dùng sổ đội như #4: công nợ NCC lấy HĐ theo sổ công nợ hay sổ Hóa đơn? (Sổ công nợ cho công nợ; sổ Hóa đơn cho Cân đối.)
2. Người có quyền du-an nhưng không có cong-no-vt có thấy tiền sổ công nợ không? (Không: cần cả hai; tổng có thể theo tiền lệ hợp đồng.)
3. Các công trình khác có file cân đối / dự toán của đội không? (Coi như không.)
4. Cộng gộp các Chủ thể trong màn công trình? (Có, như chi tiết hợp đồng.)

## Phạm vi

Trong: tab Giao Dịch và Công Nợ NCC hiện đủ hoạt động sổ VT của mọi công trình; trạng thái rỗng giải thích cho Cân Đối VT / Định Mức; số phiếu chưa chốt.
Ngoài: làm đầy Cân Đối VT / Định Mức, công nợ nhân công, đổi Dashboard (tối đa một thẻ công nợ), import file đội cho công trình khác.
