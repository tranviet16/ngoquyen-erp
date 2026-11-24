# Hướng Dẫn Sử Dụng — Hợp Đồng Dự Án

**Dành cho:** chỉ huy công trường, kế toán, người quản lý dự án
**Vị trí:** Dự án xây dựng → chọn công trình → tab **Hợp Đồng**

---

## 1. Tổng Quan

Tab **Hợp Đồng** là danh mục tài liệu của công trình: hợp đồng kinh tế, giấy phép, bảo hiểm, biên bản nghiệm thu và tài liệu khác. Bấm tên một tài liệu để mở màn chi tiết.

Mỗi **hợp đồng kinh tế** gắn với một đối tác có mã:

| Đối tác | Số liệu đọc từ |
|---|---|
| **NCC vật tư** | Sổ công nợ vật tư của cặp NCC × công trình |
| **Đội thi công** | Sổ công nợ nhân công của cặp đội × công trình |
| **Chủ đầu tư (CĐT)** | Tab Nghiệm thu, tab Dòng tiền 3 bên, và **Sổ hóa đơn xuất CĐT** |

Màn hợp đồng **chỉ đọc số** từ các sổ gốc trên, không có ô nhập số liệu. Muốn sửa một con số, bấm link **Sửa ở sổ gốc →** bên cạnh danh sách tương ứng.

Quyền: xem cần quyền **đọc** công trình; thêm hợp đồng cần **tạo**; sửa, xóa, tải lên / xóa bản scan cần **sửa**; xóa vĩnh viễn bản scan chỉ **admin**.

---

## 2. Danh Mục Hợp Đồng

Bảng có các cột: Tên tài liệu, Loại, Đối tác, Giá trị theo DT, Giá trị theo TT, **Công nợ còn lại (TT)**, Ngày ký, Hết hạn, Trạng thái.

- Cột **Đối tác** ghi "NCC · tên", "Đội · tên" hoặc "CĐT · tên". Hợp đồng chưa gắn đối tác có mã hiện tên chữ màu xám kèm "(chưa gắn danh mục)".
- Cột **Công nợ còn lại (TT)**: NCC / đội là số cuối kỳ TT của cặp (cộng mọi Chủ thể, bằng báo cáo công nợ lũy kế); CĐT là nghiệm thu − tiền đã nhận. Loại không phải hợp đồng kinh tế ghi "—".
- Nhãn **gộp N**: công trình có N hợp đồng với cùng đối tác; số của cặp được dùng chung cho cả N hợp đồng. Cột này cố ý không có dòng tổng (cộng sẽ bị trùng).
- Băng xám "N hợp đồng chưa gắn đối tác nên chưa có số liệu": gắn đối tác để có số.

### Thêm / sửa hợp đồng

1. Bấm **Thêm hợp đồng** (hoặc **Sửa** ở cuối dòng).
2. Nhập **Tên tài liệu**, chọn **Loại** và **Trạng thái** (Hiệu lực, Chờ ký, Hết hạn, Chấm dứt).
3. Khi Loại = **Hợp đồng**, chọn **Đối tác của hợp đồng**:
   - **NCC vật tư** / **Đội thi công**: chọn trong danh sách. Admin có thêm mục "+ Tạo mới…" để tạo nhanh NCC / đội.
   - **Chủ đầu tư**: lấy tên CĐT ghi ở thông tin dự án. Dự án chưa ghi tên CĐT thì sửa ở thông tin dự án trước.
   - **Khác**: gõ tên đối tác (hợp đồng này không có số liệu).
4. Hợp đồng kinh tế có hai ô **Giá trị theo DT** và **Giá trị theo TT**. Loại khác chỉ có một ô **Giá trị**. Để trống = chưa nhập.
5. Bấm **Lưu**.

Đổi loại tài liệu sang loại khác "Hợp đồng" sẽ bỏ gắn đối tác. NCC / đội đã bị xóa khỏi danh mục không chọn mới được, nhưng hợp đồng đang gắn với đối tác đó vẫn giữ nguyên khi sửa.

---

## 3. Màn Chi Tiết Hợp Đồng

### 3.1 Thông tin và bản scan

Đối tác, ngày ký, hết hạn, nơi lưu bản giấy, ghi chú, và dòng "Nhập từ file (lần import #N)" nếu hợp đồng đến từ import.

**Bản scan** (không bắt buộc):

- **Tải lên bản scan**: chọn một hoặc nhiều tệp PDF, JPG, PNG, mỗi tệp tối đa 25 MB. Mỗi tệp báo thành công hoặc lỗi riêng.
- **Xem**: mở tệp ở tab mới. **Tải về**: tải tệp xuống máy. Mỗi lần xem / tải về được ghi nhật ký.
- **Xóa**: ẩn bản scan (tệp vẫn giữ trên máy chủ). Cần quyền sửa.
- **Xóa vĩnh viễn** (chỉ admin): xóa hẳn dòng và tệp, **không khôi phục được**. Admin thấy cả bản scan đã xóa để xóa vĩnh viễn.

### 3.2 Giá trị

Hai thẻ **Giá trị theo DT** và **Giá trị theo TT**. Hợp đồng CĐT có thêm thẻ "Giá trị HĐ ghi ở thông tin dự án"; nếu số này lệch với tổng giá trị DT của các hợp đồng CĐT thì có băng vàng.

