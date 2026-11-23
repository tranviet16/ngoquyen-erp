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

### 3.1 Quy ước ngày sổ cái

Hệ thống chuẩn hoá tất cả ngày ghi sổ cái về **ngày nghiệp vụ tại múi giờ Asia/Bangkok**, lưu tại UTC 00:00. Điều này đảm bảo:
- Phiếu giao nhận ngày ghi sổ khác ngày hoá đơn (khi NCC nộp muộn / đợt thanh toán đóng đêm)
- Truy vấn cửa sổ không làm rơi phiếu nào
- Khoá kỳ nhất quán theo ngày nghiệp vụ

**Loại giao dịch công nợ vật tư:**
- **Lấy hàng** (lay_hang): tăng nợ — phiếu giao nhận ngày
- **Thuế hoá đơn** (thue_hd): tăng nợ ở cột TT — ghi qua tab Thanh toán (bắt buộc số hoá đơn, khác ngày HĐ)
- **Thanh toán** (thanh_toan): giảm nợ — chuyển khoản
- **Điều chỉnh** (dieu_chinh): dương → phát sinh, âm → đã trả — lối thoát khi cần sửa kỳ đã ký

### 3.2 Nhập theo công trình và mốc chuyển đổi 26/10/2026

Công nợ vật tư được theo dõi theo **cặp NCC × công trình**. Mỗi dòng sổ, phiếu, số dư và kỳ đối chiếu đều thuộc một công trình. Chủ thể ghi sổ luôn là Chủ thể của công trình, do admin gán ở **Dữ liệu nền tảng > Dự Án**. Công trình chưa gán Chủ thể thì hệ thống báo lỗi và không ghi.

- **Từ giờ go-live, ERP là nguồn.** Dữ liệu tới **hết 26/10/2026** (Nhập Liệu, Số Dư Ban Đầu, CSV tổng công nợ, 23 file theo dõi) được nạp một lần bằng import chuyển đổi, và bị khoá.
  - Mọi ghi vật tư có ngày ≤ 26/10/2026 đều bị từ chối, ở mọi NCC và mọi công trình, kể cả bút toán điều chỉnh.
  - Chênh lệch của giai đoạn đó ghi bằng **Điều chỉnh** có ngày sau 26/10/2026.
- Mỗi cặp có dữ liệu tới 26/10 có một kỳ **"Kỳ chuyển đổi (khóa)"** 01/01/2026 → 26/10/2026, đã ký, không gỡ ký được. Kỳ đầu tiên chốt trong ERP là **27/10/2026 → 26/11/2026**.
- Cặp được duyệt "lũy kế" khi import có 2 dòng **"Lũy kế chuyển đổi"** ngày 26/12/2025 (tổng lấy hàng và tổng đã trả từ trước tới cuối 2025). Cặp còn lại có số dư ban đầu ròng asOf 31/12/2025.

### 3.3 Nhập liệu công nợ — Thanh toán & Thuế hoá đơn

1. Menu → **Công nợ vật tư > Nhập liệu**
2. Chọn **Công trình cho dòng mới** (bắt buộc) ở phía trên lưới, rồi thêm dòng
3. Chọn loại:
   - **Trả tiền**: chuyển khoản thường
   - **Lấy hàng**: ghi không dùng (sinh tự động từ phiếu ngày sau chốt kỳ)
   - **Thuế hoá đơn**: ghi qua tab **Thanh toán** trong `/vat-tu-ncc/[NCC]/thanh-toan?projectId=…` (bắt buộc số hoá đơn, ngày ghi sổ khác ngày HĐ)
4. Điền:
   - Nhà cung cấp
   - Ngày (ngày sổ — múi giờ Bangkok; phải sau 26/10/2026 và không rơi vào kỳ đã ký của cặp)
   - Số tiền
   - Số hoá đơn (bắt buộc khi loại Thuế hoá đơn)
5. Click **Lưu**

**Kế hoạch thanh toán** (`/thanh-toan/ke-hoach`): dòng loại vật tư phải chọn **công trình** trước. Chủ thể tự điền theo công trình và bị khoá. Đợt đóng sẽ ghi "Trả tiền" vào sổ của đúng cặp, với ngày là ngày đóng đợt.

