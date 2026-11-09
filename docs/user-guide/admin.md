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

1. Menu → **Dữ liệu nền tảng > Dự Án** (`/master-data/projects`)
2. Click **Thêm** → nhập mã dự án, tên, đơn vị chủ đầu tư → **Lưu**
3. Click vào dự án để xem chi tiết (hợp đồng, dự toán, tiến độ...)
4. Cột **Chủ thể** (chọn nhanh trong bảng): Chủ thể sở hữu công trình. Mọi công nợ vật tư của công trình (phiếu, sổ, số dư, dòng vật tư của đợt thanh toán) ghi theo Chủ thể này.
   - Công trình chưa gán Chủ thể thì không ghi được công nợ vật tư, và import chuyển đổi báo lỗi chặn.
   - Gán lần đầu (từ trống) luôn được.
   - Khi công trình đã có sổ, phiếu, số dư hoặc kỳ vật tư thì **không đổi sang Chủ thể khác hay bỏ gán được**; màn hình báo lý do.

---

## 5. Import Dữ Liệu Lịch Sử

### 5.1 Quy trình import

1. Menu → **Quản trị > Nhập dữ liệu** (`/admin/import`)
2. Chọn **Adapter (loại file)**
3. Chọn **File Excel (.xlsx)**, hoặc **Thư mục nguồn (.xlsx, .csv)** với adapter nhận cả thư mục. Với thư mục:
   - chỉ nhận `.xlsx` và `.csv`, tối đa 200 file và 20 MB;
   - file ẩn, file tạm `~$…` và file đuôi khác bị bỏ qua và được liệt kê.
4. Click **Tải lên và phân tích**. Hệ thống tạo một run ở trạng thái `preview`, lưu nguồn đã tải lên và mở trang run (`/admin/import/<id>`).
5. Ở trang run, panel **Duyệt** hiện:
   - "Phiên bản xem trước: vN";
   - lỗi chặn, xác nhận còn thiếu;
   - file trong gói và file bị bỏ qua.

   Adapter có màn duyệt riêng thì hiện thêm ở dưới. Sửa ánh xạ hoặc xác nhận xong thì bấm **Lưu & tính lại**; phiên bản tăng.
6. Khi hết lỗi chặn và đủ xác nhận → **Ghi dữ liệu**. Hệ thống ghi đúng phiên bản đang xem, từ nguồn đã lưu, trong một giao dịch. Run chuyển `committed`. Bấm Ghi lần hai không làm gì thêm.
7. **Hoàn tác** (danh sách `/admin/import`): xoá dữ liệu của run. Run chuyển `rolled_back` và được giữ làm dấu vết. Hoàn tác bị từ chối khi đã có dữ liệu ERP mới phụ thuộc run, ví dụ kỳ đã ký, bút toán điều chỉnh mới, hoặc chốt kỳ trên phiếu của run.
8. Xoá run: chỉ run `preview` hoặc `failed` không còn dữ liệu.

![Import Preview](../screenshots/import-preview.png)

### 5.2 Các adapter hỗ trợ

| Adapter | File nguồn |
|---------|-----------|
| Bảng cân đối vật tư (Dự toán + Hóa đơn) | Bảng cân đối vật tư theo HM |
| Dự toán — Tổng hợp VT | Sheet "Tổng hợp VT" của dự toán |
| Công nợ Nhân công | `Quản Lý Công Nợ Nhân Công.xlsx` |
| Quản lý Dự án Xây dựng | `Quản Lý Dự Án Xây Dựng.xlsx` |
| Tài chính NQ 2025 | `Hệ thống quản lý tài chính NQ.xlsx` |
| SL - DT | `SL - DT.xlsx` |
| Chuyển đổi công nợ vật tư từ Excel (cả thư mục) — *đang triển khai* | Thư mục `Quản Lý Công Nợ` (mục 5.3) |

