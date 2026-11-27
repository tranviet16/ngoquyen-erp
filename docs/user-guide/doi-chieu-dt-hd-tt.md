# Hướng Dẫn Sử Dụng — Đối Chiếu DT-HĐ-TT (Dự án xây dựng)

**Dành cho:** đội công trình (nhập sổ, ánh xạ), kế toán (rà soát số đã trả, nhập H / S / X / Z, xuất báo cáo), chỉ huy / lãnh đạo (xem Tổng quan)
**Vị trí:** Dự án xây dựng → chọn công trình → nhóm **Đối chiếu DT-HĐ-TT** (mở ra trang **Tổng quan**)

---

## 1. Tổng Quan

Tab này thay file Excel "Cân đối vật tư" của đội. Nó có trang Tổng quan, ba báo cáo, ba sổ nhập liệu và ba màn thiết lập.

### 1.1 Thanh điều hướng của công trình

Các tab của một công trình gom thành **7 nhóm** ở hàng trên. Hàng dưới là các tab của nhóm đang mở. Nhóm và tab đang mở được tô đậm. Đường dẫn của từng tab giữ nguyên như trước, nên link cũ vẫn mở đúng trang.

| Nhóm (hàng trên) | Tab (hàng dưới) |
|---|---|
| Tổng quan | Dashboard |
| Tiến độ & nghiệm thu | Tiến Độ, Nghiệm Thu |
| Dự toán | Dự Toán, DT Điều Chỉnh, Phát Sinh (CO) |
| Đối chiếu DT-HĐ-TT | thanh mục riêng (mục 1.2) |
| Vật tư & công nợ | Giao Dịch, Cân Đối VT, Định Mức, Công Nợ NCC |
| Hợp đồng & dòng tiền | Hợp Đồng, Dòng Tiền 3 Bên |
| Cài đặt | không có hàng tab |

Bấm một nhóm là mở tab đầu tiên của nhóm đó.

### 1.2 Các mục của Đối chiếu DT-HĐ-TT

Hàng dưới của nhóm Đối chiếu DT-HĐ-TT chia thành bốn cụm:

| Cụm | Mục | Dùng để |
|---|---|---|
| — | **Tổng quan** | Số chính, đầu mối vượt dự toán, việc cần làm, kiểm tổng (mục 2) |
| Báo cáo | **DT-HĐ** | So dự toán với hóa đơn đã lấy, theo từng đầu mối và Mã nhóm |
| | **DT-TT** | So dự toán với thực tế (Phần I theo vật tư, Phần II theo đầu mối, Phần III tổng dự toán) |
| | **HĐ-TT** | So hóa đơn với tiền đã trả và thực tế, theo từng NCC. Kế toán nhập H / S / X / Z ngay tại đây |
| Nhập sổ | **Hóa đơn** | Sổ hóa đơn đầu vào (mỗi dòng hàng một dòng) |
| | **Thực tế nhập** | Khối lượng / tiền thực tế nhận về công trường |
| | **Chi thực tế** | Các khoản chi (chuyển khoản, tiền mặt), theo mục I–IV |
| Thiết lập | **Ánh xạ** | Gán tên hàng trong sổ vào dòng dự toán |
| | **Đầu mối** | Danh sách đầu mối, nguồn thực tế, NCC thuộc đầu mối và số H / S / X / Z |
| | **Mã nhóm** | Nhóm vật tư và NCC phụ trách |

**Huy hiệu "chưa gán".** Cạnh chữ **Ánh xạ** có một số trên nền vàng. Đó là số tên (của Dự toán, Hóa đơn và Thực tế nhập) chưa gán vào dòng dự toán. Rê chuột lên số để xem chú thích. Khi không còn tên nào chưa gán, số này biến mất. Số được đếm riêng, nên trang vẫn mở ngay cả khi chưa đếm xong.

### 1.3 Quyền và lần import đầu

Quyền: xem cần quyền **đọc** công trình; thêm dòng cần **tạo**; sửa, xóa, sửa H / S / X / Z cần **sửa**.

Công trình bắt đầu dùng tab này bằng **một lần import** file "Cân đối vật tư" (admin làm). Sau đó mọi thay đổi làm trên màn hình, không import lại.

---

## 2. Trang Tổng Quan

Bấm nhóm **Đối chiếu DT-HĐ-TT** là vào thẳng trang **Tổng quan đối chiếu DT-HĐ-TT**. Trang này dành cho chỉ huy và lãnh đạo, chỉ để xem. Mỗi con số và mỗi việc đều bấm được để mở đúng chỗ cần xem hoặc cần sửa.

Trang gồm, từ trên xuống: số chính, đầu mối vượt dự toán, việc cần làm, kiểm tổng, lối tắt ba báo cáo.

### 2.1 Số chính

Chín thẻ xếp thành ba hàng. Dòng chữ nhỏ dưới mỗi số ghi số đó lấy từ đâu và đã gồm VAT hay chưa.