Công trình có từ 2 hợp đồng trở lên với cùng đối tác: băng vàng liệt kê các hợp đồng đó. Số liệu bên dưới **gộp chung** các hợp đồng và so với **tổng giá trị** của chúng, vì sổ gốc không tách được theo từng hợp đồng.

### 3.3 Ba danh sách

| Hợp đồng NCC / đội | Hợp đồng CĐT |
|---|---|
| **Lấy hàng**: các dòng lấy hàng, thuế HĐ và điều chỉnh tăng (TT). Dòng tổng ghi riêng phần thuế HĐ. | **Lũy kế nghiệm thu**: giá trị CĐT của các đợt nghiệm thu (gồm VAT) |
| **Lấy hóa đơn**: gom theo số hóa đơn. Dòng chưa ghi số HĐ đứng riêng, có câu "N dòng chưa ghi số HĐ". | **Hóa đơn đã xuất**: từ Sổ hóa đơn xuất CĐT (gồm VAT, kể cả hóa đơn điều chỉnh âm) |
| **Chuyển tiền**: hai cột theo TT và theo HĐ | **Đã nhận**: tiền CĐT trả công ty trừ tiền công ty trả lại CĐT |

**Quyền xem từng dòng:** người chỉ có quyền đọc dự án thấy **các tổng** của hợp đồng NCC / đội. Muốn xem từng dòng cần thêm quyền đọc **Công nợ vật tư** (hợp đồng NCC) hoặc **Công nợ nhân công** (hợp đồng đội). Hợp đồng CĐT chỉ cần quyền đọc dự án.

### 3.4 Công nợ

**NCC / đội:**

| Số | Cách tính |
|---|---|
| Số dư đầu kỳ | Số dư ban đầu của cặp trong sổ công nợ |
| Còn phải trả theo thực tế | Đầu kỳ + lấy hàng − đã chuyển (TT) |
| Còn phải trả theo hóa đơn | Đầu kỳ + hóa đơn đã lấy − đã chuyển (HĐ) |
| Hóa đơn còn phải lấy | Lấy hàng **không gồm thuế HĐ** − hóa đơn đã lấy |

**CĐT** (mọi số gồm VAT): còn phải thu theo nghiệm thu (nghiệm thu − đã nhận), còn phải thu theo hóa đơn (hóa đơn đã xuất − đã nhận), hóa đơn còn phải xuất (nghiệm thu − hóa đơn đã xuất).

### 3.5 Phần hợp đồng chưa thực hiện

Bảng 3 dòng × 2 cột (theo giá trị DT và theo giá trị TT):

| Dòng | NCC / đội | CĐT |
|---|---|---|
| Giá trị − lũy kế lấy hàng | lấy hàng **không gồm thuế HĐ** | nghiệm thu |
| Giá trị − hóa đơn | hóa đơn đã lấy | hóa đơn đã xuất |
| Giá trị − đã chuyển tiền | **theo số HĐ của các lần thanh toán** | đã nhận |

- Ô ghi "Chưa nhập giá trị (k/N hợp đồng có giá trị)" khi hợp đồng (hoặc một hợp đồng trong nhóm gộp) chưa nhập giá trị ở cột đó. Giá trị 0 vẫn tính là đã nhập.
- Số âm ghi "Vượt x": đã thực hiện vượt giá trị hợp đồng.
- Cặp có số dư đầu kỳ: có ghi chú "Chỉ tính giao dịch từ sau số dư đầu kỳ", vì phần đầu kỳ không tách được lấy hàng / hóa đơn / chuyển tiền.

### 3.6 Các băng cảnh báo

- **Nhiều Chủ thể**: cặp đối tác × công trình có số ở từ 2 Chủ thể trở lên; số được cộng chung, băng ghi riêng từng Chủ thể.
- **Đối tác đã bị xóa khỏi danh mục**: số vẫn đọc từ sổ gốc.
- **Phiếu vật tư ngày chưa chốt**: "N phiếu vật tư ngày (x đ, k phiếu chưa có giá) chưa chốt vào sổ công nợ nên chưa nằm trong Lấy hàng". Số lấy hàng sẽ đủ sau khi chốt kỳ ở Vật tư NCC.

Loại không phải hợp đồng kinh tế, hoặc hợp đồng chưa gắn đối tác có mã, chỉ có phần Thông tin và bản scan.

---

## 4. Sổ Hóa Đơn Xuất CĐT

**Vị trí:** tab Hợp Đồng → nút **Sổ hóa đơn xuất CĐT**.

Sổ dùng chung cho mọi hợp đồng CĐT của công trình.

1. Dòng nhập ở đầu bảng: **Ngày HĐ**, **Ký hiệu** (ví dụ `1C26TAA`), **Số HĐ**, **Giá trị chưa VAT**, **VAT**, **Đợt nghiệm thu** (gợi ý từ tab Nghiệm thu), **Ghi chú**. Cột Tổng tự tính.
2. Bấm **Thêm**.

- **Hóa đơn điều chỉnh giảm** ghi **số âm**. Giá trị chưa VAT bằng 0 không được nhận.
- Cùng ký hiệu và số hóa đơn không ghi được hai lần; hệ thống báo "Hóa đơn … đã có trong sổ (ngày …)". Cùng số nhưng khác ký hiệu thì được.
- Sửa / xóa ở cuối dòng (cần quyền sửa). Dòng tổng ở cuối bảng ghi tổng chưa VAT, VAT và tổng.
