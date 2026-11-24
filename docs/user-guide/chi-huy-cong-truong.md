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
4. Trong công trình, các tab gom thành **7 nhóm** ở hàng trên: Tổng quan, Tiến độ & nghiệm thu, Dự toán, Đối chiếu DT-HĐ-TT, Vật tư & công nợ, Hợp đồng & dòng tiền, Cài đặt. Bấm nhóm, rồi chọn tab ở hàng dưới (vd. nhóm **Tiến độ & nghiệm thu** → tab **Tiến Độ**). Nhóm và tab đang mở được tô đậm.

![Danh sách dự án](../screenshots/du-an-list.png)

---

## 4. Dashboard Công Trình và Đối Chiếu DT-HĐ-TT

### 4.1 Thẻ "Thực tế (sổ DT-HĐ-TT)" trên Dashboard

Vào công trình là mở **Dashboard** (nhóm Tổng quan). Hàng thẻ trên cùng gồm: Tiến độ, Dự toán gốc, Hóa đơn đã lấy, Thực tế, CĐT đã trả.

Công trình đã chuyển sang sổ Đối chiếu DT-HĐ-TT (đã import file "Cân đối vật tư", hoặc đã có dòng trong sổ Hóa đơn) có thẻ thực tế tên là **"Thực tế (sổ DT-HĐ-TT)"**:
- **Số lớn**: thực tế toàn công trình. Số này bằng đúng số "Thực tế toàn công trình (Phần III)" trên trang Tổng quan.
- **Dòng phụ**: "Gxd … · Chênh DT − TT …", tức dự toán sau thuế và chênh dự toán trừ thực tế. Khi số thực tế chưa đủ, dòng phụ có thêm "· thực tế chưa đủ".
- **Bấm vào thẻ** để mở trang Tổng quan của Đối chiếu DT-HĐ-TT.

Màu viền thẻ:

| Màu | Khi nào | Nghĩa |
|---|---|---|
| Đỏ | Chênh DT − TT âm | Thực tế đã vượt dự toán. Màu đỏ đứng trước màu vàng: phần thực tế còn thiếu chỉ làm chênh hiện tại cao hơn thật, nên khi đủ số thì mức vượt chỉ lớn thêm |
| Vàng | Chênh không âm, nhưng số thực tế chưa đủ: chưa có đầu mối NCC / tổ nhân công nào, còn thực tế nhập chưa gắn đầu mối, hoặc có đầu mối chưa chốt thực tế | Chưa kết luận được là tiết kiệm. Mở Tổng quan, xem mục "Việc cần làm" |
| Xanh | Các trường hợp còn lại | Thực tế đã đủ và chưa vượt dự toán |

Công trình chưa dùng sổ thì giữ thẻ cũ **"Thực tế (đã nhập)"**, với dòng "Biến động: …%". Nếu tạm thời không đọc được sổ, Dashboard cũng hiện thẻ cũ này. Các thẻ khác của Dashboard không đổi.

### 4.2 Trang Tổng quan

Vào bằng cách bấm thẻ ở trên, hoặc bấm nhóm **Đối chiếu DT-HĐ-TT** ở hàng trên. Trang này chỉ để xem. Từ trên xuống:

1. **Số chính**, ba hàng thẻ. Bấm thẻ để mở báo cáo chứa số đó.
   - Dự toán – thực tế (sau thuế): Dự toán (Gxd, sau thuế), Thực tế toàn công trình (Phần III), Chênh DT − TT (viền đỏ khi âm).
   - Hóa đơn – thực tế (gồm VAT): Σ E hóa đơn, Σ T thực tế các NCC có HĐ, Σ U còn phải lấy HĐ.
   - Thanh toán (gồm VAT): Σ I đã trả, Σ V nợ thực tế, Σ Y còn phải lấy về.
2. **Đầu mối vượt dự toán** (mục 4.3).
3. **Việc cần làm**: các việc còn tồn, mỗi việc kèm số đếm và nút mở đúng màn đã lọc sẵn. Phần lớn là việc của đội (gán tên hàng, gắn đầu mối) và kế toán (cột Z). Chỉ huy dùng danh sách này để nhắc việc. Không còn việc thì trang ghi "Không còn việc nào cần làm."
4. **Kiểm tổng: n/n khớp**: bấm để xem dòng đối soát nào lệch.
5. **Báo cáo đầy đủ**: nút Mở hoặc Xuất Excel cho DT-HĐ, DT-TT, HĐ-TT.

Lưu ý khi đọc:
- **Hai số thực tế khác nhau.** "Thực tế toàn công trình (Phần III)" gồm mọi đầu mối: NCC, tổ nhân công, khoản khác. "Thực tế các NCC có HĐ (Σ T)" chỉ gồm các NCC có hóa đơn. Đừng so trực tiếp hai số này.
- **Σ U bù trừ giữa các NCC.** NCC thừa hóa đơn bù cho NCC thiếu hóa đơn. Ví dụ Công ty A thiếu 1.500.000, Công ty B thừa 1.500.000 thì Σ U = 0, dù Công ty A vẫn phải lấy thêm hóa đơn. Bấm thẻ Σ U để xem đúng các NCC còn phải lấy hóa đơn (U > 0).

### 4.3 Đầu mối cần chú ý

