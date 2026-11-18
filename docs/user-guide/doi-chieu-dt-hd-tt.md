# Hướng Dẫn Sử Dụng — Đối Chiếu DT-HĐ-TT (Dự án xây dựng)

**Dành cho:** đội công trình (nhập sổ), kế toán (rà soát số đã trả, xuất báo cáo)
**Vị trí:** Dự án xây dựng → chọn công trình → tab **Đối chiếu DT-HĐ-TT**

---

## 1. Tổng Quan

Tab này thay file Excel "Cân đối vật tư" của đội. Nó có ba báo cáo và sáu màn nhập liệu:

| Mục | Dùng để |
|---|---|
| **DT-HĐ** | So dự toán với hóa đơn đã lấy, theo từng đầu mối và Mã nhóm |
| **DT-TT** | So dự toán với thực tế (Phần I theo vật tư, Phần II theo đầu mối, Phần III tổng dự toán) |
| **HĐ-TT** | So hóa đơn với tiền đã trả và thực tế, theo từng NCC |
| **Hóa đơn** | Sổ hóa đơn đầu vào (mỗi dòng hàng một dòng) |
| **Thực tế nhập** | Khối lượng / tiền thực tế nhận về công trường |
| **Chi thực tế** | Các khoản chi (chuyển khoản, tiền mặt), theo mục I–IV |
| **Ánh xạ** | Gán tên hàng trong sổ vào dòng dự toán |
| **Đầu mối** | Danh sách đầu mối, nguồn thực tế, NCC thuộc đầu mối và số H / S / X / Z |
| **Mã nhóm** | Nhóm vật tư và NCC phụ trách |

Quyền: xem cần quyền **đọc** công trình; thêm dòng cần **tạo**; sửa, xóa, sửa H / S / X / Z cần **sửa**.

Công trình bắt đầu dùng tab này bằng **một lần import** file "Cân đối vật tư" (admin làm). Sau đó mọi thay đổi làm trên màn hình, không import lại.

---

## 2. Nhập Sổ

### 2.1 Hóa đơn

1. Mở **Hóa đơn**. Dòng trên cùng là tổng: số dòng, tiền chưa VAT, VAT, gồm VAT.
2. Điền form: Ngày (dd/mm/yyyy), **Số HĐ**, **NCC**, **Tên hàng**, ĐVT, SL, Đơn giá, VAT %.
   - Để trống "Thành tiền chưa VAT" thì máy tính = SL × đơn giá; để trống "Tiền VAT" thì = thành tiền × VAT %.
3. Bấm **Thêm dòng**.

Lưu ý:
- **NCC chỉ chọn từ danh sách có sẵn.** NCC mới phải nhờ admin tạo ở Dữ liệu nền tảng (kèm MST).
- Sửa trực tiếp trên lưới: chọn ô, gõ, Enter. Mỗi lần chỉ ô vừa sửa được gửi đi.
- Dòng có tên hàng chưa gán hiện **"chưa gán — mở Ánh xạ"**. Dòng này vẫn được cộng vào mọi tổng.
- Mỗi dòng hóa đơn tự sinh một giao dịch HĐ ở các tab cũ (Giao dịch, Cân đối VT, Định mức, Công nợ NCC). Giao dịch đó chỉ đọc ở tab Giao dịch; muốn sửa thì sửa dòng hóa đơn.
- Nếu công trình còn giao dịch HĐ cũ chưa được thay bằng sổ, máy từ chối thêm hóa đơn và yêu cầu import file trước, để không cộng HĐ hai lần.

### 2.2 Thực tế nhập

1. Mở **Thực tế nhập**, điền Ngày, **Tên**, ĐVT, KL, Đơn giá (hoặc Thành tiền gồm VAT).
2. **Chọn Đầu mối** (bắt buộc với dòng mới). Thực tế của đầu mối trên DT-TT / HĐ-TT cộng từ các dòng gắn đầu mối đó.
3. Bấm **Thêm dòng**. Dòng tổng ghi cả số dòng cũ chưa gắn đầu mối (không cộng vào đầu mối nào).

### 2.3 Chi thực tế

1. Mở **Chi thực tế**, điền Ngày, **Nội dung**, Chuyển khoản và/hoặc Tiền mặt, **Mục** (I–IV).
2. Chọn Đầu mối và NCC nếu khoản chi thuộc về họ (NCC dùng cho cột G "đã trả theo sổ chi" của HĐ-TT).
3. Bấm **Thêm khoản chi**.

Ngày gõ sai định dạng bị từ chối với thông báo "Ngày không hợp lệ — nhập dd/mm/yyyy"; số gõ sai cũng bị từ chối, không lưu thành ô trống.

---

## 3. Ánh Xạ Tên Mới