### 3.4 Số dư ban đầu — theo cặp, khoá khi cặp có kỳ ký

1. Menu → **Công nợ vật tư > Số dư ban đầu**
2. Chọn **Công trình cho dòng mới** (bắt buộc), nhà cung cấp
3. Nhập số dư (TT, HĐ) tại ngày asOf
4. **Lưu**

- Số dư tới 31/12/2025 của mọi cặp do import chuyển đổi nạp. Sau go-live, ngày asOf của số dư mới hoặc số dư được sửa phải sau 26/10/2026.
- Sau khi cặp NCC × công trình có kỳ đối chiếu được ký, số dư ban đầu của cặp đó bị **khoá — không sửa được**. Chênh lệch sửa bằng điều chỉnh kỳ sau.

### 3.5 Báo cáo tháng — Cửa sổ thời gian linh hoạt

1. Menu → **Công Nợ VT > Báo Cáo Tháng**
2. **Bộ chọn mốc thời gian**:
   - **Toàn bộ**: mọi giao dịch
   - **Năm**: năm dương lịch (vd. 2026)
   - **Quý**: Q1–Q4 năm chọn
   - **Tháng**: tháng/năm (mặc định tháng hiện tại)
   - **Tuần ISO**: tuần theo chuẩn ISO (Thứ 2 – CN) — tuần 53 chỉ ở năm có 53 tuần
   - **Kỳ chuẩn 27→26**: cửa sổ 27 tháng trước → 26 tháng chọn (mặc định nếu không chọn)
   - **Tuỳ chọn**: từ ngày → đến ngày (ISO format YYYY-MM-DD)
3. Click **Áp dụng** (không push URL tự động)
4. Xem bảng: **LH = Đầu kỳ + Lấy hàng**
   - LH TT: lấy hàng TT
   - Trả TT: thanh toán TT
   - Nợ TT: còn nợ TT
   - LH HĐ, Trả HĐ, Nợ HĐ: như trên nhưng cột thuế hoá đơn (HĐ luôn = 0 nếu không có thuế)
5. Click **Xuất Excel** để tải file `cong-no-monthly-T<tháng>-<năm>.xlsx`

### 3.6 Chi tiết sổ cái — Theo cửa sổ thời gian

1. Menu → **Công Nợ VT > Chi Tiết**
2. Chọn nhà cung cấp
3. Bộ chọn mốc thời gian (như Báo cáo tháng)
4. Click **Áp dụng**
5. Xem dòng lịch sử: ngày ghi sổ (ngày nghiệp vụ), loại giao dịch, số tiền TT/HĐ, số dư lũy kế

### 3.7 Tổng hợp NCC × Chủ thể — Ma trận công nợ

1. Menu → **Công Nợ VT > Tổng hợp NCC × Chủ thể** (`/cong-no-vt/tong-hop`)
2. Bộ chọn mốc thời gian (mặc định: Toàn bộ)
3. Xem ma trận:
   - **Dòng**: Chủ thể (entity) + tất cả NCC của chủ thể → tổng cộng Chủ thể
   - **Cột (per Chủ thể)**: 
     - LH TT (lấy hàng thanh toán)
     - Trả TT (đã trả TT)
     - Nợ TT (còn nợ TT)
     - LH HĐ (lấy hàng thuế hoá đơn)
     - Trả HĐ (đã trả HĐ)
     - Nợ HĐ (còn nợ HĐ)
   - **TỔNG CÔNG TY**: cộng tất cả chủ thể
4. Click **Xuất Excel** → `cong-no-tong-hop-<mốc>.xlsx` (header 2 hàng gộp ô)
   - Mở cho quyền **đọc** `cong-no-vt`

### 3.8 Tổng hợp theo công trình — năm hoặc từ đầu

1. Menu → **Công nợ vật tư > Tổng hợp theo công trình** (`/cong-no-vt/tong-hop-cong-trinh`)
2. Bộ lọc, bấm **Áp dụng** để tải:
   - **Kỳ xem**: cùng bộ chọn mốc như Báo cáo tháng, mặc định **Năm** hiện tại
   - **Nhóm theo**: NCC → công trình, hoặc Công trình → NCC
   - **Chủ thể**: chọn một hoặc nhiều; để trống là tất cả