Khối **Đầu mối vượt dự toán** liệt kê các đầu mối NCC và tổ nhân công (DT-TT Phần II A, B) có thực tế vượt dự toán, vượt nhiều nhất lên trước. Số tiền gồm VAT. Cột: Đầu mối, Loại, Dự toán gồm VAT, Thực tế gồm VAT, Chênh DT − TT (kèm huy hiệu "Vượt").
- Bảng hiện 5 đầu mối. Bấm **Xem thêm n đầu mối** để mở thêm, tối đa 10.
- Bấm tên đầu mối để mở DT-TT ngay tại dòng của đầu mối đó.
- **n đầu mối chưa chốt thực tế**: mở trang Đầu mối, lọc các đầu mối chưa chốt. Các đầu mối này chưa có số thực tế, nên chưa biết có vượt hay không.
- **Xem đủ Phần II**: mở toàn bộ Phần II của DT-TT.
- Không có đầu mối nào vượt thì huy hiệu ghi "Không đầu mối nào vượt".

Khoản khác (Phần II C) không có dự toán nên không xét ở đây.

Hướng dẫn chi tiết: [Đối chiếu DT-HĐ-TT](doi-chieu-dt-hd-tt.md), mục 2.

---

## 5. Theo Dõi Tiến Độ Thi Công

### 5.1 Xem tiến độ hiện tại

1. Vào dự án → Tab **Tiến Độ**
2. Bảng hiển thị các mốc thi công: tên, ngày KH, ngày TH, % hoàn thành, trạng thái

**Ý nghĩa màu sắc:**
- Xanh lá: hoàn thành đúng hạn
- Vàng: đang thi công
- Đỏ: trễ hạn

### 5.2 Thêm mốc tiến độ

1. Tab **Tiến Độ** → Click **Thêm mốc**
2. Điền:
   - Tên mốc: "Xong phần móng", "Xong thô tầng 1"...
   - Ngày KH bắt đầu / kết thúc
   - Trọng số (% so với tổng dự án)
3. **Lưu**

### 5.3 Cập nhật tiến độ thực tế

1. Tìm mốc cần cập nhật
2. Click **Edit**
3. Nhập **ngày TH thực tế** và **% hoàn thành**
4. **Lưu**

![Cập nhật tiến độ](../screenshots/du-an-tien-do.png)

---

## 6. Nghiệm Thu

### 6.1 Tạo phiếu nghiệm thu

1. Tab **Nghiệm Thu** → Click **Thêm nghiệm thu**
2. Điền:
   - Mốc liên quan
   - Ngày nghiệm thu
   - % hoàn thành được nghiệm thu
   - Ghi chú / biên bản
3. **Lưu**

### 6.2 Xem lịch sử nghiệm thu

1. Tab **Nghiệm Thu** → Danh sách theo thứ tự thời gian
2. Mỗi nghiệm thu hiển thị: ngày, hạng mục, %, người tạo

---

## 7. Xem Hợp Đồng

1. Vào dự án → Tab **Hợp Đồng**
2. Danh sách hợp đồng: nhà thầu, giá trị, ngày ký
3. Click vào hợp đồng để xem chi tiết điều khoản

> Chỉ huy công trường xem được, không thêm/sửa hợp đồng (admin thực hiện).

---

## 8. Phát Sinh (Change Orders)

1. Tab **Phát Sinh** → xem danh sách phát sinh
2. Mỗi phát sinh: mô tả, số tiền, lý do, ngày phê duyệt
3. Tổng phát sinh hiển thị ở cuối bảng

---

## 9. Xem Dự Toán

1. Tab **Dự Toán** → xem danh sách hạng mục dự toán
2. Cột: Hạng mục | Đơn vị | KL | Đơn giá | Thành tiền
3. Tổng dự toán hiển thị ở cuối

---

## 10. SL/DT — Tiến Độ Xây Dựng

1. Menu → **SL/DT > Tiến Độ XD**
2. Xem timeline tiến độ tổng hợp tất cả dự án
3. So sánh KH vs TH theo tháng

---

## 11. Xử Lý Sự Cố

| Vấn đề | Giải pháp |
|--------|-----------|
| Không thấy dự án của mình | Liên hệ admin kiểm tra dự án đã được tạo chưa |
| Không thêm được mốc tiến độ | Kiểm tra quyền chihuy_ct. Nếu vẫn không được, liên hệ admin |
| Ngày nghiệm thu không lưu | Kiểm tra định dạng ngày: DD/MM/YYYY |
| % hoàn thành không cập nhật | Thử F5 tải lại trang |
| Thẻ "Thực tế (sổ DT-HĐ-TT)" viền vàng | Số thực tế chưa đủ. Mở Tổng quan, nhắc đội / kế toán làm các việc trong "Việc cần làm" |
| Số thực tế trên Dashboard khác Σ T của HĐ-TT | Bình thường: hai số cộng các dòng khác nhau (mục 4.2) |

---

## 12. FAQ

**Q: Tôi thấy dự án khác không phải của mình?**  
A: Hiện tại hệ thống hiển thị tất cả dự án. Lọc theo tên hoặc mã dự án.

**Q: Cần thêm mốc tiến độ nhưng không có quyền?**  
A: Liên hệ admin nâng quyền hoặc nhờ admin thêm hộ.

**Q: Nghiệm thu ghi lại được không nếu nhập sai ngày?**  
A: Có, click Edit để sửa. Mọi thay đổi đều được audit log ghi lại.

**Q: Có in được biên bản nghiệm thu không?**  
A: Chức năng in sẽ bổ sung trong Phase 2. Hiện tại chụp màn hình hoặc export dữ liệu.

**Q: In trang Tổng quan Đối chiếu DT-HĐ-TT được không?**  
A: Trang Tổng quan không có nút In. Mở DT-HĐ, DT-TT hoặc HĐ-TT rồi bấm **In**. Bản in luôn là báo cáo đầy đủ, không theo bộ lọc trên màn hình.