> **Lưu ý:**
> - Hệ thống chặn ghi một nguồn trùng nội dung (cùng hash) với run đã ghi.
> - Các adapter cũ "Gạch Nam Hương", "Quang Minh", "Công Nợ Vật Tư" đã bị gỡ: chúng ghi công nợ vật tư không có công trình. Run cũ của chúng vẫn hoàn tác được.

### 5.3 Chuyển đổi công nợ vật tư (một lần, lúc go-live)

Làm theo runbook `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/reports/go-live-runbook.md` (đóng module, sao lưu, kiểm kê, dọn dữ liệu cũ, migrate, import, đối soát). Tóm tắt phần import (chi tiết màn duyệt theo kế hoạch, xác nhận lại khi chạy thử):

1. Trước khi import: ở **Dữ liệu nền tảng > Dự Án**, có đủ công trình ("Tiên Lãng (Việt Úc)", "Tiên Lãng (SH)", "Tân Lộc CDC", "ĐVP-CDC"…) và **mọi** công trình sẽ được ánh xạ đã có Chủ thể.
2. Adapter **Chuyển đổi công nợ vật tư từ Excel (cả thư mục)** → **Thư mục nguồn** → chọn cả thư mục `Quản Lý Công Nợ` (file tổng, CSV "Tổng công nợ", thư mục `Theo Dõi Vật Tư`) → **Tải lên và phân tích**.
3. Trên trang run, lần lượt:
   - ánh xạ tên NCC, công trình, vật tư;
   - tách dòng "CDC" của Số Dư thành Tân Lộc CDC và ĐVP-CDC;
   - duyệt từng cặp: lũy kế hoặc ròng;
   - chọn ngày cho các ô ngày lỗi hoặc mơ hồ;
   - xem phần sau mốc (mọi "Lấy Hàng" sau 26/10 phải ghép được phiếu), neo đối soát;
   - đợt thanh toán vật tư còn mở: xác nhận từng đợt "chưa chi và chưa có trong Nhập Liệu"; đợt trùng số tiền với một dòng "Trả Nợ" thì chọn **Bỏ dòng Nhập Liệu** hoặc **Giữ cả hai** trước (đợt `approved` không hủy được trên UI, chỉ đóng được);
   - xác nhận các mục cần `ack`.

   Mỗi bước bấm **Lưu & tính lại**.
4. **Ghi dữ liệu**. Sau khi ghi:
   - mỗi cặp có "Kỳ chuyển đổi (khóa)" 01/01/2026 → 26/10/2026 đã ký;
   - mọi ghi vật tư có ngày ≤ 26/10/2026 bị chặn;
   - chỉ được có **một** run chuyển đổi đã ghi.
5. Số liệu sai: **Hoàn tác** khi chưa có kỳ ERP nào được ký hay chốt trên phiếu của run, sửa Excel hoặc ánh xạ, rồi import lại.

### 5.4 Đóng / mở module (trạng thái phát hành)

`/admin/permissions/modules` → thẻ **Trạng thái phát hành** → **Quản lý trạng thái** → chuyển module giữa **Phát hành** và **Đang phát triển** → **Lưu thay đổi** (đóng module cần **Xác nhận và lưu**).
- Mỗi thay đổi được ghi vào Audit Log.
- Module đang phát triển chặn mọi người dùng **không phải admin**. Admin đang hoạt động vẫn vào được, nên trong lúc đóng băng (ví dụ go-live chuyển đổi), các admin khác không thao tác trên module đó.
- "Bảng điều khiển" và "Phân quyền" luôn phát hành.

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
| "Công trình chưa gán Chủ thể" khi ghi công nợ vật tư / import | Gán Chủ thể ở Dữ liệu nền tảng > Dự Án (cột Chủ thể) rồi thử lại / **Lưu & tính lại** |
| Ghi vật tư ngày ≤ 26/10/2026 bị từ chối | Đúng thiết kế sau import chuyển đổi; chênh lệch ghi bằng điều chỉnh có ngày sau 26/10/2026 |
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