| Hàng | Thẻ | Nghĩa | Cơ sở VAT | Bấm vào mở |
|---|---|---|---|---|
| Dự toán – thực tế | **Dự toán (Gxd, sau thuế)** | Tổng dự toán, dòng Gxd của DT-TT Phần III | Sau thuế | DT-TT, Phần III |
| | **Thực tế toàn công trình (Phần III)** | Thực tế của cả công trình (mục 2.2) | Dòng Gxd: cộng thực tế gồm VAT của các đầu mối | DT-TT, Phần III |
| | **Chênh DT − TT** | Dự toán trừ thực tế. Dương là tiết kiệm, âm là vượt | Sau thuế | DT-TT, Phần III |
| Hóa đơn – thực tế | **Hóa đơn gồm VAT (Σ E)** | Tổng hóa đơn của mọi NCC | Gồm VAT | HĐ-TT |
| | **Thực tế các NCC có HĐ (HĐ-TT Σ T)** | Tổng thực tế, chỉ của các NCC có hóa đơn (mục 2.2) | Gồm VAT | HĐ-TT |
| | **Còn phải lấy HĐ: Σ T − Σ E, bù trừ giữa các NCC** | Σ U (mục 2.3) | Gồm VAT | HĐ-TT, lọc "Còn phải lấy HĐ (U > 0)" |
| Thanh toán | **Đã trả (Σ I)** | Tổng đã trả cho các NCC | Gồm VAT | HĐ-TT |
| | **Nợ thực tế (Σ V)** | Tổng thực tế trừ đã trả | Gồm VAT | HĐ-TT |
| | **Còn phải lấy về (Σ Y)** | Tiền còn phải lấy lại từ NCC | Gồm VAT | HĐ-TT, lọc "Còn phải lấy về (Y > 0)" |

Màu viền thẻ:
- **Chênh DT − TT**: đỏ khi âm (vượt dự toán), xanh khi không âm.
- **Σ U** và **Σ Y**: vàng khi lớn hơn 0 (còn việc phải theo dõi).

Mọi số là ô có sẵn của báo cáo, làm tròn đồng như bản in. Trang không tạo ra tổng nào mới.

### 2.2 Hai số "thực tế" khác nhau

Trang có hai số thực tế. **Đừng so trực tiếp hai số này**, vì chúng cộng những dòng khác nhau:

| | Thực tế toàn công trình (Phần III) | Thực tế các NCC có HĐ (HĐ-TT Σ T) |
|---|---|---|
| Gồm | Mọi đầu mối: NCC (Phần II A), tổ nhân công (Phần II B), khoản khác mục I và II (Phần II C) | Chỉ các NCC có hóa đơn, mỗi NCC một dòng HĐ-TT |
| Đầu mối chưa chốt thực tế | Chưa có số, nên chưa được cộng | Tạm lấy bằng hóa đơn (huy hiệu "tạm = HĐ") |
| NCC chưa thuộc đầu mối | Không có | Thực tế = 0 |

Ví dụ: một tổ nhân công có thực tế 1.500.000 thì có trong số Phần III nhưng không có trong Σ T, vì tổ đó không xuất hóa đơn.

### 2.3 Σ U bù trừ giữa các NCC

**Còn phải lấy HĐ (Σ U)** là tổng của U = T − E trên mọi NCC. NCC có hóa đơn nhiều hơn thực tế (U âm) sẽ bù vào NCC còn thiếu hóa đơn (U dương). Vì vậy Σ U có thể nhỏ, bằng 0 hoặc âm, trong khi vẫn còn NCC phải lấy thêm hóa đơn.

Ví dụ: Công ty A có U = +1.500.000, Công ty B có U = −1.500.000. Khi đó Σ U = 0, nhưng Công ty A vẫn còn phải lấy 1.500.000 tiền hóa đơn.

Bấm thẻ Σ U để mở HĐ-TT, lọc sẵn **"Còn phải lấy HĐ (U > 0)"**. Màn này chỉ hiện các NCC thật sự còn phải lấy hóa đơn. Dòng tổng ở cuối bảng vẫn là tổng của cả bảng (mục 6.2), không phải tổng các dòng đang hiện.

### 2.4 Đầu mối vượt dự toán

Đây là khối "đầu mối cần chú ý". Nó lấy các đầu mối ở DT-TT Phần II A (NCC) và B (tổ nhân công) có **chênh DT − TT âm**, xếp đầu mối vượt nhiều nhất lên trước. Số tiền tính gồm VAT. Khối C (khoản khác) không xét, vì khối này không có dự toán.

- Huy hiệu bên phải: "n đầu mối vượt", hoặc "Không đầu mối nào vượt".
- Bảng hiện 5 đầu mối đầu tiên. Bấm **Xem thêm n đầu mối** để xem tiếp, tối đa 10.
- Bấm tên đầu mối để mở DT-TT ngay tại dòng của đầu mối đó (dòng được tô sáng).
- **n đầu mối chưa chốt thực tế**: mở trang Đầu mối, lọc sẵn các đầu mối chưa chốt.
- **Xem đủ Phần II**: mở DT-TT tại Phần II.

### 2.5 Việc cần làm

Mỗi việc là một dòng, gồm số đếm (hoặc số tiền), tên việc và nút đi sửa. Việc nào bằng 0 thì ẩn. Khi không còn việc nào, trang ghi "Không còn việc nào cần làm."

Bấm nút đi sửa sẽ mở đúng màn, **lọc sẵn đúng các dòng đã đếm**.