1. Mở **Ánh xạ**. Ba tab Dự toán / Hóa đơn / Thực tế nhập; tab nào có tên chưa gán thì hiện số **"chưa gán"**.
2. Lọc **Chưa gán**, bấm **Gán** ở dòng cần gán.
3. Chọn **Mã nhóm**, rồi **Dòng DT** (danh sách lọc theo nhóm), nhập **Hệ số** nếu đơn vị khác dự toán (trống = theo giá trị).
4. Bấm **Xác nhận** (hoặc **Lưu đề xuất**, hoặc **Ngoài DT** nếu hàng không có trong dự toán).

Sau khi gán, dòng hóa đơn chuyển từ Phần B vào dòng dự toán trên DT-HĐ, và giao dịch HĐ ở tab cũ chuyển sang hạng mục / mã của dòng dự toán đó.

Nút **Xác nhận … đề xuất đang hiện** xác nhận hàng loạt các đề xuất đang lọc; đề xuất trỏ tới dòng dự toán không còn bị bỏ qua và được báo lại.

---

## 4. Đầu Mối, Nguồn Thực Tế và H / S / X / Z

Mỗi đầu mối là một dòng Phần II của DT-TT. Cột **Nguồn thực tế** chọn cách tính thực tế:
- **Σ thực tế nhập**: cộng các dòng Thực tế nhập gắn đầu mối;
- **Σ HĐ × (1+VAT)**: theo hóa đơn của các NCC thuộc đầu mối;
- **Σ chi thực tế**: theo sổ chi (có thể giới hạn theo một mục chi);
- **Số chốt nhập tay**: dùng số ở cột "Số chốt tay".

Bảng **NCC của đầu mối** (mỗi NCC một dòng HĐ-TT) có các ô nhập tay, cần quyền **sửa**:
- **H — thực nộp rà soát**: nếu nhập, cột I "đã trả" của HĐ-TT dùng H thay cho số theo sổ chi (G). Để trống = theo sổ chi.
- **S — thực tế riêng**: thực tế tách cho NCC này khi một đầu mối có nhiều NCC. Để trống = theo quy tắc chia của HĐ-TT (NCC đầu nhận phần còn lại).
- **X — đã lấy về**: tiền đã lấy lại từ NCC; HĐ-TT tính Y còn phải lấy về = W − X.
- **Z — việc cần làm**: ghi chú việc cần làm, hiện ở cột cuối của HĐ-TT.

---

## 5. In và Xuất Báo Cáo

Trên DT-HĐ, DT-TT, HĐ-TT:
- **Xuất Excel**: tải file .xlsx, số là kiểu số, có các dòng kiểm "Khớp / Lệch".
- **Xuất PDF (In)**: mặc định A4 ngang, "Vừa ngang" và "Gọn" đã bật. HĐ-TT tự thu nhỏ còn 80 % để vừa khổ. In ở chế độ tối vẫn ra chữ đen trên giấy trắng.

Mọi dòng kiểm (✓ / ✗) phải ✓. Nếu có ✗, xem số "Δ" ở cuối dòng để biết lệch bao nhiêu.

---

## 6. Các Tab Cũ Lấy Hóa Đơn Từ Đâu

Khi công trình có sổ Hóa đơn:
- **Giao dịch** hiện băng "Công trình này có sổ Hóa đơn…": các giao dịch HĐ sinh từ sổ là chỉ đọc, bấm "Sửa ở sổ Hóa đơn" để sửa.
- **Cân đối VT**, **Định mức**: "Đã lấy HĐ" và SL HĐ lấy từ sổ Hóa đơn. "Thực tế đã nhập" ở Cân đối VT là 0, vì thực tế nằm ở DT-TT / HĐ-TT.
- **Công nợ NCC** chỉ cộng giao dịch "lấy hàng", nên thấp hơn tổng sổ đúng bằng phần máy móc và nhân công.

---

## 7. Xử Lý Sự Cố

| Thông báo | Cách xử lý |
|---|---|
| Không thấy NCC trong danh sách chọn | Nhờ admin tạo NCC ở Dữ liệu nền tảng, rồi tải lại trang |
| "Công trình còn N giao dịch HĐ cũ … Import file …" | Nhờ admin import file "Cân đối vật tư" của công trình trước |
| "… không còn trong công trình này — tải lại trang" | Dòng đã bị người khác xóa; tải lại trang |
| "Bạn không có quyền thao tác này trên công trình." | Nhờ admin cấp quyền tạo / sửa cho công trình |
| "Dòng DT đã chọn không còn trong dự toán …" | Ở Ánh xạ, chọn lại Dòng DT trước khi xác nhận |
| Admin không hoàn tác được lần import | Bình thường sau khi đã nhập / sửa trên màn hình; sửa tiếp trên màn hình |
