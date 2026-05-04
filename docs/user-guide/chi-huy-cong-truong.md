# Hướng Dẫn Sử Dụng — Chỉ Huy Công Trường

**Vai trò:** `chihuy_ct`  
**Thời gian đọc ước tính:** 8–10 phút  
**Phiên bản:** 1.0

---

## 1. Tổng Quan

Chỉ huy công trường theo dõi tiến độ thi công, ghi nhận nghiệm thu, quản lý hợp đồng và phát sinh tại công trình. Vai trò `chihuy_ct` có quyền đọc + ghi các tính năng liên quan đến dự án.

**Công việc chính:**
- Theo dõi tiến độ thi công theo mốc
- Ghi nhận nghiệm thu từng hạng mục
- Xem hợp đồng và phát sinh
- Xem dự toán công trình

---

## 2. Đăng Nhập

1. Truy cập `https://erp.ngoquyyen.vn`
2. Nhập email + mật khẩu
3. Dashboard hiển thị các dự án đang phụ trách

---

## 3. Xem Danh Sách Dự Án

1. Menu → **Dự Án**
2. Danh sách các dự án đang hoạt động
3. Click vào tên dự án để vào chi tiết

![Danh sách dự án](../screenshots/du-an-list.png)

---

## 4. Theo Dõi Tiến Độ Thi Công

### 4.1 Xem tiến độ hiện tại

1. Vào dự án → Tab **Tiến Độ**
2. Bảng hiển thị các mốc thi công: tên, ngày KH, ngày TH, % hoàn thành, trạng thái

**Ý nghĩa màu sắc:**
- Xanh lá: hoàn thành đúng hạn
- Vàng: đang thi công
- Đỏ: trễ hạn

### 4.2 Thêm mốc tiến độ

1. Tab **Tiến Độ** → Click **Thêm mốc**
2. Điền:
   - Tên mốc: "Xong phần móng", "Xong thô tầng 1"...
   - Ngày KH bắt đầu / kết thúc
   - Trọng số (% so với tổng dự án)
3. **Lưu**

### 4.3 Cập nhật tiến độ thực tế

1. Tìm mốc cần cập nhật
2. Click **Edit**
3. Nhập **ngày TH thực tế** và **% hoàn thành**
4. **Lưu**

![Cập nhật tiến độ](../screenshots/du-an-tien-do.png)

---

## 5. Nghiệm Thu

### 5.1 Tạo phiếu nghiệm thu

1. Tab **Nghiệm Thu** → Click **Thêm nghiệm thu**
2. Điền:
   - Mốc liên quan
   - Ngày nghiệm thu
   - % hoàn thành được nghiệm thu
   - Ghi chú / biên bản
3. **Lưu**

### 5.2 Xem lịch sử nghiệm thu

1. Tab **Nghiệm Thu** → Danh sách theo thứ tự thời gian
2. Mỗi nghiệm thu hiển thị: ngày, hạng mục, %, người tạo

---

## 6. Xem Hợp Đồng

1. Vào dự án → Tab **Hợp Đồng**
2. Danh sách hợp đồng: nhà thầu, giá trị, ngày ký
3. Click vào hợp đồng để xem chi tiết điều khoản

> Chỉ huy công trường xem được, không thêm/sửa hợp đồng (admin thực hiện).

---

## 7. Phát Sinh (Change Orders)

1. Tab **Phát Sinh** → xem danh sách phát sinh
2. Mỗi phát sinh: mô tả, số tiền, lý do, ngày phê duyệt
3. Tổng phát sinh hiển thị ở cuối bảng

---

## 8. Xem Dự Toán

1. Tab **Dự Toán** → xem danh sách hạng mục dự toán
2. Cột: Hạng mục | Đơn vị | KL | Đơn giá | Thành tiền
3. Tổng dự toán hiển thị ở cuối

---

## 9. SL/DT — Tiến Độ Xây Dựng

1. Menu → **SL/DT > Tiến Độ XD**
2. Xem timeline tiến độ tổng hợp tất cả dự án
3. So sánh KH vs TH theo tháng

---

## 10. Xử Lý Sự Cố

| Vấn đề | Giải pháp |
|--------|-----------|
| Không thấy dự án của mình | Liên hệ admin kiểm tra dự án đã được tạo chưa |
| Không thêm được mốc tiến độ | Kiểm tra quyền chihuy_ct. Nếu vẫn không được, liên hệ admin |
| Ngày nghiệm thu không lưu | Kiểm tra định dạng ngày: DD/MM/YYYY |
| % hoàn thành không cập nhật | Thử F5 tải lại trang |

---

## 11. FAQ

**Q: Tôi thấy dự án khác không phải của mình?**  
A: Hiện tại hệ thống hiển thị tất cả dự án. Lọc theo tên hoặc mã dự án.

**Q: Cần thêm mốc tiến độ nhưng không có quyền?**  
A: Liên hệ admin nâng quyền hoặc nhờ admin thêm hộ.

**Q: Nghiệm thu ghi lại được không nếu nhập sai ngày?**  
A: Có, click Edit để sửa. Mọi thay đổi đều được audit log ghi lại.

**Q: Có in được biên bản nghiệm thu không?**  
A: Chức năng in sẽ bổ sung trong Phase 2. Hiện tại chụp màn hình hoặc export dữ liệu.