| Việc | Nút | Mở ra |
|---|---|---|
| Tên hóa đơn / thực tế nhập / dự toán chưa gán | Gán ở Ánh xạ | Ánh xạ, đúng tab, lọc "Chưa gán" |
| Đề xuất hóa đơn / thực tế nhập / dự toán chờ xác nhận | Xác nhận ở Ánh xạ | Ánh xạ, đúng tab, lọc "Đề xuất" |
| Khóa hóa đơn / thực tế nhập chưa có hệ số | Nhập hệ số ở Ánh xạ | Ánh xạ, đúng tab, lọc "Chưa có hệ số" |
| Thực tế nhập chưa gắn đầu mối (số tiền gồm VAT) | Gắn đầu mối ở Thực tế nhập | Thực tế nhập, lọc Đầu mối = "(chưa gắn)" |
| Đầu mối chưa chốt thực tế | Chốt ở Đầu mối | Đầu mối, nhãn "Đang lọc: chưa chốt" |
| NCC có HĐ nhưng chưa thuộc đầu mối | Gắn ở Đầu mối | Bảng NCC của trang Đầu mối, lọc "— Không thuộc đầu mối —" |
| NCC có số ở HĐ-TT nhưng chưa có dòng NCC | Thêm dòng ở Đầu mối | Thông báo "Có số ở HĐ-TT nhưng chưa có dòng: …" trên trang Đầu mối |
| Dự toán chưa có loại VL / NC / MTC (số tiền chưa VAT) | Xem ở Dự toán | Tab Dự Toán, chỉ hiện các dòng đó. Sửa hạng mục của dòng sang mã có đuôi -VL / -NC / -MAY để báo cáo xếp loại |
| Chưa cài đặt tỷ lệ (đang dùng tỷ lệ mặc định) | Mở Cài đặt | Tab Cài đặt |
| Việc cần làm của kế toán (cột Z) | Xem ở HĐ-TT | HĐ-TT, lọc "Có việc cần làm (Z)" |

### 2.6 Kiểm tổng

Dòng **Kiểm tổng: n/n khớp** gom mọi dòng đối soát của ba báo cáo. Bấm vào dòng này để mở ra:
- ba huy hiệu "DT-HĐ: …", "DT-TT: …", "HĐ-TT: …" cho biết mỗi báo cáo khớp bao nhiêu dòng;
- mỗi dòng lệch ghi số lệch và có link **Xem ở DT-HĐ / DT-TT / HĐ-TT**. Dòng lệch của một khối DT-HĐ mở DT-HĐ lọc đúng đầu mối đó.

### 2.7 Báo cáo đầy đủ

Mỗi báo cáo có hai nút: **Mở** (sang màn báo cáo) và **Xuất Excel** (tải file). Trang Tổng quan không có nút In. Muốn in thì mở màn báo cáo (mục 8).

---

## 3. Bộ Lọc và Link Chia Sẻ

Bộ lọc của các màn sửa việc được **ghi lên đường dẫn (URL)** trên thanh địa chỉ. Nhờ vậy:
- **tải lại trang (F5)** vẫn giữ nguyên bộ lọc;
- **bấm Back** để quay về thì bộ lọc vẫn như lúc rời đi;
- bộ lọc vẫn còn sau khi bấm "Thêm dòng" hoặc sửa một ô;
- **chép đường dẫn gửi người khác**, người đó mở ra thấy đúng màn đã lọc. Người nhận cần có quyền đọc công trình.

| Màn | Lọc được theo |
|---|---|
| Hóa đơn | NCC, Số HĐ, Ánh xạ ("chưa gán") |
| Thực tế nhập | Tên, Đầu mối (có lựa chọn "(chưa gắn)"), Ánh xạ ("chưa gán") |
| Chi thực tế | Nội dung, Đầu mối và NCC (cả hai có lựa chọn "(trống)") |
| Đầu mối | Bảng đầu mối: tên, "chưa chốt" (chỉ đến từ link). Bảng NCC: tên NCC, Đầu mối (có "— Không thuộc đầu mối —") |
| Ánh xạ | Tab, trạng thái, ô tìm, một khóa đang mở |
| Dự toán | "Chưa có loại VL / NC / MTC" (chỉ đến từ link Tổng quan / DT-TT) |
| DT-HĐ | Tình trạng, đầu mối, các đầu mối đang mở, công tắc "Hiện dòng hóa đơn" |
| HĐ-TT | Còn phải lấy HĐ, Còn phải lấy về, Có việc cần làm |
| DT-TT | Vị trí Phần I / II / III hoặc dòng một đầu mối |

Cách dùng:
- Ở ba sổ và trang Đầu mối, ô lọc nằm ngay trên đầu cột của lưới. Cột chữ có ô "Tìm...", cột chọn có danh sách bắt đầu bằng "Tất cả".
- Khi đang lọc, màn hiện nhãn "Đang lọc: …". Bấm **Bỏ lọc** để về danh sách đầy đủ.
- Đổi bộ lọc trên lưới sẽ bỏ chọn các dòng đang chọn, để thao tác xóa không trúng nhầm dòng khác.

Những thứ **không** ghi lên đường dẫn: ô tìm theo tên và các nhóm đang mở trên DT-HĐ, chế độ nhập của HĐ-TT, các nhóm đang mở ở DT-TT Phần I. Tải lại trang thì những thứ này về mặc định.

---

## 4. Nhập Sổ

### 4.1 Ô chọn có tìm

Bốn loại ô chọn dài nay gõ để tìm được: **NCC** (Hóa đơn, Chi thực tế), **Đầu mối** (Thực tế nhập, Chi thực tế), **Mã nhóm** và **Dòng DT** (Ánh xạ).

- Gõ vài chữ để lọc danh sách. Gõ không dấu cũng được: "cong ty a" tìm ra "Công ty A", "da" tìm ra cả "Đá".
- Mục khớp đầu tiên được tô sẵn. ↓ mở danh sách, ↑ / ↓ chọn mục, **Enter** chọn mục đang tô, **Esc** đóng danh sách.
- Khi danh sách đang mở, Enter **chỉ chọn mục**, không bao giờ gửi form. Kể cả khi không có mục nào khớp ("Không có lựa chọn nào khớp"), Enter cũng không gửi form với NCC cũ.
- Khi danh sách đã đóng, Enter gửi form như các ô khác.
- Không có ô "tạo mới". NCC mới do admin tạo ở Dữ liệu nền tảng; đầu mối mới tạo ở trang **Đầu mối**; mã nhóm mới tạo ở trang **Mã nhóm**.

### 4.2 Form thêm dòng

