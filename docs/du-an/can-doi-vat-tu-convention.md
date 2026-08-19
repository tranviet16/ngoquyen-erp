# Quy ước sử dụng: Cân đối vật tư (Dự toán ↔ Hóa đơn ↔ Thực tế)

Áp dụng cho module Dự án (`/du-an/[id]`) từ 2026-08-18, bắt đầu với dự án
**Mầm Non Trại Chuối GĐ1** (mã `MNTC-GD1`) — nhập từ file "Bảng cân đối vật tư".

## 1. Ý nghĩa các cột tiền trên một dòng Giao dịch

- **HĐ (`amountHd`)** = giá trị hóa đơn đã lấy cho sự kiện đó.
- **TT (`amountTt`)** = giá trị phát sinh thực tế.
- **`TT = 0` sau import nghĩa là "chưa nhập số thực tế"**, KHÔNG phải "thực tế bằng 0".
  Dashboard và tab Cân đối luôn ghi nhãn "Thực tế (đã nhập)" vì lý do này.

## 2. Khi có số thực tế

**Sửa cột TT trên chính dòng giao dịch tương ứng** (tab Giao Dịch → Sửa).

- KHÔNG tạo dòng song song cho cùng một sự kiện (sẽ đếm trùng khối lượng ở Định Mức).
- KHÔNG copy giá trị HĐ sang TT cho xong — làm hỏng so sánh "Chênh TT−HĐ".
- Một dòng có HĐ ≠ TT là bình thường (ví dụ lấy hóa đơn cân thuế, giá hóa đơn khác giá thật).
- So sánh TT ↔ HĐ chỉ có ý nghĩa ở mức **tổng theo đầu mục/danh mục**, không so từng dòng
  (một đầu mục dự toán có thể gồm nhiều hóa đơn với tên thương mại khác nhau).

### SL HĐ vs SL (từ 2026-08-19)

Mỗi dòng giao dịch có 2 cột số lượng:

- **SL** = khối lượng thực nhận (dùng cho Định Mức và các so sánh thực tế).
- **SL HĐ** = số lượng ghi trên hóa đơn. **Để trống = giống SL** (trường hợp phổ biến).
  Chỉ nhập khác khi hóa đơn xuất số lượng khác thực nhận (cân thuế, xuất theo lượng chỉ định…).
- Giá trị HĐ của dòng = SL HĐ × Đơn giá HĐ; giá trị TT = SL × Đơn giá TT.

## 3. "Còn phải lấy HĐ" (tab Cân Đối VT)

- Mặc định **tự tính = Dự toán − Hóa đơn đã lấy**.
- Có thể **ghi đè thủ công từng dòng** (bấm vào ô, nhập số; xóa trống để trở về tự tính).
  Dòng ghi đè hiển thị dấu ✎. Dùng cho các trường hợp kiểu "chỉ lấy hóa đơn 50% dự toán".
- Dòng gắn nhãn **"ngoài DT"** = có hóa đơn nhưng không có đầu mục dự toán tương ứng.
- Nhãn **"khác ĐVT"** = đơn vị tính của hóa đơn khác dự toán (m2 ↔ Hộp…) — chỉ so sánh
  theo **tiền**, không so khối lượng và không so đơn giá.

## 3a. Trạng thái từng dòng (bucket) và ngưỡng ε

Mỗi dòng có 1 nhãn trạng thái, tính từ "Còn phải lấy HĐ" (đã tính cả ghi đè):

| Nhãn | Điều kiện | Màu |
|---|---|---|
| Chưa lấy | chưa có hóa đơn nào, dự toán > 0 | xám |
| Thiếu | còn phải lấy > ε | vàng |
| Đủ | \|còn phải lấy\| ≤ ε | xanh lá |
| Vượt | còn phải lấy < −ε | đỏ |
| Ngoài DT | có hóa đơn nhưng không có đầu mục dự toán | xanh dương |

**ε = max(1.000đ, 0,5% dự toán dòng)** — hấp thụ lệch làm tròn của sheet; muốn chặt hơn thì
sửa hằng số trong `lib/du-an/can-doi-metrics.ts` (một nguồn duy nhất cho UI + export).
% tiến độ so với **dự toán + phát sinh (CO) đã duyệt**; khi dự án chưa có CO thì bằng dự toán gốc.

## 3b. Ba chế độ xem của tab Cân Đối VT

1. **Lấy hóa đơn** — nghiệp vụ hằng ngày: % đã lấy theo tiền/lượng, còn phải lấy, thẻ
   "Top 10 cần đi lấy hóa đơn". Có số liệu ngay sau import.
2. **Thi công vs DT** — so khối lượng + đơn giá bình quân thực tế với dự toán, tác động
   tiền do chênh giá. Chỉ có số khi cột TT được nhập; %SL > 100% gắn cảnh báo vượt lượng.
3. **TT vs HĐ** — chênh lượng (SL − SL HĐ) và chênh giá bình quân giữa thực tế và hóa đơn.
   Chỉ có ý nghĩa khi cả 2 dòng số cùng được duy trì trên các giao dịch.

Các ô "—" nghĩa là **không so sánh được** (khác ĐVT, chưa có dữ liệu, hoặc dòng chỉ có tiền
không có khối lượng) — không phải bằng 0.

## 4. Import lại file cân đối

Ngày trên các dòng import = ngày thực hiện import (ghi chú "Nhập từ bảng cân đối vật tư").
Muốn đổi ngày từng dòng: dùng chức năng sửa/patch admin ở tab Giao Dịch.

Quy trình import lại (khi file Excel thay đổi):

1. `/admin/import` → tìm run cũ của adapter "Bảng cân đối vật tư" → **Hoàn tác** (rollback).
2. Import lại file mới (dry-run → commit).
3. **Không bao giờ import lại mà chưa rollback** — giao dịch không có khóa chống trùng,
   import 2 lần = đếm trùng toàn bộ hóa đơn.
4. Luôn import từ file export mới (đóng Excel trước khi export — file `~$...` là file đang mở).
5. Mã item tự sinh theo thứ tự dòng của sheet; nếu sheet bị chèn/xáo dòng, mã sẽ lệch so với
   lần trước → bắt buộc rollback rồi import lại toàn bộ (không import đè).

Lưu ý dữ liệu gốc: sheet HM1 mục Nhân công chỉ có số tổng hóa đơn (416.607.407) không có
chi tiết — hệ thống tạo 1 dòng "Nhân công (tổng hợp)". Khi có chi tiết, xóa dòng tổng hợp
và nhập các dòng thật.

Import đặt **SL HĐ = SL** cho mọi dòng hóa đơn (số trên sheet là số lượng hóa đơn). Khi
nhập số thực tế, sửa SL về khối lượng thực nhận và giữ SL HĐ theo hóa đơn.

## 5. Ranh giới với module Vật tư NCC

- **`/du-an` (Giao dịch)** = sự thật về **chi phí công trình**.
- **`/vat-tu-ncc` (sổ NCC)** = sự thật về **công nợ nhà cung cấp**.
- Cùng một chuyến hàng có thể xuất hiện ở cả hai nơi — **không bao giờ cộng gộp hai module**.

## 6. Hóa đơn chuyển giữa các giai đoạn

Hóa đơn "lấy từ GĐ1 sang GĐ2" (hoặc ngược lại) sẽ hiện lệch trong tab Cân đối của từng
giai đoạn. Ghi rõ vào cột ghi chú của dòng giao dịch để tra cứu sau.
