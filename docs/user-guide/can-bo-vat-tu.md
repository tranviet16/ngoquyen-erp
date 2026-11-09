# Hướng Dẫn Sử Dụng — Cán Bộ Vật Tư

**Vai trò:** `canbo_vt`  
**Thời gian đọc ước tính:** 8–10 phút  
**Phiên bản:** 1.0

---

## 1. Tổng Quan

Cán bộ vật tư quản lý việc giao nhận vật tư từ nhà cung cấp, theo dõi theo ngày và tháng. Vai trò `canbo_vt` có quyền nhập liệu giao nhận và xem công nợ vật tư.

**Công việc chính:**
- Nhập phiếu giao nhận vật tư hàng ngày
- Xem tổng hợp tháng
- Đối chiếu với nhà cung cấp

---

## 2. Đăng Nhập

1. Truy cập `https://erp.ngoquyyen.vn`
2. Nhập email + mật khẩu
3. Menu trái hiển thị module được phép

---

## 3. Giao Nhận Vật Tư — Nhập Theo Ngày (Phiếu ngày)

Mọi phiếu, chốt kỳ và đối chiếu đều theo **cặp NCC × công trình**. Cách vào nhanh nhất là đi từ công trình.

### 3.1 Vào theo công trình

1. Menu → **Vật tư – Nhà cung cấp** → nút **Theo công trình →** (`/vat-tu-ncc/cong-trinh`)
2. Chọn công trình. Trang công trình liệt kê các NCC đã có phiếu, sổ, số dư hoặc kỳ ở công trình đó.
   - Cột nợ chỉ hiện với người có quyền đọc **Công nợ vật tư**.
   - NCC chưa có ở công trình: dùng ô **Nhập phiếu cho NCC khác**.
3. Bấm một NCC để mở trang NCC đã chọn sẵn công trình (`?projectId=`). Thanh **NCC × Công trình** cho đổi công trình; các tab (Vật tư ngày, Vật tư tháng, Chốt kỳ, Đối chiếu công nợ, Thanh toán) giữ công trình đang chọn.
4. Vào từ trang NCC mà chưa chọn công trình: các tab Chốt kỳ, Đối chiếu, Thanh toán hiện bộ chọn công trình (có ô **Công trình khác** cho cặp mới).

### 3.2 Thêm phiếu giao nhận

1. Ở trang NCC × công trình → tab **Vật tư ngày**
2. Click **Thêm giao nhận**
3. Điền thông tin:

| Trường | Mô tả |
|--------|-------|
| Ngày | Ngày nhận hàng (ngày nghiệp vụ Asia/Bangkok) |
| Hạng mục | Chọn vật tư (Xi măng, Cát, Gạch...) |
| Số lượng | Khối lượng nhận |
| Đơn giá | *(để trống lúc nhập — sẽ gán khi chốt kỳ)* |
| Công trình | Bắt buộc. Khi vào từ công trình thì đã khoá sẵn |
| Ghi chú | Số phiếu cân, xe biển số... |

4. Click **Lưu**

![Thêm giao nhận vật tư](../screenshots/vat-tu-them-giao-nhan.png)

> **Lưu ý:**
> - Công trình bắt buộc; Chủ thể của công nợ lấy theo công trình. Công trình chưa gán Chủ thể thì báo lỗi, khi đó nhờ admin gán.
> - Đơn giá sẽ được gán tự động từ báo giá hiệu lực khi tạo phiếu, hoặc bạn ghi đè bằng tay
> - Phiếu rơi vào kỳ đã ký **của cặp** → bị từ chối và hiện thông báo lỗi (chênh lệch sửa bằng điều chỉnh kỳ sau)
> - Sau go-live, phiếu có ngày **≤ 26/10/2026** bị từ chối ở mọi công trình. Lịch sử tới ngày đó đã được nạp từ 23 file theo dõi.

### 3.3 Báo giá — Gợi ý giá khi nhập phiếu