Form thêm dòng của ba sổ gồm hai hàng ô, nằm trên lưới. Lưới chiếm phần còn lại của cửa sổ.
- Bấm **Thu gọn** (cuối hàng hai) để thu form về một dòng "… — đã thu gọn". Bấm **Mở form** để mở lại.
- Mỗi sổ nhớ riêng trạng thái thu gọn trên máy và trình duyệt đang dùng.
- Sau khi thêm, form giữ lại các ô thường lặp lại và đưa con trỏ về ô cần gõ tiếp (bảng dưới).

| Sổ | Giữ lại sau khi thêm | Con trỏ về |
|---|---|---|
| Hóa đơn | Ngày, Số HĐ, NCC, VAT % | Tên hàng |
| Thực tế nhập | Ngày, Đầu mối | Tên |
| Chi thực tế | Ngày, Mục | Nội dung |

Nhờ vậy, nhập nhiều dòng hàng của cùng một hóa đơn chỉ cần gõ phần dòng hàng rồi Enter.

### 4.3 Hóa đơn

1. Mở **Hóa đơn**. Dòng trên cùng là tổng: số dòng, tiền chưa VAT, VAT, gồm VAT.
2. Hàng một của form: Ngày (dd/mm/yyyy), **Số HĐ**, **NCC** (ô chọn có tìm), VAT %.
3. Hàng hai: **Tên hàng**, ĐVT, SL, Đơn giá, Thành tiền chưa VAT, Tiền VAT, Ghi chú.
   - Để trống "Thành tiền chưa VAT" thì máy tính = SL × đơn giá; để trống "Tiền VAT" thì = thành tiền × VAT %.
4. Bấm **Thêm dòng** (hoặc Enter).

Lưu ý:
- **NCC chỉ chọn từ danh sách NCC đang hoạt động.** NCC mới phải nhờ admin tạo ở Dữ liệu nền tảng (kèm MST).
- Sửa trực tiếp trên lưới: chọn ô, gõ, Enter. Mỗi lần chỉ ô vừa sửa được gửi đi.
- Dòng có tên hàng chưa gán hiện "chưa gán" ở cột **Ánh xạ**. Dòng này vẫn được cộng vào mọi tổng. Khi có dòng chưa gán, góc trên có nút **"n dòng chưa gán — mở Ánh xạ"**.
- Mỗi dòng hóa đơn tự sinh một giao dịch HĐ ở các tab cũ (Giao dịch nguồn Sổ dự án, Cân đối VT, Định mức). Giao dịch đó chỉ đọc ở tab Giao dịch; muốn sửa thì sửa dòng hóa đơn. Tab Công nợ NCC không dùng giao dịch này: tab đọc sổ Công nợ vật tư.
- Nếu công trình còn giao dịch HĐ cũ chưa được thay bằng sổ, máy từ chối thêm hóa đơn và yêu cầu import file trước, để không cộng HĐ hai lần.

### 4.4 Thực tế nhập

1. Mở **Thực tế nhập**. Hàng một của form: Ngày, **Đầu mối** (ô chọn có tìm, bắt buộc với dòng mới).
2. Hàng hai: **Tên**, ĐVT, KL, Đơn giá, Thành tiền gồm VAT (trống = KL × đơn giá), Ghi chú.
3. Bấm **Thêm dòng**.

Thực tế của đầu mối trên DT-TT / HĐ-TT cộng từ các dòng gắn đầu mối đó. Dòng tổng của sổ ghi cả số dòng cũ chưa gắn đầu mối; các dòng này không cộng vào đầu mối nào. Để tìm và gắn chúng, lọc cột Đầu mối = "(chưa gắn)".

Công trình chưa có đầu mối nào thì form không hiện, thay vào đó là lời nhắc tạo đầu mối trước.

### 4.5 Chi thực tế

1. Mở **Chi thực tế**. Hàng một của form: Ngày, **Mục** (I–IV, bắt buộc), **Nội dung**.
2. Hàng hai: Chuyển khoản và/hoặc Tiền mặt, **Đầu mối** và **NCC** (ô chọn có tìm, để "(không gắn)" nếu khoản chi không thuộc về ai), Ghi chú.
   - NCC dùng cho cột G "đã trả theo sổ chi" của HĐ-TT.
3. Bấm **Thêm khoản chi**.

Ngày gõ sai định dạng bị từ chối với thông báo "Ngày không hợp lệ — nhập dd/mm/yyyy"; số gõ sai cũng bị từ chối, không lưu thành ô trống.

---

## 5. Ánh Xạ Tên Mới

### 5.1 Tìm khóa cần gán

1. Mở **Ánh xạ**. Có ba tab **Dự toán / Hóa đơn / Thực tế nhập**. Tab nào còn tên chưa gán thì hiện "n chưa gán". Mở Ánh xạ mà không chọn tab thì máy mở tab đầu tiên còn tên chưa gán.
2. Dòng đầu ghi "n khóa chưa gán · số dòng · số tiền / tổng số khóa". Dòng chưa gán vẫn được cộng vào mọi tổng của báo cáo.
3. Lọc bằng ô **Tìm tên, ĐVT, NCC…** và ô trạng thái: Tất cả, Chưa gán, Đề xuất, Đã xác nhận, Ngoài DT, **Chưa có hệ số**. Hai trạng thái cuối chỉ có ở tab Hóa đơn và Thực tế nhập.
   - "Chưa có hệ số": khóa đã gán vào một Dòng DT nhưng chưa nhập hệ số.

### 5.2 Gán một khóa

