# Brainstorm final: Tái hiện luồng theo dõi vật tư tháng → đối chiếu công nợ

Ngày: 2026-07-29 | Trạng thái: **ĐÃ DUYỆT** (user chốt toàn bộ quyết định)
Scout chi tiết (cấu trúc 5 workbook, bản đồ phủ ERP, gap list): `plans/reports/brainstorm-260729-vat-tu-thang-doi-chieu-scout.md`

## Vấn đề

5 file Excel `SOP/theo-doi-vat-tu-thang/*.xlsx` (mỗi file 1 NCC) thể hiện quy trình chuẩn: phiếu lấy hàng theo ngày (chỉ KL) → bản chốt tháng có ký (kỳ ~27→26) → bảng đối chiếu công nợ (ghép đơn giá lúc chốt, `A + B − C = Tổng nợ`, closing kỳ trước = opening kỳ sau, NCC ký). ERP hiện có 3 kho không nối nhau: `SupplierDeliveryDaily` (KL, không giá), `SupplierReconciliation` (3 số tổng gõ tay), ledger `cong-no-vt` (tiền gõ tay, PaymentRound không ghi ledger). Yêu cầu: đối chiếu công nợ phải khớp quản lý công nợ vật tư cả số lẫn sự kiện lấy hàng/thanh toán.

## Phương án chọn: PA-A — Một nguồn sự thật

Mỗi lần lấy hàng / chuyển khoản = 1 sự kiện duy nhất trong ledger; đối chiếu và công nợ là 2 cách trình bày cùng dòng sự kiện. PA-B (2 nơi + báo cáo so khớp) chỉ dùng làm lưới an toàn chuyển tiếp; PA-C (importer Excel đầy đủ) bị loại (YAGNI, dữ liệu bẩn).

## Quyết định đã chốt (user)

| # | Vấn đề | Quyết định |
|---|---|---|
| 1 | Chiều master | Phiếu ngày (khi có giá) sinh/đồng bộ dòng `lay_hang` vào ledger |
| 2 | Kỳ chốt | Cố định **27 tháng trước → 26 tháng này** cho mọi NCC |
| 3 | Thanh toán | PaymentRound duyệt chi → tự sinh `thanh_toan` vào ledger; vẫn cho gõ tay khoản ngoài đợt |
| 4 | Đơn giá | Kế toán gắn giá lúc chốt kỳ (gợi ý giá kỳ trước); sự kiện ledger sinh tại thời điểm chốt |
| 5 | Chủ thể (entity) | Gắn theo công trình: thêm FK `entityId` vào `Project`; phiếu suy Chủ thể từ công trình |
| 6 | Giá trên đối chiếu | Chỉ TT, VAT = 0 (đúng mẫu Excel; cột HĐ giữ nguyên cho tương lai) |
| 7 | Kỳ đã NCC ký | Khóa sửa (phiếu + số tổng); chênh lệch ghi `dieu_chinh` kỳ sau |
| 8 | Dữ liệu lịch sử | Nhập dư nợ đầu kỳ + tái lập 1-2 kỳ gần nhất của **Nam Hương** để kiểm chứng |

## Các pha triển khai

1. **Nền tảng dữ liệu**: `Project.entityId` FK → `Entity`; mở `unitPrice`/`totalAmount` trên `SupplierDeliveryDaily` (cột DB có sẵn — sửa zod `lib/vat-tu-ncc/schemas.ts`, `delivery-service.ts`, grid); thêm liên kết `LedgerTransaction.deliveryId`.
2. **Chốt kỳ & gắn giá**: màn "chốt kỳ 27→26" theo NCC — liệt kê phiếu trong kỳ, kế toán gắn giá hàng loạt → sinh `lay_hang` (amountTt = qty×giá, VAT 0, itemId, projectId, entity từ Project) vào ledger.
3. **Thanh toán một nguồn**: PaymentRound duyệt/chi tự ghi `thanh_toan` vào ledger; `cong-no-vt/nhap-lieu` giữ cho khoản ngoài đợt.
4. **Bảng đối chiếu sinh tự động**: `SupplierReconciliation` = snapshot dẫn xuất — opening = closing bản chốt trước (kỳ đầu lấy `LedgerOpeningBalance`), dòng chi tiết + tổng phụ theo công trình/loại VT, khối chữ ký theo mẫu Excel; cờ NCC ký → khóa kỳ.
5. **Kiểm chứng**: nhập dư nợ đầu + tái lập 1-2 kỳ Nam Hương; so khớp 100% A/B/C/Tổng nợ với Excel và với `getMaterialCurrentBalance` cùng asOf; báo cáo so khớp phiếu↔ledger làm lưới an toàn.

## Ràng buộc & rủi ro

- Phiếu `projectId` optional nhưng sinh ledger cần công trình (để suy Chủ thể) → bước chốt kỳ bắt buộc phiếu có công trình, hoặc bổ sung lúc chốt.
- Biên kỳ Excel lịch sử lệch chuẩn (26/27/28) → xử lý khi nhập số dư/tái lập, không cần logic đặc biệt trong ERP.
- Đổi thói quen nhập `cong-no-vt` (đang gõ tiền gộp) sang nhận dòng từ phiếu — cần giai đoạn chuyển tiếp với báo cáo so khớp.
- Dữ liệu bẩn trong Excel (ngày đảo, STT sót) → nhập tay có kiểm soát, không importer.

## Chỉ số thành công

- Bảng đối chiếu sinh từ ERP cho NCC thí điểm (Nam Hương) khớp 100% Excel kỳ tương ứng và khớp số dư `cong-no-vt` cùng thời điểm.
- Không còn màn hình cho gõ tay `totalIn`/`totalPaid` của kỳ sinh tự động.
- Closing kỳ k = Opening kỳ k+1 do hệ thống bảo đảm.
