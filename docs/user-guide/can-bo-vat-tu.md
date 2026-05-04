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

## 3. Giao Nhận Vật Tư — Nhập Theo Ngày

### 3.1 Thêm phiếu giao nhận

1. Menu → **Vật Tư NCC**
2. Chọn **nhà cung cấp** từ danh sách
3. Click tab **Ngày**
4. Click **Thêm giao nhận**
5. Điền thông tin:

| Trường | Mô tả |
|--------|-------|
| Ngày | Ngày nhận hàng thực tế |
| Hạng mục | Chọn vật tư (Xi măng, Cát, Gạch...) |
| Số lượng | Khối lượng nhận |
| Đơn giá | Giá thỏa thuận với NCC |
| Dự án | Dự án sử dụng vật liệu này |
| Ghi chú | Số phiếu cân, xe biển số... |

6. Click **Lưu**

![Thêm giao nhận vật tư](../screenshots/vat-tu-them-giao-nhan.png)

> **Lưu ý:** Phải chọn dự án — bắt buộc để hệ thống phân bổ chi phí đúng công trình.

### 3.2 Sửa phiếu giao nhận

1. Tìm phiếu trong tab **Ngày**
2. Click icon bút chì
3. Sửa số lượng/đơn giá
4. **Lưu**

> Chỉ sửa được phiếu trong ngày hoặc liên hệ admin nếu cần sửa phiếu cũ.

### 3.3 Xóa phiếu

1. Tìm phiếu → Click icon thùng rác → Xác nhận

---

## 4. Xem Tổng Hợp Tháng

1. Chọn nhà cung cấp
2. Click tab **Tháng**
3. Chọn tháng cần xem
4. Bảng hiển thị: tổng khối lượng, tổng thành tiền theo từng hạng mục

![Tổng hợp tháng vật tư](../screenshots/vat-tu-thang.png)

**Ý nghĩa các cột:**
- **Hạng mục:** Tên vật tư
- **Tổng SL:** Tổng số lượng trong tháng
- **Đơn giá TB:** Đơn giá trung bình
- **Thành tiền:** Tổng tiền = SL × Đơn giá

---

## 5. Đối Chiếu Công Nợ Với NCC

1. Chọn nhà cung cấp
2. Click tab **Đối Chiếu**
3. Chọn khoảng thời gian (từ ngày - đến ngày)
4. Xem bảng đối chiếu: tổng giao hàng, tổng đã thanh toán, còn nợ
5. Click **Xuất Excel** để có file gửi NCC ký xác nhận

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