1. Bấm **Gán** (khóa chưa gán) hoặc **Sửa** (khóa đã gán) ở dòng cần làm.
   - Danh sách thu lại chỉ còn khóa đó, kèm nhãn "Đang lọc: một khóa · Bỏ lọc".
   - Ô gán mở ngay dưới dòng, con trỏ nằm sẵn ở ô Dòng DT (tab Dự toán: ô Mã nhóm).
2. Dưới ô gán là **Dòng nguồn**: tối đa 20 dòng sổ mang tên|ĐVT này.
   - Tab Hóa đơn: NCC, Số HĐ, SL, Đơn giá, Thành tiền chưa VAT. Bấm số HĐ để mở sổ Hóa đơn, lọc đúng NCC và số HĐ đó.
   - Tab Thực tế nhập: Đầu mối, SL, Đơn giá, Thành tiền gồm VAT.
   - Tab Dự toán không có dòng nguồn.
3. Chọn **Mã nhóm** và **Dòng DT** bằng ô chọn có tìm (mục 4.1). Khi đã chọn Mã nhóm, danh sách Dòng DT chỉ còn các dòng của nhóm đó.
4. Nhập **Hệ số** nếu đơn vị khác dự toán (trống = theo giá trị).
5. Lưu bằng một trong các nút:

| Nút | Làm gì |
|---|---|
| **Lưu và sang dòng kế** (Ctrl+Enter) | Lưu như **Xác nhận**, rồi mở ngay khóa kế tiếp trong danh sách |
| **Xác nhận** | Lưu và xác nhận, rồi đóng ô gán |
| **Lưu đề xuất** | Lưu ở trạng thái Đề xuất, rồi đóng ô gán |
| **Ngoài DT** | Đánh dấu hàng không có trong dự toán (tab Hóa đơn, Thực tế nhập) |
| **Bỏ gán** | Đưa khóa về "chưa gán" (cần quyền sửa) |
| **Đóng** | Đóng ô gán, không lưu |

Đóng, Bỏ lọc hoặc lưu bằng nút thường đều đưa danh sách về như trước khi mở khóa.

Sau khi gán, dòng hóa đơn chuyển từ Phần B vào dòng dự toán trên DT-HĐ, và giao dịch HĐ ở tab cũ chuyển sang hạng mục / mã của dòng dự toán đó.

### 5.3 Gán liên tục với "Lưu và sang dòng kế"

Cách nhanh để gán nhiều khóa:
1. Lọc trạng thái **Chưa gán** (hoặc bấm việc "Tên … chưa gán" ở Tổng quan).
2. Bấm **Gán** ở khóa đầu tiên.
3. Chọn Dòng DT, gõ hệ số nếu cần, rồi nhấn **Ctrl+Enter** (máy Mac: ⌘+Enter) ở bất kỳ ô nào trong ô gán.
4. Máy lưu như Xác nhận và mở khóa kế tiếp. Lặp lại bước 3.

Khóa kế tiếp lấy theo danh sách **lúc trước khi lưu**, tức là theo tab, trạng thái và ô tìm đang chọn. Máy bỏ qua các khóa bạn không có quyền mở. Hết danh sách thì ô gán đóng và báo "Đã hết khóa trong danh sách đang lọc".

Nếu đang mở danh sách của một ô chọn, Enter chỉ chọn mục trong danh sách, không lưu.

### 5.4 Xác nhận hàng loạt và quyền

Nút **Xác nhận n đề xuất đang hiện** xác nhận hàng loạt các đề xuất đang lọc. Đề xuất trỏ tới dòng dự toán không còn thì bị bỏ qua và được báo lại.

Quyền: gán khóa chưa gán cần quyền **tạo**; sửa khóa đã gán, bỏ gán và xác nhận hàng loạt cần quyền **sửa**.

---

## 6. Xem Ba Báo Cáo Trên Màn Hình

Ba báo cáo có cách trình bày riêng cho màn hình, gọn và dễ đọc hơn. **Bản in và file Excel giữ nguyên như cũ** (mục 8).

### 6.1 DT-HĐ

Màn mở ra với **một dòng tóm tắt cho mỗi đầu mối**. Các cột: Dự toán, HĐ do NCC xuất, Trong nhóm mình, Ngoài DT, Ở nhóm khối khác, Thực tế chưa VAT, Còn phải lấy HĐ, Tình trạng dòng DT.
- Số tiền chưa VAT; thực tế chưa VAT = thực tế gồm VAT ÷ (1 + VAT).
- Cột "Tình trạng dòng DT" đếm dòng dự toán theo tình trạng: Vượt, Còn thiếu, Chưa có HĐ, Thiếu hệ số, Theo giá trị, Đủ. Tình trạng không có dòng nào thì ẩn.
- Huy hiệu đỏ **Lệch đối soát** chỉ hiện khi khối của đầu mối đó có dòng đối soát lệch.
- Đầu mối chưa chốt thực tế hiện chữ **chưa chốt** ở cột Thực tế. Bấm vào để mở trang Đầu mối, lọc các đầu mối chưa chốt.

Mở chi tiết:
1. Bấm tên đầu mối để mở các nhóm của đầu mối đó. Dòng chữ nhỏ ghi thực tế gồm VAT và dòng "Cộng khối" (DT, HĐ trong các nhóm, còn lại).
2. Bấm một nhóm để xem các dòng dự toán của nhóm.
3. Bật **Hiện dòng hóa đơn** để thấy từng dòng hóa đơn "↳" dưới dòng dự toán. Dòng hóa đơn chỉ gán tới nhóm mang nhãn "Chỉ gán tới nhóm".