3. Cột (TT và HĐ):
   - Kỳ có ngày bắt đầu (Năm, Tháng, Kỳ chuẩn…): **Đầu kỳ / PS tăng / PS giảm / Cuối kỳ**, với Cuối kỳ = Đầu kỳ + PS tăng − PS giảm
   - **Toàn bộ** (hoặc chỉ có "Đến ngày"): **Số dư chuyển sang / LH lũy kế / Đã trả lũy kế / Còn nợ**. Ở cặp lũy kế, LH lũy kế gồm dòng "Lũy kế chuyển đổi" 26/12/2025
4. Đối chiếu nhanh: Còn nợ (Toàn bộ, đến ngày T) = Cuối kỳ (Năm, đến T). Kỳ chuẩn T1/2026 (27/12/2025–26/01/2026) có Đầu kỳ = Số Dư Ban Đầu.
5. **Xuất Excel** cho cùng số với màn hình (`cong-no-cong-trinh-…xlsx`); **In** để in trang.

### 3.9 Chốt kỳ và ký — theo cặp NCC × công trình

Chốt kỳ xác nhận công nợ với NCC tại **một công trình**. Ký kỳ của NCC A tại công trình X không khoá phiếu của A tại công trình Y. Quy trình:

1. Menu → **Vật tư – Nhà cung cấp** → **Theo công trình →** → chọn công trình → chọn NCC (hoặc vào trang NCC rồi chọn công trình ở thanh "NCC × Công trình") → tab **Chốt kỳ**. Thiếu công trình thì trang hiện bộ chọn công trình.
2. Bộ chọn **Từ ngày → Đến ngày** (tuỳ chọn):
   - Mặc định gợi ý: từ ngày sau kỳ gần nhất của cặp (sau go-live là 27/10/2026), hoặc phiếu sớm nhất chưa chốt → ngày 26 kế tiếp
   - **Nguyên tắc liền kề**: kỳ mới phải bắt đầu đúng ngày hôm sau kỳ gần nhất đã có của cặp (ký hoặc chưa ký, kể cả "Kỳ chuyển đổi (khóa)")
   - Kỳ **Kỳ chuẩn** là 27 tháng trước → 26 tháng chọn
3. Xem **Excel label** nhập: vd. "26/5→26/6" → **nhập là "27/5→26/6"** (hệ thống chuẩn hoá lên 27)
4. Gán **đơn giá** cho từng phiếu ngày (auto-suggest từ báo giá hiệu lực)
5. Click **Chốt kỳ** 
   - Kiểm tra: mọi phiếu trong kỳ phải có sự kiện (dòng giao dịch sổ cái)
   - Nếu còn phiếu chưa có event → từ chối ký
6. **Ký xác nhận** (tab **Đối chiếu công nợ**)
   - Bảng đối chiếu sinh tự động: Đầu kỳ + Phát sinh TT/HĐ − Đã trả TT/HĐ = Còn nợ
   - Click **Ký** → kỳ của cặp bị **khoá** (phiếu mới của cặp rơi vào kỳ này → bị từ chối và hiện thông báo lỗi; chênh lệch sửa bằng điều chỉnh kỳ sau)
   - Kỳ đã ký bất biến (số dư ban đầu của cặp cũng bị khoá sau ký đầu tiên)
   - "Kỳ chuyển đổi (khóa)" không có nút ký / gỡ ký; chỉ admin hoàn tác import mới gỡ được

Tab **Công nợ** trong trang Dự án vẫn lấy số từ giao dịch dự án. Liên kết **"Công nợ vật tư theo sổ cái →"** mở trang công trình ở Vật tư – Nhà cung cấp.

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

## 7. Đối Chiếu DT-HĐ-TT — Rà Soát Trên HĐ-TT

Mỗi công trình dùng sổ đội có báo cáo **HĐ-TT**: mỗi NCC một dòng, so hóa đơn với tiền đã trả và thực tế. Kế toán rà soát và nhập bốn ô tay **H / S / X / Z** ngay trên bảng này. Hướng dẫn đầy đủ: [Đối chiếu DT-HĐ-TT](doi-chieu-dt-hd-tt.md).

### 7.1 Mở HĐ-TT

