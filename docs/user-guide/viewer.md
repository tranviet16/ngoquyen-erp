# Hướng Dẫn Sử Dụng — Viewer (Xem Báo Cáo)

**Vai trò:** `viewer`  
**Thời gian đọc ước tính:** 5–7 phút  
**Phiên bản:** 1.0

---

## 1. Tổng Quan

Viewer có quyền xem toàn bộ dữ liệu và báo cáo hệ thống nhưng **không thể thêm, sửa, hoặc xóa** bất kỳ thông tin nào.

**Dành cho:** Ban lãnh đạo, kiểm toán nội bộ, kế toán trưởng cần xem tổng quan.

---

## 2. Đăng Nhập

1. Truy cập `https://erp.ngoquyyen.vn`
2. Nhập email + mật khẩu
3. Dashboard hiển thị tổng quan toàn công ty

---

## 3. Dashboard Tổng Quan

Sau khi đăng nhập, dashboard hiển thị:
- Tổng số dự án đang hoạt động
- Tổng công nợ vật tư + nhân công
- Dòng tiền tháng hiện tại
- Các khoản vay đang có

![Dashboard](../screenshots/dashboard.png)

---

## 4. Xem Báo Cáo Các Module

### 4.1 Dự Án

1. Menu → **Dự Án** → xem danh sách dự án
2. Click vào dự án → xem các tab: Tổng quan, Hợp đồng, Dự toán, Tiến độ, Nghiệm thu
3. Không thấy nút "Thêm" hoặc "Sửa"

### 4.2 Công Nợ Vật Tư

1. Menu → **Công Nợ VT > Báo Cáo Tháng**
2. Chọn tháng → xem công nợ từng NCC
3. Menu → **Công Nợ VT > Chi Tiết** → xem sổ cái từng NCC

### 4.3 Công Nợ Nhân Công

1. Menu → **Công Nợ NC > Báo Cáo Tháng**
2. Chọn tháng → xem công nợ từng nhà thầu

### 4.4 Tài Chính

1. Menu → **Tài Chính** → Dashboard tài chính
2. Menu → **Tài Chính > Vay** → xem danh sách khoản vay
3. Menu → **Tài Chính > Phải Thu/Trả** → xem công nợ
4. Menu → **Tài Chính > Báo Cáo Thanh Khoản** → dự báo dòng tiền

### 4.5 SL/DT

1. Menu → **SL/DT > Báo Cáo DT** → doanh thu vs chỉ tiêu
2. Menu → **SL/DT > Báo Cáo SL** → sản lượng

### 4.6 Vật Tư NCC

1. Menu → **Vật Tư NCC** → chọn NCC → xem tab Ngày / Tháng / Đối Chiếu

---

## 5. Xuất Excel

Viewer có thể xuất báo cáo Excel ở tất cả màn hình có nút **Xuất Excel**:

1. Điều hướng đến báo cáo muốn xuất
2. Click **Xuất Excel**
3. File tự động tải về

---

## 6. Xử Lý Sự Cố

| Vấn đề | Giải pháp |
|--------|-----------|
| Không thấy dữ liệu | Chọn đúng tháng/năm trong bộ lọc |
| Không tải được Excel | Kiểm tra trình duyệt có block download không |
| Thấy trang trắng sau đăng nhập | Tải lại trang (F5) |
| Lỗi 403 khi vào một trang | Liên hệ admin — có thể cần nâng quyền |

---

## 7. FAQ

**Q: Tại sao không thấy nút Thêm/Sửa?**  
A: Vai trò Viewer chỉ có quyền xem. Để nhập liệu, cần tài khoản có vai trò khác.

**Q: Có thể in báo cáo trực tiếp không?**  
A: Dùng chức năng in của trình duyệt (Ctrl+P) hoặc xuất Excel rồi in từ Excel.

**Q: Dữ liệu cập nhật theo thời gian thực không?**  
A: Dữ liệu được cập nhật ngay khi người nhập liệu lưu. Tải lại trang (F5) để thấy dữ liệu mới nhất.