Lọc:
- Chip **Tất cả / Còn thiếu / Vượt / Chưa có HĐ / Thiếu hệ số**, mỗi chip kèm số dòng. Bấm lại chip đang bật để tắt.
- Ô chọn **Tất cả đầu mối** để xem một đầu mối.
- Ô **Tìm vật tư, nhóm, đầu mối…**, gõ không dấu cũng được.
- Khi lọc, các đầu mối khớp tự mở, đầu mối không khớp bị ẩn. Dòng "Đang lọc: hiện n / m dòng · Bỏ lọc" đếm số dòng dự toán.
- **Tổng của nhóm và của đầu mối luôn là tổng đầy đủ của báo cáo**, không phải tổng các dòng đang hiện.

**Phần B** (hóa đơn ngoài dự toán / chưa gán dòng dự toán) ghi tổng Phần B chưa VAT và tách hai danh sách, mặc định thu gọn:
- **Chưa gán**: mỗi dòng có link **Gán ở Ánh xạ**, mở Ánh xạ đúng khóa tên|ĐVT của dòng đó.
- **Ngoài DT**: các dòng đã quyết định nằm ngoài dự toán, chỉ xem.

### 6.2 HĐ-TT

Bảng HĐ-TT nằm gọn trong một khung cuộn:
- dòng đầu bảng, cột **Nhà cung cấp** và dòng **TỔNG CỘNG** luôn đứng yên khi cuộn ngang hoặc dọc;
- tên NCC dài tối đa hai dòng, rê chuột để xem đủ tên;
- các NCC xếp theo đầu mối. Dòng đầu mối ghi số NCC, và chữ **chưa chốt thực tế** nếu đầu mối chưa chốt. NCC không thuộc đầu mối nào nằm dưới "Không thuộc đầu mối nào", với T = 0.

Đủ 13 cột tiền, chia bốn nhóm. Chữ cái của file đội ghi nhỏ sau tên cột. Rê chuột lên đầu cột để xem công thức.

| Nhóm cột | Cột |
|---|---|
| Hóa đơn | HĐ chưa VAT · VAT · HĐ gồm VAT (E) |
| Thanh toán | Đã trả theo sổ chi (G) · Đã trả (I) · Cần nộp thêm (J) · Đã nộp vượt (K) |
| Thực tế | Thực tế (T) · Thực tế − HĐ (U) · Nợ thực tế (V) |
| Lấy về | Sẽ lấy về (W) · Đã lấy về (X) · Còn phải lấy về (Y) |

Sau đó là **Đã trả / HĐ (L)** và **Việc cần làm (Z)**.

Huy hiệu cạnh số:
- **H**: cột Đã trả (I) đang theo số H nhập tay.
- **tạm = HĐ**: đầu mối chưa chốt thực tế, nên T tạm lấy bằng E.
- **tách**: T theo số S (thực tế riêng NCC) nhập tay.

Bấm số **E** để mở sổ Hóa đơn, lọc theo NCC đó. Bấm số **G** để mở sổ Chi thực tế, lọc theo NCC đó.

Lọc bằng chip **Còn phải lấy HĐ (U > 0)**, **Còn phải lấy về (Y > 0)**, **Có việc cần làm (Z)**. Khi đang lọc, dòng tổng đổi tên thành **"Tổng cộng (cả bảng)"**: nó vẫn là tổng của cả bảng, không phải tổng các dòng đang hiện.

Dưới bảng là dòng kiểm tổng Σ E và Σ T (mục 7.5).

Người có quyền sửa nhập H / S / X / Z ngay trên bảng này (mục 7.3).

### 6.3 DT-TT

- Thanh **Đến: Phần I · Phần II · Phần III** luôn nằm trên cùng khi cuộn. Bấm để nhảy tới phần đó.
- **Phần I**: mỗi nhóm vật tư chính một dòng tổng, bấm để mở các dòng của nhóm. Nhóm có dòng lệch đối soát mở sẵn. Nút **Mở tất cả / Thu gọn tất cả** mở hoặc đóng mọi nhóm.
- **Phần II**: chữ **chưa chốt** mở trang Đầu mối, lọc các đầu mối chưa chốt. Nếu có thực tế nhập chưa gắn đầu mối, cuối Phần II có dòng nhắc kèm link **Gắn đầu mối ở Thực tế nhập**.
- **Phần III**: nếu có dự toán chưa xác định loại VL / NC / MTC, cuối phần có dòng nhắc kèm link **Xem ở Dự toán**.
- Chênh âm hiện chữ đỏ.

---

## 7. Đầu Mối, Nguồn Thực Tế và H / S / X / Z

### 7.1 Nguồn thực tế

Mỗi đầu mối là một dòng Phần II của DT-TT. Cột **Nguồn thực tế** chọn cách tính thực tế:
- **Σ thực tế nhập**: cộng các dòng Thực tế nhập gắn đầu mối;
- **Σ HĐ × (1+VAT)**: theo hóa đơn của các NCC thuộc đầu mối;
- **Σ chi thực tế**: theo sổ chi (có thể giới hạn theo một mục chi);
- **Số chốt nhập tay**: dùng số ở cột "Số chốt tay". Để trống ô này thì đầu mối là **chưa chốt thực tế**, cột "Thực tế (báo cáo)" ghi "chưa chốt". Khi sửa ô này trên lưới, gõ số liền không dấu chấm (vd. 1500000).

Link "chưa chốt" từ Tổng quan, DT-HĐ, DT-TT, HĐ-TT đều mở trang này với nhãn **"Đang lọc: chưa chốt"**. Bấm **Bỏ lọc** để xem đủ.

### 7.2 Ý nghĩa H / S / X / Z