1. Menu → **Dự Án** → chọn công trình.
2. Hàng nhóm trên cùng: bấm **Đối chiếu DT-HĐ-TT**. Trang **Tổng quan** mở ra.
3. Ở hàng dưới, cụm **Báo cáo**: bấm **HĐ-TT**.

Đường tắt từ Tổng quan:
- việc **"Việc cần làm của kế toán (cột Z)"** → nút **Xem ở HĐ-TT**;
- thẻ **Còn phải lấy HĐ (Σ U)** hoặc **Còn phải lấy về (Σ Y)**.

Cả ba đều mở HĐ-TT đã lọc sẵn.

### 7.2 Đọc bảng

- 13 cột tiền chia bốn nhóm: **Hóa đơn** (HĐ chưa VAT, VAT, E), **Thanh toán** (G, I, J, K), **Thực tế** (T, U, V), **Lấy về** (W, X, Y). Sau đó là L (đã trả / HĐ) và Z (việc cần làm).
- Rê chuột lên đầu cột để xem công thức.
- Đầu bảng, cột NCC và dòng TỔNG CỘNG luôn đứng yên khi cuộn.
- NCC xếp theo đầu mối.
- Huy hiệu cạnh số:
  - **H**: I theo số H nhập tay;
  - **tạm = HĐ**: đầu mối chưa chốt thực tế, T tạm bằng E;
  - **tách**: T theo số S nhập tay.
- Bấm số **E** để mở sổ Hóa đơn của NCC đó; bấm số **G** để mở sổ Chi thực tế của NCC đó.

### 7.3 Lọc

Ba chip trên bảng, mỗi chip kèm số NCC:
- **Còn phải lấy HĐ (U > 0)**: NCC còn thiếu hóa đơn so với thực tế;
- **Còn phải lấy về (Y > 0)**: NCC còn tiền phải lấy lại;
- **Có việc cần làm (Z)**: NCC có ghi chú ở cột Z.

Bấm lại chip đang bật, hoặc **Bỏ lọc**, để xem đủ.

Khi đang lọc, dòng tổng ghi **"Tổng cộng (cả bảng)"**: nó vẫn là tổng cả bảng, không phải tổng các dòng đang hiện. Thẻ Σ U trên Tổng quan cũng là tổng bù trừ giữa các NCC: NCC có U âm bù cho NCC có U dương. Vì vậy cần xem danh sách đã lọc để biết NCC nào thật sự còn phải lấy hóa đơn.

Bộ lọc nằm trên đường dẫn: tải lại trang, bấm Back, hoặc gửi link cho người khác đều giữ đúng bộ lọc.

### 7.4 Nhập H / S / X / Z

1. Bấm **Nhập H / S / X / Z** (góc phải). Nút này chỉ hiện khi bạn có quyền **sửa** công trình.
2. Bảng thêm cột **Nhập H** (trước cột I) và **Nhập S** (trước cột T). Cột X và Z thành ô nhập.
3. Gõ số rồi:
   - **Enter**: lưu, rồi xuống ô cùng cột ở dòng dưới;
   - **Tab**: sang ô kế bên (rời ô là lưu);
   - **Esc**: bỏ chữ vừa gõ, trả lại số đang lưu.
4. Xong thì bấm **Xong nhập**.

Cách gõ tiền: dấu chấm hoặc khoảng trắng tách nghìn, dấu phẩy là thập phân. Ví dụ: "1.500.000" = 1 500 000; "1.500" = 1 500; "12,5" = 12,5. Xóa trắng ô rồi lưu là xóa số nhập tay. Z là chữ, tối đa 1 000 ký tự.

**Lưu không được** (gõ sai số, mất quyền, dòng NCC vừa bị xóa…):
- ô viền đỏ, thông báo hiện ngay dưới ô;
- **chữ đã gõ được giữ nguyên** và con trỏ quay về ô đó;
- sửa chữ rồi Enter lại. Nếu thông báo là "Dòng NCC không còn trong công trình này — tải lại trang", hãy chép lại chữ đã gõ rồi tải lại trang.

Dòng NCC chưa có ở trang Đầu mối thì không có ô nhập, mà có link **Thêm dòng NCC ở Đầu mối**.

### 7.5 Quy tắc S

