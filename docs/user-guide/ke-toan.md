# Hướng Dẫn Sử Dụng — Kế Toán

**Vai trò:** `ketoan`  
**Thời gian đọc ước tính:** 10–12 phút  
**Phiên bản:** 1.0

---

## 1. Tổng Quan

Kế toán quản lý toàn bộ tài chính công ty: công nợ vật tư, công nợ nhân công, khoản vay, nhật ký kế toán, báo cáo. Vai trò `ketoan` có quyền đọc + ghi tất cả module tài chính.

**Công việc chính:**
- Nhập và theo dõi công nợ vật tư / nhân công
- Quản lý khoản vay ngân hàng
- Ghi nhật ký kế toán
- Xuất báo cáo Excel
- Xem dashboard tài chính

---

## 2. Đăng Nhập

1. Truy cập `https://erp.ngoquyyen.vn`
2. Nhập email + mật khẩu kế toán
3. Sau khi đăng nhập, menu trái hiển thị đầy đủ module

---

## 3. Công Nợ Vật Tư

### 3.1 Nhập liệu công nợ

1. Menu → **Công Nợ VT > Nhập Liệu**
2. Click **Thêm**
3. Điền thông tin:
   - Nhà cung cấp (chọn từ danh sách)
   - Dự án liên quan
   - Ngày
   - Loại: **Nợ phát sinh** (giao hàng chưa thanh toán) hoặc **Trả tiền**
   - Số tiền
4. Click **Lưu**

![Nhập liệu công nợ VT](../screenshots/cong-no-vt-nhaplieu.png)

### 3.2 Số dư ban đầu

Trước khi bắt đầu dùng hệ thống, cần nhập số dư tồn từ Excel cũ:

1. Menu → **Công Nợ VT > Số Dư Ban Đầu**
2. Chọn nhà cung cấp
3. Nhập số dư tại thời điểm bắt đầu
4. **Lưu**

### 3.3 Báo cáo tháng

1. Menu → **Công Nợ VT > Báo Cáo Tháng**
2. Chọn tháng/năm
3. Xem bảng: Số dư đầu kỳ | Nợ phát sinh | Đã thanh toán | Số dư cuối kỳ
4. Click **Xuất Excel** để tải file

### 3.4 Chi tiết sổ cái

1. Menu → **Công Nợ VT > Chi Tiết**
2. Chọn nhà cung cấp → xem lịch sử giao dịch theo thứ tự thời gian

---

## 4. Công Nợ Nhân Công

Quy trình tương tự Công Nợ Vật Tư, nhưng dành cho nhà thầu nhân công:

1. Menu → **Công Nợ NC > Nhập Liệu** → Thêm nợ/trả cho nhà thầu
2. Menu → **Công Nợ NC > Số Dư Ban Đầu** → Nhập số dư tồn
3. Menu → **Công Nợ NC > Báo Cáo Tháng** → Xem + xuất báo cáo

---

## 5. Tài Chính

### 5.1 Khoản Vay

1. Menu → **Tài Chính > Vay**
2. Click **Thêm khoản vay**
3. Nhập: Ngân hàng/tổ chức cho vay, số tiền gốc, lãi suất/năm, ngày bắt đầu, kỳ hạn (tháng)
4. Hệ thống tự tính lịch trả nợ
5. Mỗi kỳ đến hạn: click **Ghi nhận trả** → nhập ngày + số tiền thực trả

![Danh sách khoản vay](../screenshots/tai-chinh-vay.png)

### 5.2 Nhật Ký Kế Toán

1. Menu → **Tài Chính > Nhật Ký**
2. Click **Thêm bút toán**
3. Nhập: ngày, diễn giải, tài khoản nợ, tài khoản có, số tiền
4. **Lưu**

### 5.3 Phải Thu / Phải Trả

1. Menu → **Tài Chính > Phải Thu/Trả**
2. Tab **Phải Thu**: xem công nợ khách hàng chưa thanh toán
3. Tab **Phải Trả**: xem công nợ nhà cung cấp phải trả
4. Click **Ghi nhận thanh toán** để cập nhật số dư

### 5.4 Báo Cáo Thanh Khoản

1. Menu → **Tài Chính > Báo Cáo Thanh Khoản**
2. Chọn kỳ → xem dự báo dòng tiền vào/ra
3. Click **Xuất Excel**

### 5.5 Dashboard Tài Chính

1. Menu → **Tài Chính** (trang chính)
2. Xem nhanh: tổng thu, tổng chi, dòng tiền ròng, tổng nợ vay

---

## 6. SL/DT — Theo Dõi Doanh Thu

1. Menu → **SL/DT > Báo Cáo DT** — xem doanh thu thực tế vs chỉ tiêu
2. Menu → **SL/DT > Tiến Độ Nộp Tiền** — theo dõi lịch nộp tiền chủ đầu tư
3. Click **Xuất Excel** để tải báo cáo

---

## 7. Xuất Báo Cáo Excel

| Báo cáo | Menu | Template |
|---------|------|----------|
| Công nợ tháng VT | Công Nợ VT > Báo Cáo Tháng > Xuất Excel | cong-no-monthly |
| Đối chiếu NCC | Vật Tư NCC > Đối Chiếu > Xuất Excel | doi-chieu |
| Dự toán | Dự Án > Dự Toán > Xuất Excel | du-toan |
| SL/DT | SL/DT > Báo Cáo DT > Xuất Excel | sl-dt |

---

## 8. Xử Lý Sự Cố

| Vấn đề | Giải pháp |
|--------|-----------|
| Số dư báo cáo sai | Kiểm tra số dư ban đầu có nhập chưa. Kiểm tra có bỏ sót giao dịch không |
| Xuất Excel bị lỗi | Thử lại. Nếu vẫn lỗi liên hệ admin |
| Không tìm thấy nhà cung cấp khi nhập liệu | Yêu cầu admin thêm NCC vào Danh Mục |
| Khoản vay hiển thị sai lãi | Kiểm tra lãi suất nhập đúng đơn vị %/năm chưa |

---

## 9. FAQ

**Q: Nhập nhầm số tiền, sửa được không?**  
A: Có, click Edit trên bút toán/giao dịch và sửa lại.

**Q: Tháng này chưa có dữ liệu, báo cáo hiện gì?**  
A: Hiển thị số dư đầu kỳ = số dư cuối kỳ trước, nợ phát sinh và thanh toán = 0.

**Q: Có thể xem công nợ của tháng trước không?**  
A: Có, chọn tháng trong bộ lọc của Báo Cáo Tháng.