Bảng **NCC của đầu mối** (mỗi NCC một dòng HĐ-TT) có các ô nhập tay, cần quyền **sửa**:
- **H — thực nộp rà soát**: nếu nhập, cột I "đã trả" của HĐ-TT dùng H thay cho số theo sổ chi (G). Để trống = theo sổ chi.
- **S — thực tế riêng**: thực tế tách cho NCC này khi một đầu mối có nhiều NCC. Để trống = theo quy tắc chia của HĐ-TT (NCC đầu nhận phần còn lại). Chỉ nhập ở chỗ được phép (mục 7.4).
- **X — đã lấy về**: tiền đã lấy lại từ NCC; HĐ-TT tính Y còn phải lấy về = W − X.
- **Z — việc cần làm**: ghi chú việc cần làm, hiện ở cột cuối của HĐ-TT và được đếm ở việc "Việc cần làm của kế toán (cột Z)" của Tổng quan.

H, S, X nhập được ở hai nơi, với cùng một cách đọc số tiền (mục 7.3): trên **HĐ-TT** và trên bảng NCC của trang **Đầu mối**. Ở bảng NCC, gõ "1.500" nay là 1 500, giống HĐ-TT.

### 7.3 Nhập H / S / X / Z ngay trên HĐ-TT

1. Mở **HĐ-TT**, bấm **Nhập H / S / X / Z** (góc phải, trên bảng). Nút này chỉ hiện với người có quyền **sửa**.
2. Bảng thêm cột **Nhập H** (ngay trước cột Đã trả · I) và **Nhập S** (ngay trước cột Thực tế · T). Cột Đã lấy về · X và Việc cần làm · Z thành ô nhập.
3. Gõ số rồi:
   - **Enter**: lưu, rồi xuống ô cùng cột ở dòng kế tiếp;
   - **Tab**: sang ô kế bên (rời ô là lưu);
   - **Esc**: bỏ chữ vừa gõ, trả lại số đang lưu.
4. Xong thì bấm **Xong nhập**.

Cách gõ số tiền (H, S, X): dấu chấm hoặc khoảng trắng tách nghìn, dấu phẩy là thập phân. "1.500.000", "1 500 000" và "1500000" đều là một triệu năm trăm nghìn; "1.500" là một nghìn năm trăm. Xóa trắng ô rồi lưu là xóa số nhập tay. Z là chữ, tối đa 1 000 ký tự.

Ô nhập chỉ có ở dòng NCC đã có dòng ở trang Đầu mối. Dòng chưa có thì hiện link **Thêm dòng NCC ở Đầu mối**.

**Khi lưu không được** (gõ chữ không phải số, mất quyền, dòng NCC vừa bị người khác xóa…):
- ô viền đỏ, thông báo hiện ngay dưới ô (vd. `S thực tế riêng: "abc" không phải số`);
- **chữ đã gõ được giữ nguyên**. Lưu bằng Enter thì con trỏ ở lại ô để sửa ngay; đã rời ô (Tab, bấm ô khác) thì con trỏ đi theo bạn, ô đỏ vẫn giữ chữ để quay lại sửa sau;
- trên bảng có dòng "n ô chưa lưu được — xem thông báo dưới ô".

Lưu xong một ô, bảng tự tính lại (vd. T của NCC đầu trong đầu mối). Chữ đang gõ ở các ô khác không bị mất.

Chế độ nhập không ghi lên đường dẫn: tải lại trang thì bảng về chế độ xem.

### 7.4 Quy tắc S

S ghi đè mọi cách chia thực tế. Nhập S sai chỗ sẽ làm dòng kiểm Σ T của HĐ-TT lệch. Vì vậy trên HĐ-TT, **ô S chỉ nhập được ở NCC thứ hai trở đi của một đầu mối có nhiều NCC và đã chốt thực tế**. Ở các dòng khác, ô S bị khóa (màu xám); rê chuột lên ô để xem lý do:

| Lý do hiện khi rê chuột | Nghĩa | Cách làm |
|---|---|---|
| Gắn NCC vào đầu mối trước | NCC chưa thuộc đầu mối nào | Gắn NCC vào đầu mối ở trang Đầu mối |
| Đầu mối chỉ có một NCC | NCC này đã nhận toàn bộ thực tế của đầu mối | Không cần S |
| NCC đầu tiên nhận phần còn lại — nhập S ở NCC sau | NCC đầu được tính tự động | Nhập S ở các NCC sau của đầu mối |
| Đầu mối chưa chốt thực tế | Thực tế đầu mối đang tạm = HĐ | Chốt thực tế đầu mối ở trang Đầu mối trước |

Khi nhấn Enter ở cột Nhập S, con trỏ nhảy qua các dòng có ô S bị khóa.

### 7.5 Dòng kiểm Σ T báo lệch và nêu tên NCC

Dưới bảng HĐ-TT có hai dòng kiểm: Σ E (khớp sổ Hóa đơn) và Σ T (khớp thực tế các đầu mối). Khớp thì hiện một dòng chữ nhạt "Kiểm tổng khớp — …". Lệch thì hiện huy hiệu **Lệch đối soát**, số kỳ vọng ≠ số thực, và số lệch.

Khi Σ T lệch vì có số S đang lưu ở chỗ không được phép (thường là số từ lần import), dòng kiểm ghi thêm:

> … — do S ở dòng **Công ty A** (S chỉ giữ Σ T khớp ở NCC sau của đầu mối nhiều NCC đã chốt thực tế)

Cách sửa:
1. Bấm tên NCC trên dòng đó. Trang **Đầu mối** mở ra, bảng NCC đã lọc đúng tên NCC.
2. Ở cột **S thực tế riêng**, xóa số S (để trống) rồi Enter. Hoặc làm cho dòng đủ điều kiện: gắn NCC vào đầu mối, chốt thực tế đầu mối.
3. Quay lại HĐ-TT, dòng kiểm Σ T về khớp.