Tab **Báo giá** (`/vat-tu-ncc/[NCC]/bao-gia`) quản lý mức giá hiệu lực theo thời gian.

1. Chọn NCC → tab **Báo giá**
2. Chọn vật tư (hoặc tạo dòng báo giá mới) — danh sách gồm vật liệu và ca máy (vd. "Ca (máy xúc)")
3. Ghi giá hiệu lực từ ngày:
   - **Từ ngày**: ngày bắt đầu giá này có hiệu lực
   - **Giá**: đơn giá (VND/ĐVT)
   - Click **Thêm dòng báo giá** hoặc **Sửa** dòng cũ
4. Khi sửa giá cũ → hệ thống hiển thị **Tăng/Giảm** badge + chênh lệch so với dòng trước
5. Khi nhập phiếu ngày → form **tự điền đơn giá** theo báo giá hiệu lực tại ngày phiếu
   - Nếu không có báo giá hiệu lực → để trống (bắt buộc ghi đè bằng tay)
   - Khi sửa phiếu cũ → đơn giá không bị ghi đè (giữ giá cũ)

### 3.4 Sửa & Xóa phiếu giao nhận

1. Tìm phiếu trong tab **Vật tư ngày**
2. Click icon bút chì → sửa số lượng/đơn giá → **Lưu**
   - Phiếu trong kỳ đã ký → từ chối
   - Phiếu từ phiếu ngày đã chốt kỳ hoặc từ thanh toán → không sửa/xóa (dòng tự sinh)
3. Xóa: Click icon thùng rác → xác nhận
   - Chỉ xóa được phiếu chưa chốt kỳ / chưa thanh toán

---

## 4. Chốt Kỳ — Gán Giá, Lấy Phiếu Vào Sổ Cái

Tab **Chốt kỳ** (`/vat-tu-ncc/[NCC]/chot-ky?projectId=…`) đóng dấu một kỳ công nợ của **một cặp NCC × công trình** và ghi sổ cái.

1. Mở trang NCC × công trình (mục 3.1) → tab **Chốt kỳ**
2. **Chọn kỳ** bằng ô **Từ ngày / Đến ngày**:
   - Mặc định gợi ý từ ngày sau kỳ gần nhất của cặp (sau go-live: 27/10/2026 → 26/11/2026)
   - **Quy tắc**: kỳ mới phải bắt đầu ngay **ngày hôm sau kỳ gần nhất của cặp** (ký hoặc chưa ký)
3. Xem **danh sách phiếu** trong kỳ:
   - Kiểm tra phiếu cần gán giá
   - Gán **đơn giá** (nếu để trống)
     - Form gợi ý từ báo giá hiệu lực
     - Có thể sửa → kiểm tra "Tăng/Giảm" badge
4. Click **Chốt kỳ**
   - Kiểm tra: mọi phiếu phải có sự kiện sổ cái
   - Nếu phiếu chưa có event (vd. bị lỗi chốt lại) → từ chối, yêu cầu ký trước
5. Kỳ chốt xong:
   - Phiếu không thể sửa/xóa nữa
   - Tab **Đối chiếu công nợ** hiển thị bảng kỳ chốt

---

## 5. Đối Chiếu Công Nợ — Ký Xác Nhận, Khoá Kỳ

Tab **Đối chiếu công nợ** (`/vat-tu-ncc/[NCC]/doi-chieu?projectId=…`) hiển thị bảng đối chiếu chính thức **của cặp NCC × công trình** và cho phép ký xác nhận. Một công trình là một bản đối chiếu, kể cả khi file Excel cũ gộp nhiều công trình.

1. Mở trang NCC × công trình → tab **Đối chiếu công nợ**
   - Kỳ **"Kỳ chuyển đổi (khóa)"** 01/01/2026 → 26/10/2026 là số liệu nạp từ Excel lúc go-live: đã ký, không gỡ ký hay sửa được
2. **Lọc kỳ** (tuỳ chọn):
   - Mặc định: tất cả kỳ chưa ký
   - Hoặc: từ ngày → đến ngày