Trên HĐ-TT, S (thực tế riêng của NCC) chỉ nhập được ở **NCC thứ hai trở đi của một đầu mối có nhiều NCC và đã chốt thực tế**. Ở dòng khác, ô S bị khóa; rê chuột để xem lý do:
- "Gắn NCC vào đầu mối trước";
- "Đầu mối chỉ có một NCC";
- "NCC đầu tiên nhận phần còn lại — nhập S ở NCC sau";
- "Đầu mối chưa chốt thực tế".

Nhập S sai chỗ sẽ làm dòng kiểm Σ T lệch. Nếu dòng kiểm Σ T dưới bảng báo **Lệch đối soát … — do S ở dòng Công ty A**, nghĩa là dòng đó đang lưu một số S ở chỗ không được phép (thường là số từ lần import). Cách sửa:
1. Bấm tên NCC trên dòng kiểm. Trang **Đầu mối** mở ra, bảng NCC đã lọc theo tên đó.
2. Ở cột **S thực tế riêng**, xóa số S rồi Enter.

### 7.6 Lưới NCC ở trang Đầu mối đọc số như HĐ-TT

H, S, X cũng sửa được ở bảng NCC của trang **Đầu mối** (cụm Thiết lập). Ba ô này nay đọc số tiền giống hệt HĐ-TT: gõ "1.500" là 1 500 (trước đây là 1,5), "1.500.000" là 1 500 000. Riêng ô **Số chốt tay** khi sửa trên lưới đầu mối vẫn đọc như cũ: gõ số liền, không dấu chấm (vd. 1500000).

---

## 8. Xuất Báo Cáo Excel

| Báo cáo | Menu | Template |
|---------|------|----------|
| Công nợ tháng VT | Công Nợ VT > Báo Cáo Tháng > Xuất Excel | cong-no-monthly |
| Đối chiếu NCC | Vật Tư NCC > Đối Chiếu > Xuất Excel | doi-chieu |
| Dự toán | Dự Án > Dự Toán > Xuất Excel | du-toan |
| SL/DT | SL/DT > Báo Cáo DT > Xuất Excel | sl-dt |
| DT-HĐ / DT-TT / HĐ-TT | Dự Án > (công trình) > Đối chiếu DT-HĐ-TT > Tổng quan hoặc trang báo cáo > Xuất Excel | — |

File Excel và bản in của DT-HĐ / DT-TT / HĐ-TT luôn là báo cáo đầy đủ, không theo bộ lọc trên màn hình. Rà soát số đã trả (H), số đã lấy về (X) và in ba báo cáo đối chiếu: xem mục 7 và [Đối chiếu DT-HĐ-TT](doi-chieu-dt-hd-tt.md).

---

## 9. Xử Lý Sự Cố

| Vấn đề | Giải pháp |
|--------|-----------|
| Số dư báo cáo sai | Kiểm tra số dư ban đầu có nhập chưa. Kiểm tra có bỏ sót giao dịch không |
| Xuất Excel bị lỗi | Thử lại. Nếu vẫn lỗi liên hệ admin |
| Không tìm thấy nhà cung cấp khi nhập liệu | Yêu cầu admin thêm NCC vào Danh Mục |
| Khoản vay hiển thị sai lãi | Kiểm tra lãi suất nhập đúng đơn vị %/năm chưa |
| Không thấy nút "Nhập H / S / X / Z" trên HĐ-TT | Cần quyền **sửa** công trình; nhờ admin cấp |
| Ô S trên HĐ-TT bị khóa | Rê chuột xem lý do; xem mục 7.5 |
| Ô trên HĐ-TT viền đỏ | Đọc thông báo dưới ô, sửa chữ rồi Enter lại |

---

## 10. FAQ

**Q: Nhập nhầm số tiền, sửa được không?**  
A: Có, click Edit trên bút toán/giao dịch và sửa lại.

**Q: Tháng này chưa có dữ liệu, báo cáo hiện gì?**  
A: Hiển thị số dư đầu kỳ = số dư cuối kỳ trước, nợ phát sinh và thanh toán = 0.

**Q: Có thể xem công nợ của tháng trước không?**  
A: Có, chọn tháng trong bộ lọc của Báo Cáo Tháng.