Ô S ở trang Đầu mối không bị khóa, để luôn sửa được số S cũ.

Dưới dòng kiểm, nếu Σ T khác tổng thực tế các đầu mối NCC vì lý do bình thường (đầu mối chưa chốt đang tạm = HĐ, đầu mối không có NCC xuất HĐ), màn hình ghi rõ từng khoản.

---

## 8. In và Xuất Báo Cáo

Bản in và file Excel **không đổi** so với trước khi có màn hình mới.

Trên DT-HĐ, DT-TT, HĐ-TT (góc phải trên):
- **Xuất Excel**: tải file .xlsx, số là kiểu số, có các dòng kiểm "Khớp / Lệch". Trang Tổng quan cũng có nút Xuất Excel cho từng báo cáo.
- **In**: chọn khổ giấy và hướng giấy; mặc định A4 ngang, "Vừa ngang" và "Gọn" đã bật. HĐ-TT tự thu nhỏ còn 80 % để vừa khổ. In ở chế độ tối vẫn ra chữ đen trên giấy trắng.

**Bản in và file Excel luôn là báo cáo đầy đủ**, bất kể trên màn hình đang lọc gì, đang mở hay thu gọn đầu mối nào, hay đang ở chế độ nhập. Tên cột trên giấy và trong Excel giữ như file của đội (E, G, I…); tên cột dễ đọc chỉ có trên màn hình.

Mọi dòng kiểm (✓ / ✗) phải ✓. Nếu có ✗, xem số "Δ" ở cuối dòng để biết lệch bao nhiêu.

---

## 9. Các Tab Cũ Lấy Hóa Đơn Từ Đâu

Khi công trình có sổ Hóa đơn:
- Hàng tab của nhóm **Vật tư & công nợ** ghi chú "Cân Đối VT, Định Mức và Giao Dịch (Sổ dự án) lấy HĐ từ sổ Hóa đơn; Công Nợ NCC và Giao Dịch (Sổ công nợ vật tư) lấy từ sổ Công nợ vật tư."
- **Giao dịch**, nguồn **Sổ dự án**, hiện băng "Công trình này có sổ Hóa đơn…": các giao dịch HĐ sinh từ sổ là chỉ đọc, bấm "Sửa ở sổ Hóa đơn" để sửa. Nguồn **Sổ công nợ vật tư** là các dòng sổ công nợ, không liên quan sổ Hóa đơn (xem hướng dẫn [Kế toán](ke-toan.md), mục "Công nợ vật tư trong trang Dự án").
- **Cân đối VT**, **Định mức**: "Đã lấy HĐ" và SL HĐ lấy từ sổ Hóa đơn. "Thực tế đã nhập" ở Cân đối VT là 0, vì thực tế nằm ở DT-TT / HĐ-TT.
- **Công nợ NCC** đọc sổ Công nợ vật tư (TT và HĐ, lũy kế, cộng mọi Chủ thể), không đọc sổ Hóa đơn hay giao dịch dự án. Số HĐ ở đây vì vậy có thể khác tổng sổ Hóa đơn.
- **Dashboard** của công trình: thẻ "Thực tế" đọc từ sổ, tên thẻ là "Thực tế (sổ DT-HĐ-TT)" (xem hướng dẫn [Chỉ huy công trường](chi-huy-cong-truong.md)).

---

## 10. Xử Lý Sự Cố

| Thông báo / hiện tượng | Cách xử lý |
|---|---|
| Không thấy NCC trong danh sách chọn | Gõ không dấu thử lại. Vẫn không có thì nhờ admin tạo NCC ở Dữ liệu nền tảng, rồi tải lại trang |
| Vừa thêm dòng nhưng không thấy trên lưới | Bộ lọc đang bật và dòng mới không khớp. Xóa ô lọc trên đầu cột, hoặc bấm Bỏ lọc |
| Nhấn Enter trong ô chọn mà form không gửi | Đúng thiết kế: danh sách đang mở thì Enter chỉ chọn mục. Enter lần nữa (danh sách đã đóng) để gửi |
| "Công trình còn N giao dịch HĐ cũ … Import file …" | Nhờ admin import file "Cân đối vật tư" của công trình trước |
| "… không còn trong công trình này — tải lại trang" | Dòng đã bị người khác xóa; tải lại trang. Trên HĐ-TT, chữ đã gõ vẫn còn trong ô để chép lại |
| "Bạn không có quyền thao tác này trên công trình." | Nhờ admin cấp quyền tạo / sửa cho công trình |
| Không thấy nút "Nhập H / S / X / Z" trên HĐ-TT | Cần quyền **sửa** công trình |
| Ô S trên HĐ-TT bị khóa (màu xám) | Rê chuột lên ô để xem lý do, rồi làm theo mục 7.4 |
| Ô trên HĐ-TT viền đỏ | Đọc thông báo dưới ô, sửa chữ rồi Enter lại |
| Dòng kiểm Σ T: "… do S ở dòng …" | Bấm tên NCC, xóa S ở trang Đầu mối (mục 7.5) |
| "Dòng DT đã chọn không còn trong dự toán …" | Ở Ánh xạ, chọn lại Dòng DT trước khi xác nhận |
| Sổ không ghi "chưa gán", nhưng Ánh xạ, Tổng quan và số trên mục Ánh xạ vẫn đếm là chưa gán | Tên đang gán vào một Dòng DT đã bị xóa khỏi dự toán. Mở Ánh xạ, lọc Chưa gán, bấm Sửa và chọn lại Dòng DT (cần quyền sửa) |
| Admin không hoàn tác được lần import | Bình thường sau khi đã nhập / sửa trên màn hình; sửa tiếp trên màn hình |
