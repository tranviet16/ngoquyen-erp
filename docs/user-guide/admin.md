# Hướng Dẫn Sử Dụng — Admin

**Vai trò:** Admin  
**Thời gian đọc ước tính:** 12–15 phút  
**Phiên bản:** 1.0

---

## 1. Tổng Quan Hệ Thống

Hệ thống ERP Ngô Quý Yên quản lý toàn bộ hoạt động xây dựng: dự án, vật tư, nhân công, tài chính. Admin có quyền cao nhất — có thể tạo/sửa/xóa mọi dữ liệu và quản lý người dùng.

**Các module chính:**
- **Danh Mục (Master Data):** Đơn vị, nhà cung cấp, nhà thầu, hạng mục, dự án
- **Dự Án:** Hợp đồng, dự toán, tiến độ, nghiệm thu, phát sinh, giao dịch
- **Vật Tư NCC:** Giao nhận vật tư theo ngày/tháng, đối chiếu
- **Công Nợ:** Vật tư và nhân công — sổ cái, báo cáo tháng
- **SL/DT:** Chỉ tiêu, tiến độ nộp tiền, báo cáo doanh thu
- **Tài Chính:** Khoản vay, nhật ký, phân loại chi phí, phải thu/trả
- **Admin > Import:** Nhập dữ liệu từ file Excel lịch sử

---

## 2. Đăng Nhập

1. Mở trình duyệt, truy cập `https://erp.ngoquyyen.vn`
2. Nhập email và mật khẩu
3. Click **Đăng nhập**

![Màn hình đăng nhập](../screenshots/login.png)

> Nếu quên mật khẩu, liên hệ Admin để đặt lại.

---

## 3. Quản Lý Người Dùng

Admin quản lý tài khoản người dùng qua trang quản trị.

### 3.1 Tạo người dùng mới

1. (Hiện tại dùng script seed hoặc cơ sở dữ liệu — chức năng UI quản lý user sẽ bổ sung Phase 2)
2. Chạy lệnh: `npm run db:seed` hoặc `tsx scripts/seed-admin.ts`

### 3.2 Các vai trò trong hệ thống

| Vai trò | Mô tả | Quyền |
|---------|-------|-------|
| `admin` | Quản trị viên | Toàn quyền |
| `ketoan` | Kế toán | Đọc + ghi tài chính, công nợ |
| `canbo_vt` | Cán bộ vật tư | Đọc + ghi vật tư NCC |
| `chihuy_ct` | Chỉ huy công trường | Đọc + ghi tiến độ, nghiệm thu |
| `viewer` | Xem báo cáo | Chỉ đọc |

---

## 4. Danh Mục (Master Data)

### 4.1 Đơn Vị (Entities)

1. Menu trái → **Danh Mục > Đơn Vị**
2. Click **Thêm** → nhập tên, mã số thuế, địa chỉ → **Lưu**
3. Click icon bút chì để sửa
4. Click icon thùng rác để xóa (xóa mềm)

![Danh sách đơn vị](../screenshots/master-entities.png)

### 4.2 Nhà Cung Cấp (Suppliers)

1. Menu → **Danh Mục > Nhà Cung Cấp**
2. Thêm/sửa/xóa tương tự Đơn Vị
3. Nhà cung cấp được liên kết với giao nhận vật tư và công nợ

### 4.3 Nhà Thầu (Contractors)

1. Menu → **Danh Mục > Nhà Thầu**
2. Thêm nhà thầu với tên + mã số thuế
3. Nhà thầu được liên kết với hợp đồng và công nợ nhân công

### 4.4 Hạng Mục (Items)

1. Menu → **Danh Mục > Hạng Mục**
2. Thêm vật tư/hạng mục với tên + đơn vị tính (m3, tấn, bao, cái...)

### 4.5 Dự Án (Projects)

1. Menu → **Danh Mục > Dự Án**
2. Click **Thêm** → nhập mã dự án, tên, đơn vị chủ đầu tư → **Lưu**
3. Click vào dự án để xem chi tiết (hợp đồng, dự toán, tiến độ...)

---

## 5. Import Dữ Liệu Lịch Sử

### 5.1 Quy trình import

1. Menu → **Admin > Import**
2. Chọn **loại adapter** (adapter tương ứng file Excel nguồn)
3. **Upload file** Excel
4. Click **Preview** — xem trước dữ liệu sẽ nhập
5. Kiểm tra cột, giá trị — nếu có lỗi sẽ hiển thị đỏ
6. Click **Commit** để xác nhận nhập vào database

![Import Preview](../screenshots/import-preview.png)

### 5.2 Các adapter hỗ trợ

| Adapter | File nguồn |
|---------|-----------|
| Gạch Nam Hương | `Gạch Nam Hương.xlsx` |
| Quang Minh | `Quang Minh cát,gạch.xlsx` |
| Công Nợ Vật Tư | `Quản Lý Công Nợ Vật Tư.xlsx` |
| Dự Án Xây Dựng | `Quản Lý Dự Án Xây Dựng.xlsx` |
| Tài Chính NQ | `Hệ thống quản lý tài chính NQ.xlsx` |
| SL/DT | `SL - DT 2025.xlsx` |

> **Lưu ý:** Import cùng file 2 lần hệ thống sẽ phát hiện trùng (idempotent) và không tạo bản ghi trùng lặp.

---

## 6. Audit Log

Mọi thao tác tạo/sửa/xóa được ghi vào Audit Log tự động, bao gồm:
- Người thực hiện
- Thời điểm
- Dữ liệu trước và sau thay đổi

> Hiện tại xem Audit Log qua Prisma Studio hoặc query trực tiếp DB. UI xem audit log sẽ bổ sung Phase 2.

---

## 7. Xử Lý Sự Cố

| Vấn đề | Giải pháp |
|--------|-----------|
| Không đăng nhập được | Kiểm tra email/mật khẩu. Liên hệ admin đặt lại mật khẩu |
| Import báo lỗi "Unknown supplier" | Vào Danh Mục > Nhà Cung Cấp, thêm NCC trước khi import |
| Dữ liệu không hiện sau khi lưu | Tải lại trang (F5). Nếu vẫn không hiện liên hệ admin |
| Lỗi 403 Forbidden | Tài khoản không đủ quyền. Liên hệ admin nâng cấp vai trò |
| Xuất Excel không tải được | Kiểm tra browser popup blocker. Cho phép download từ domain |

---

## 8. FAQ

**Q: Xóa nhầm dữ liệu thì sao?**  
A: Hệ thống xóa mềm (soft delete) — liên hệ admin khôi phục qua database.

**Q: Có thể sửa dữ liệu đã import không?**  
A: Có, sau khi import vào DB có thể sửa bình thường qua UI từng module.

**Q: Audit log lưu bao lâu?**  
A: Không giới hạn trong Phase 1. Sẽ có chính sách retention trong Phase 2.
