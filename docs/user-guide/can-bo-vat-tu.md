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

### 3.1 Thêm phiếu giao nhận

1. Menu → **Vật Tư NCC**
2. Chọn **nhà cung cấp** từ danh sách
3. Click tab **Vật tư ngày** (Ngày)
4. Click **Thêm giao nhận**
5. Điền thông tin:

| Trường | Mô tả |
|--------|-------|
| Ngày | Ngày nhận hàng (ngày nghiệp vụ Asia/Bangkok) |
| Hạng mục | Chọn vật tư (Xi măng, Cát, Gạch...) |
| Số lượng | Khối lượng nhận |
| Đơn giá | *(để trống lúc nhập — sẽ gán khi chốt kỳ)* |
| Dự án | Dự án sử dụng vật liệu (bắt buộc để phân bổ Chủ thể) |
| Ghi chú | Số phiếu cân, xe biển số... |

6. Click **Lưu**

![Thêm giao nhận vật tư](../screenshots/vat-tu-them-giao-nhan.png)

> **Lưu ý:** 
> - Phải chọn dự án — bắt buộc để hệ thống xác định Chủ thể (entity) cho phiếu
> - Đơn giá sẽ được gán tự động từ báo giá hiệu lực khi tạo phiếu, hoặc bạn ghi đè bằng tay
> - Phiếu rơi vào kỳ đã ký → từ chối (chênh lệch sửa bằng điều chỉnh kỳ sau)

### 3.2 Báo giá — Gợi ý giá khi nhập phiếu

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

### 3.3 Sửa & Xóa phiếu giao nhận

1. Tìm phiếu trong tab **Vật tư ngày**
2. Click icon bút chì → sửa số lượng/đơn giá → **Lưu**
   - Phiếu trong kỳ đã ký → từ chối
   - Phiếu từ phiếu ngày đã chốt kỳ hoặc từ thanh toán → không sửa/xóa (dòng tự sinh)
3. Xóa: Click icon thùng rác → xác nhận
   - Chỉ xóa được phiếu chưa chốt kỳ / chưa thanh toán

---

## 4. Chốt Kỳ — Gán Giá, Lấy Phiếu Vào Sổ Cái

Tab **Chốt kỳ** (`/vat-tu-ncc/[NCC]/chot-ky`) đóng dấu một kỳ công nợ và ghi sổ cái.

1. Chọn NCC → tab **Chốt kỳ**
2. **Chọn kỳ**:
   - **Tháng**: chọn tháng/năm → mặc định gợi ý từ phiếu sớm nhất chưa chốt
   - Hoặc **Từ ngày / Đến ngày**: tuỳ chọn biên kỳ
   - **Quy tắc**: kỳ mới phải bắt đầu ngay **ngày hôm sau kỳ gần nhất** (ký hoặc chưa ký)
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

Tab **Đối chiếu công nợ** (`/vat-tu-ncc/[NCC]/doi-chieu`) hiển thị bảng đối chiếu chính thức và cho phép ký xác nhận.

1. Chọn NCC → tab **Đối chiếu công nợ**
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
5. Click **Ký** → kỳ **bị khoá**
   - Phiếu ngày mới rơi vào kỳ này → hệ thống từ chối: "Kỳ đã ký — không sửa"
   - Chênh lệch (nếu có) → ghi bằng **Điều chỉnh (dieu_chinh)** kỳ sau
   - Số dư ban đầu của NCC → bị khoá (không sửa được)
6. **Gỡ ký** (admin): chỉ khi cần huỷ ký nếu phát hiện sai số
   - Sau khi gỡ ký, kỳ này sẽ bị xoá nếu có kỳ ký sau nó (để tránh break chain)

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
| Không tìm thấy dự án trong dropdown | Yêu cầu admin kiểm tra dự án đã được tạo chưa |
| Nhập nhầm số lượng | Click Edit trên phiếu và sửa lại |
| Không lưu được phiếu | Kiểm tra đã chọn đủ các trường bắt buộc (ngày, hạng mục, SL, dự án) |

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
