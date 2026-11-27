# Vì sao module Dự án thiếu giao dịch ở các công trình khác Mầm non GĐ1

Ngày 26/11/2026. Số liệu từ bản dev `ngoquyen-dev-pg` (ảnh chụp khoảng 16–17/11), chưa đối chiếu production.

## Kết luận

Mầm non GĐ1 (project 4) không được "đồng bộ tốt hơn". Đây là công trình duy nhất đã được nhập ba file Excel riêng vào module Dự án:

- run 2 `bang-can-doi-vat-tu` (18/08, sau đó bị sổ đội thay 117 dòng),
- run 4 `du-toan-tong-hop-vt` (20/08, 361 dòng dự toán, 6 hạng mục),
- run 10 `du-an-dt-hd-tt` (17/11, file đội "Can Doi Vat Tu 2", sinh 280 giao dịch HĐ).

Các tab Giao Dịch, Công Nợ NCC, Cân Đối VT, Định Mức chỉ đọc bảng `project_transactions`. Bảng này chỉ được ghi bởi: nhập tay ở tab Giao Dịch, các adapter import Excel của dự án, và sổ Hóa đơn của Đối chiếu DT-HĐ-TT. Không có đường nào đưa sổ Công nợ vật tư (`ledger_transactions`, phiếu vật tư ngày, đợt thanh toán) sang module Dự án. Chỉ trang chi tiết hợp đồng (`lib/du-an/contract-detail/ledger-source.ts`) đọc sổ công nợ.

Hệ quả trên bản dev:

| Công trình | project_transactions | Hạng mục / dự toán | Sổ công nợ VT (dòng) | Phiếu ngày |
|---|---|---|---|---|
| 4 MNTC-GD1 | 280 (toàn HĐ, TT = 0) | 6 / 361 | 367 | 180 |
| 1 TC | 0 | 0 / 0 | 490 | 222 |
| 14 DCX | 0 | 0 / 0 | 109 | 134 |
| 2, 3, 15–19, 21 | 0 | 0 / 0 | 2–14 mỗi công trình | 0–6 |

Ngay cả Mầm non GĐ1 cũng chỉ có tiền hóa đơn ở tab Giao Dịch; lấy hàng thực tế và thanh toán chỉ nằm trong sổ công nợ.

## Hợp đồng đề xuất (brainstorm contract)

- **Outcome:** mỗi công trình có hoạt động vật tư thấy được giao dịch và công nợ NCC trong module Dự án, khớp với module Công nợ vật tư.
- **Constraints:** không sinh bản sao tiền thứ hai; không đụng kỳ đối chiếu đã ký; `project_transactions.categoryId` NOT NULL; ACL module du-an và cong-no-vt.
- **Non-goals:** làm đầy Cân Đối VT / Định Mức (cần dự toán + hạng mục của từng công trình); công nợ nhân công (sổ NC đang rỗng trên dev).
- **Acceptance criteria:** công trình 1 và 14 hiện giao dịch và công nợ NCC; số dư từng NCC bằng đúng Công nợ vật tư (kể cả số dư đầu kỳ); tổng HĐ của công trình 4 ở "Sổ dự án" không đổi.

## Trade-offs

| Hướng | Giả định chịu lực | Hỏng đầu tiên khi | Trường hợp xấu nhất |
|---|---|---|---|
| (a) Đọc thẳng sổ công nợ VT | `projectId` trên sổ đúng (CHECK bắt buộc với sổ vật tư) | Ai đó cộng cả hai nguồn cho công trình dùng sổ đội như #4 | HĐ của #4 bị cộng hai lần |
| (b) Chép sổ công nợ sang `project_transactions` | Mọi dòng sổ ánh xạ được hạng mục và vật tư | Ngay lập tức: các công trình khác không có hạng mục; chỉ 433/832 dòng lấy hàng và 29/194 dòng thanh toán có `itemId` | Lệch dần sau sửa phiếu, hoàn tác import, kỳ đã ký; hạng mục "Khác" giả làm bẩn Cân đối |
| (c) Không sửa code, import file đội cho từng công trình | Mỗi công trình có file cân đối + dự toán | Không có file (thư mục "Quản Lý Công Nợ/Theo Dõi Vật Tư" chỉ có file theo dõi NCC) | Vẫn chỉ có HĐ như #4, không có TT và thanh toán |

Khuyến nghị: (a), làm hẹp:

1. **Công Nợ NCC** đọc sổ công nợ vật tư theo `partyId` (không theo chuỗi `partyName`), kèm số dư đầu kỳ (31 dòng ở công trình 1, 15, 16, 18), dùng lại `increaseSql`/`signedSql` trong `lib/ledger/transaction-classification.ts` và loader trong `contract-detail/ledger-source.ts`. Code hiện tại ở `supplier-debt-service.ts` còn bỏ sót `thue_hd` và `dieu_chinh`.
2. **Giao Dịch** thêm công tắc nguồn: "Sổ công nợ vật tư" (chỉ xem, link về module gốc) và "Sổ dự án" (`project_transactions`). Không có tổng gộp hai nguồn.
3. Hiện số phiếu ngày chưa chốt kỳ (`loadPendingDeliveries`) để giải thích chênh lệch.
4. Cân Đối VT / Định Mức giữ nguyên, thêm trạng thái rỗng nói rõ cần nhập dự toán và hạng mục.

Không làm: gộp hai nguồn, khử trùng theo số hóa đơn (công trình 4 chỉ 28 dòng sổ có số HĐ so với 280 dòng sổ Hóa đơn), tự tạo hạng mục để qua ràng buộc NOT NULL.

Better approaches: none — hướng (a) là sửa đúng nguyên nhân (module Dự án không đọc sổ công nợ), bằng chứng ở bảng trên.

## Câu hỏi cho chủ đầu tư (mặc định trong ngoặc)

1. Với công trình dùng sổ đội như #4, công nợ NCC lấy HĐ theo sổ công nợ hay sổ Hóa đơn? (Sổ công nợ cho công nợ; sổ Hóa đơn cho Cân đối.)
2. Người có quyền du-an nhưng không có quyền cong-no-vt có được xem tiền sổ công nợ không? (Không: cần cả hai quyền.)
3. Các công trình khác có file cân đối vật tư / dự toán của đội để nhập không? (Coi như không cho đến khi xác nhận.)
4. Màn công trình có cộng gộp các Chủ thể không? (Có, như trang chi tiết hợp đồng.)
