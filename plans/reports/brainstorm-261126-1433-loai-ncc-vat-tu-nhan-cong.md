# Brainstorm: Loại NCC (vật tư / nhân công)

Ngày 26/11/2026. Repo công khai: NCC chỉ ghi bằng `NCC #id`, không ghi tên hay số tiền.

## Quyết định

- Người dùng chọn: **giữ nguyên sổ công nợ, thêm trường "Loại NCC"** (26/11/2026, "Giữ sổ, thêm loại").
- Đổi loại không dời dòng sổ nào. NCC loại nhân công vẫn nằm trong sổ vật tư (`ledgerType = "material"`), với kỳ đối chiếu, khóa kỳ và mốc chuyển đổi như cũ.
- Module Công nợ nhân công (sổ `labor`, danh mục tổ đội) không đổi.

## Yêu cầu gốc

"Bổ sung thêm tính năng đổi thông tin đối tượng gồm nhà cung cấp/tổ đội...", sau đó người dùng làm rõ: "đổi thông tin NCC, chuyển loại NCC nếu cần (từ vật tư sang nhân công)".

## Hiện trạng (đã kiểm tra)

- **Sửa thông tin NCC đã có**, chỉ admin: nút "Sửa" và sửa trực tiếp trên lưới ở `/master-data/suppliers` (tên, MST, điện thoại, địa chỉ). Code: `lib/master-data/supplier-service.ts` (`updateSupplier`, `patchSupplier`), `lib/master-data/suppliers/table-spec.ts`, `app/(app)/master-data/suppliers/suppliers-client.tsx`. Layout `/master-data` gọi `requireActiveAdmin()`.
- **Supplier chưa có trường loại** (`prisma/schema.prisma`, model `Supplier`).
- **Thanh toán đã có khái niệm loại theo dòng:** `PaymentRoundItem.category` = `vat_tu | nhan_cong | dich_vu | khac`, nhưng dòng luôn gắn `supplierId`.
- **Lỗi có sẵn:** tự điền công nợ cho dòng `nhan_cong` tra sổ `labor` bằng `partyId = supplierId` (`lib/payment/payment-service.ts:238-246`), trong khi sổ `labor` đánh số theo id tổ đội (`Contractor`). Một NCC sẽ đọc nhầm công nợ của tổ đội cùng id. Chưa gây hại vì sổ `labor` đang trống.
- **Dữ liệu (production, đọc 26/11; bản dev giống):**
  - NCC #67, #68: mỗi NCC có 2 số dư đầu kỳ trong sổ vật tư và 2 kỳ đối chiếu đã ký từ lần chuyển đổi (marker có `importRunId`, UI không gỡ ký được).
  - NCC #69: chưa có dữ liệu.
  - Sổ `labor`: 0 dòng. Danh mục tổ đội: 3 tổ. Bản dev: module `cong-no-nc` ở trạng thái `development`.

## Hợp đồng

**Kết quả**
- Admin đặt hoặc đổi "Loại NCC" (vật tư / nhân công) khi tạo NCC, trong form Sửa và trên lưới Danh mục NCC. NCC hiện có mặc định là vật tư.
- Các màn hình công nợ vật tư (danh sách, báo cáo, tổng hợp) lọc được theo loại và có tổng tách vật tư / nhân công.
- Đề nghị thanh toán dòng `nhan_cong` gợi ý NCC loại nhân công, và tự điền công nợ từ đúng sổ chứa công nợ của NCC đó.

**Ràng buộc**
- Không dời dòng sổ, không chạm kỳ đối chiếu đã ký hay marker chuyển đổi.
- Migration chỉ thêm cột có giá trị mặc định; backup production trước khi chạy.
- Chỉ admin đổi loại. Mọi lần đổi đi qua audit log như các sửa đổi khác.
- Theo pattern sẵn có: `patchSupplier` whitelist, `supplierSchema`, ColumnDef `editKind`.

**Không làm**
- Gộp NCC trùng (NCC #6/#93 cùng MST, #51 trùng #44): để việc riêng.
- Chuyển NCC thành tổ đội, dời số dư sang sổ `labor`.
- Sửa module Công nợ nhân công hay danh mục tổ đội.
- Lưu lịch sử tên pháp nhân theo ngày.
- Mở quyền sửa NCC cho vai trò khác admin.

**Tiêu chí nghiệm thu**
- Trên bản dev (`ngoquyen-dev-pg`), đổi NCC #67, #68, #69 sang nhân công: tổng công nợ toàn bộ không đổi, 4 kỳ đã ký giữ nguyên, bộ lọc theo loại tách đúng ba NCC.
- Đổi ngược về vật tư: mọi màn hình như trước khi đổi.
- Test cho tự điền công nợ dòng `nhan_cong`: không còn đọc sổ `labor` bằng id NCC.
- Typecheck, lint, unit và integration test xanh.

## Đánh đổi

| Phương án | Dựa vào điều gì nhất | Hỏng đầu tiên khi |
|---|---|---|
| **Thêm loại, giữ sổ (đã chọn)** | Người dùng chấp nhận theo dõi công nợ NCC nhân công bằng công cụ công nợ vật tư, có lọc và tổng riêng | Cần NCC nhân công hiện trong menu Công nợ nhân công cùng tổ đội: phải ghép ở tầng báo cáo |
| Chuyển NCC thành tổ đội, dời sang sổ `labor` | Sổ `labor` làm được như sổ vật tư | Ngay với NCC #67, #68: sổ `labor` không có kỳ đối chiếu và khóa chuyển đổi, phải hủy 4 kỳ đã ký; Thanh toán chỉ chọn được NCC |
| Gộp tổ đội vào NCC, sổ `labor` dùng id NCC | Sổ `labor` trống nên dời dữ liệu ít | Phải sửa Công nợ nhân công, Hợp đồng, đồng bộ tài chính; vẫn vướng 4 kỳ đã ký |

## Hướng tốt hơn

Thay ý "chuyển NCC từ vật tư sang nhân công" (dời dữ liệu) bằng trường loại trên NCC. Bằng chứng: đề nghị thanh toán chỉ biết `supplierId` (`prisma/schema.prisma`, `PaymentRoundItem`), đóng đợt luôn ghi sổ `material` (`lib/payment/payment-ledger-sync.ts:57`), API cascade trả rỗng cho `labor` (`app/api/thanh-toan/cascade-suppliers/route.ts:84-88`), và NCC #67, #68 có kỳ đã ký không gỡ được. Chi phí chuyển: không có, vì chưa có code nào theo hướng dời dữ liệu.

## Câu hỏi còn mở

1. Danh sách chính xác các màn hình cần bộ lọc loại (danh sách NCC ở `/vat-tu-ncc`, Tổng hợp công nợ vật tư, báo cáo tháng, Thanh toán): plan khảo sát và đề xuất.
2. Khi doanh nghiệp đổi tên (TNHH sang CP), chứng từ cũ có giữ tên cũ không: chưa hỏi, ngoài phạm vi.
3. Module `cong-no-nc` và `thanh-toan` trên production đang `ready` hay `development`: kiểm tra chỉ-đọc trước khi chốt phần Thanh toán.
