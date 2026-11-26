---
title: Plan loại NCC vật tư / nhân công
date: 2026-11-26
summary: "Chốt thêm trường Loại cho NCC, giữ nguyên sổ; plan 4 phase đã validate"
---

# Plan loại NCC vật tư / nhân công

## What happened

- Yêu cầu "đổi thông tin đối tượng NCC/tổ đội" được làm rõ thành: đổi thông tin NCC và chuyển loại NCC từ vật tư sang nhân công khi cần.
- Sửa thông tin NCC đã có sẵn cho admin (`/master-data/suppliers`, `patchSupplier`), nên phần mới chỉ là trường Loại.
- Khảo sát cho thấy chuyển hẳn NCC thành tổ đội (dời sang sổ `labor`) không làm được an toàn:
  - đề nghị thanh toán chỉ biết `supplierId` (`PaymentRoundItem`);
  - đóng đợt chỉ ghi sổ `material`;
  - NCC #67, #68 có kỳ đối chiếu chuyển đổi đã ký mà sổ `labor` không có tương đương.
- Lỗi có sẵn: tự điền công nợ dòng `nhan_cong` tra sổ `labor` bằng id NCC (`lib/payment/payment-service.ts:238-246`), trong khi sổ `labor` đánh số theo id tổ đội.
- Bẫy khi lọc: `partyIds = []` trong `lib/ledger/ledger-aggregations.ts:318` nghĩa là "không lọc", nên loại chưa có NCC phải được chặn trước.
- Ghi nhớ cũ gọi `ngoquyen-bansao-pg` là bản sao; thực tế từ đợt chuyển 11/2026 đó là CSDL production. Các truy vấn trong phiên đều chỉ đọc. Ghi nhớ đã sửa; khảo sát tiếp dùng `ngoquyen-dev-pg` (5434).

## Decision

- Người dùng chọn "giữ sổ, thêm loại": cột `suppliers.kind` (`vat_tu` | `nhan_cong`), không dời dòng sổ nào.
- Validate 26/11: đóng đợt ghi sổ dòng nhân công (bắt buộc công trình, chịu khóa kỳ); gợi ý NCC lọc theo loại cả hai chiều; báo cáo chỉ thêm bộ lọc Loại, mặc định "Tất cả".

## Next steps

- Thực hiện plan `plans/261126-0736-loai-ncc-vat-tu-nhan-cong/plan.md` (4 phase, khoảng 3 ngày) bằng `/ak-cook`.
- Việc riêng chưa làm: gộp NCC trùng (hai NCC cùng MST, một NCC trùng đã xác nhận); lịch sử tên pháp nhân.
- Triển khai production là bước sau, cần người dùng đồng ý.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