3. **Xem bảng đối chiếu per kỳ**:
   - **Đầu kỳ (A)**: số dư tại ngày 27 (hoặc ngày trước) = cuối kỳ trước
   - **Phát sinh (B)**: tổng phiếu ngày ghi sổ trong kỳ (Lấy hàng + Thuế hoá đơn)
   - **Đã trả (C)**: tổng thanh toán (Chuyển khoản + Thuế hoá đơn nếu có ghi qua thanh toán)
   - **Nợ cuối (= A + B − C)**: còn nợ tại ngày cuối kỳ
4. Click **In** → xem PDF để gửi NCC ký
   - **Excel label** (nếu xuất Excel): biên "26/5→26/6" → nhập hệ thống là **"27/5→26/6"** (chuẩn hoá 27)
5. Click **Ký** → kỳ của cặp **bị khoá** (các công trình khác của cùng NCC không bị ảnh hưởng)
   - Phiếu ngày mới của cặp rơi vào kỳ này → hệ thống từ chối và hiện thông báo lỗi
   - Chênh lệch (nếu có) → ghi bằng **Điều chỉnh (dieu_chinh)** kỳ sau
   - Số dư ban đầu của cặp → bị khoá (không sửa được)
6. **Gỡ ký** (admin): chỉ khi cần huỷ ký nếu phát hiện sai số
   - Chỉ gỡ được kỳ ký mới nhất của cặp; còn kỳ ký sau thì bị từ chối (giữ chuỗi số dư)
   - Không áp dụng cho "Kỳ chuyển đổi (khóa)"

---

## 6. Xem Công Nợ Vật Tư

1. Menu → **Công Nợ VT > Chi Tiết**
2. Chọn nhà cung cấp
3. Xem lịch sử: ngày, loại (nợ/trả), số tiền, số dư lũy kế

> Cán bộ vật tư chỉ xem được, không nhập liệu công nợ (kế toán nhập).

---

## 7. Tìm Kiếm Nhà Cung Cấp

1. Trang **Vật Tư NCC**
2. Gõ tên vào ô tìm kiếm
3. Danh sách lọc theo tên ngay lập tức

---

## 8. Xử Lý Sự Cố

| Vấn đề | Giải pháp |
|--------|-----------|
| Không tìm thấy hạng mục vật tư | Yêu cầu admin thêm vào Danh Mục > Hạng Mục |
| Không tìm thấy nhà cung cấp | Yêu cầu admin thêm vào Danh Mục > Nhà Cung Cấp |
| Không tìm thấy công trình trong dropdown | Yêu cầu admin kiểm tra công trình đã được tạo chưa |
| "Công trình chưa gán Chủ thể" | Yêu cầu admin gán Chủ thể ở Dữ liệu nền tảng > Dự Án |
| Phiếu ngày ≤ 26/10/2026 bị từ chối | Giai đoạn đó đã chuyển đổi từ Excel và bị khoá. Báo kế toán ghi điều chỉnh sau 26/10/2026 nếu cần |
| Nhập nhầm số lượng | Click Edit trên phiếu và sửa lại |
| Không lưu được phiếu | Kiểm tra đã chọn đủ các trường bắt buộc (ngày, hạng mục, SL, công trình) và đọc thông báo lỗi |

---

## 9. FAQ

**Q: Có thể nhập nhiều phiếu cùng ngày không?**  
A: Có, mỗi lần nhận hàng có thể thêm 1 phiếu riêng.

**Q: Hệ thống có tính thành tiền tự động không?**  
A: Có, Thành tiền = Số lượng × Đơn giá, tính tự động khi lưu.

**Q: Nhà cung cấp không có trong danh sách, làm sao thêm?**  
A: Liên hệ Admin hoặc kế toán thêm vào Danh Mục > Nhà Cung Cấp trước khi nhập phiếu.

**Q: Xuất Excel đối chiếu để làm gì?**  
A: Gửi cho nhà cung cấp ký xác nhận số lượng hàng đã giao, tránh tranh chấp.
