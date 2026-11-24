# Chỗ lệch giữa file lũy kế (CSV) và workbook năm 2026

Lập ngày 10/11/2026 từ lần nhập lại trên bản sao (import #7). «CSV» là file *Tong Cong No - Tổng công nợ đến 26.7.26*; «workbook» là *Quản Lý Công Nợ Vật Tư* (Số Dư Ban Đầu + Nhập Liệu 2026). Số tiền là đồng, viết TT / HĐ.

- 40 cặp NCC × công trình khớp hoàn toàn, đã nhập lũy kế theo CSV.
- 8 cặp chỉ lệch HĐ: đã nhập lũy kế theo CSV (mục 1).
- 4 cặp lệch công nợ thực tế: đang giữ số của workbook, chờ kiểm (mục 2).
- 4 cặp CSV nhỏ hơn phát sinh năm nay: không nhập lũy kế được (mục 3).
- 30 cặp có Số Dư trong workbook nhưng CSV không có dòng nào: giữ Số Dư của workbook, đã chốt ngày 10/11/2026 (mục 4).
- 5 cặp chỉ có phát sinh 2026, CSV không có dòng nào (mục 5).

## 1. Chỉ lệch hoá đơn (HĐ) — đã nhập theo CSV

Công nợ thực tế hai file bằng nhau. ERP đang lấy còn nợ HĐ theo CSV.

| NCC × công trình | Dòng CSV | Còn nợ HĐ theo CSV | Còn nợ HĐ theo workbook | Lệch |
|---|---|---:|---:|---:|
| Công ty CP TM Phương Minh × Trại Chuối | dòng 49 | 55.322.000 | 71.552.000 | -16.230.000 |
| Công ty TNHH Bê Tông Hải Phòng × Trại Chuối | dòng 19 | -697.110.500 | -405.481.500 | -291.629.000 |
| Công ty TNHH Lộc Tài HT × Trại Chuối | dòng 35 | -350.658.000 | -450.658.000 | 100.000.000 |
| Công ty TNHH Nam Hương × Trại Chuối | dòng 7 | -126.512.852 | -15.102.852 | -111.410.000 |
| Công ty TNHH XD&VT Quang Minh × Trại Chuối | dòng 54 | -209.743.900 | -309.743.900 | 100.000.000 |
| Đại Ngàn × Quán Toan | dòng 13 | 290.529.597 | 290.529.579 | 18 |
| Đại Ngàn × Tân Lộc CDC | dòng 14 | 273 | 0 | 273 |
| Đồng Yên × Mầm Non Trại Chuối GĐ1 | dòng 86 | 0 | 3.596.400 | -3.596.400 |

## 2. Lệch công nợ thực tế (TT) — đang giữ theo workbook

| NCC × công trình | Dòng CSV | Còn nợ theo CSV (TT / HĐ) | Còn nợ theo workbook (TT / HĐ) | Lệch (TT / HĐ) |
|---|---|---:|---:|---:|
| Công ty CP TM Phương Minh × 346 Cát Dài | dòng 52 | 24.430.000 / 0 | 0 / 0 | 24.430.000 / 0 |
| Đá Việt Hà × Mầm Non Trại Chuối GĐ1 | dòng 78 | 0 / 0 | 43.998.700 / 78.309.000 | -43.998.700 / -78.309.000 |
| Hùng Chi gạch ốp lát × Mầm Non Trại Chuối GĐ1 | dòng 84 | 127.222.640 / 296.999.493 | 127.222.460 / 296.999.493 | 180 / -0 |
| Thương Hiệu Trần × Trại Chuối | dòng 42, dòng 47 | 8.110.003 / 349.864.378 | -191.889.997 / 149.864.378 | 200.000.000 / 200.000.000 |

## 3. Lũy kế trong CSV nhỏ hơn phát sinh năm 2026 của workbook

Tổng lũy kế không thể nhỏ hơn riêng năm nay, nên một trong hai file thiếu hoặc thừa dòng. ERP chỉ có phát sinh 2026 (và Số Dư nếu có).

| NCC × công trình | Dòng CSV | CSV: lấy hàng / đã trả (TT) | Workbook 2026: lấy hàng / đã trả (TT) | Số Dư workbook (TT / HĐ) | Lý do |
|---|---|---:|---:|---:|---|
| Công ty TNHH Nam Hương × Mầm Non Trại Chuối GĐ1 | dòng 10 | 262.684.400 / 200.000.000 | 279.701.200 / 200.000.000 | -17.016.800 / 0 | Thành phần âm: G − LH26 = -17.016.800 |
| Nhôm Kính HK × Mầm Non Trại Chuối GĐ1 | dòng 80 | 1.767.445.488 / 1.100.000.000 | 1.767.445.488 / 1.100.000.000 | 0 / 0 | Thành phần âm: M − LH26 HĐ = -740.362.480 |
| Quang Minh (chống thấm) × Mầm Non Trại Chuối GĐ1 | dòng 74 | 20.420.000 / 20.420.000 | 20.420.000 / 29.180.000 | 0 / 0 | Thành phần âm: H+I − Trả26 = -8.760.000; Thành phần âm: M − LH26 HĐ = -8.760.000; Thành phần âm: N − Trả26 HĐ = -8.760.000 |
| Sơn Sobek × Mầm Non Trại Chuối GĐ1 | dòng 88 | 247.084.494 / 225.210.000 | 254.701.278 / 232.826.784 | 0 / 0 | Thành phần âm: G − LH26 = -7.616.784; Thành phần âm: H+I − Trả26 = -7.616.784; Thành phần âm: N − Trả26 HĐ = -517.200 |

## 4. Workbook có Số Dư Ban Đầu, CSV không có dòng nào

Tổng Số Dư TT của nhóm này: 5.117.930.433. Đã chốt ngày 10/11/2026: ERP giữ Số Dư của workbook làm số dư chuyển sang cho nhóm này. Nếu sau này CSV được bổ sung dòng cho cặp nào thì lần nhập kế tiếp cặp đó tự chuyển sang lũy kế theo CSV.

| NCC × công trình | Chủ thể | Số Dư (TT / HĐ) | Còn nợ hiện tại theo workbook (TT / HĐ) |
|---|---|---:|---:|
| Anh Hải ( máy san) × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 15.200.000 / 0 | 15.200.000 / 0 |
| Bà Hậu ( Cọc bạch đàn) × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 10.000.000 / 0 | 10.000.000 / 0 |
| Bê tông Tân Lộc × Tiên Lãng (SH) | Lê Văn Huyên | 563.435.000 / 563.435.000 | 563.435.000 / 563.435.000 |
| Bê tông Tân Lộc × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 207.825.000 / 207.825.000 | 207.825.000 / 207.825.000 |
| Công ty CP TM Phương Minh × 326 - Lô 34 | Công ty CP Xây dựng Ngô Quyền | 24.430.000 / 0 | 24.430.000 / 0 |
| Công ty TNHH Bê Tông Hải Phòng × Tiên Lãng (SH) | Lê Văn Huyên | 251.960.000 / 251.960.000 | 0 / 0 |
| Công ty TNHH Bê Tông Hải Phòng × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 48.140.000 / 48.140.000 | 0 / 0 |
| Đại Ngàn × Tiên Lãng (SH) | Lê Văn Huyên | 1.371.777.160 / 1.500.012.800 | -128.222.840 / 12.800 |
| Đại Ngàn × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 791.535.185 / 608.764.883 | 791.535.185 / 608.764.883 |
| Đất Việt Phát × Tiên Lãng (SH) | Lê Văn Huyên | 0 / -121.500.000 | 0 / -121.500.000 |
| Đất Việt Phát × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | -38.000.000 / -38.000.000 | -38.000.000 / -38.000.000 |
| Điện HUNACO × Tiên Lãng (SH) | Lê Văn Huyên | 20.000.000 / 20.000.000 | 20.000.000 / 20.000.000 |
| Điện HUNACO × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 23.200.000 / 23.200.000 | 23.200.000 / 23.200.000 |
| MCT Đại Dương × Tiên Lãng (SH) | Lê Văn Huyên | 145.513.000 / 144.422.309 | 0 / 0 |
| MCT Đại Dương × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 86.307.000 / 86.307.000 | 0 / 0 |
| Ô Phương ( Máy lu) × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 10.060.347 / 0 | 10.060.347 / 0 |
| Ông Lưu ( nhân công) × Tiên Lãng (SH) | Lê Văn Huyên | 33.940.100 / 0 | 33.940.100 / 0 |
| Ông Lưu ( nhân công) × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 5.662.820 / 0 | 5.662.820 / 0 |
| Ông Mạnh ( nhân công) × Tiên Lãng (SH) | Lê Văn Huyên | 119.061.535 / 0 | 119.061.535 / 0 |
| Ông Mạnh ( nhân công) × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 16.986.208 / 0 | 16.986.208 / 0 |
| Ông Sơn ( Vôi thầu) × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 60.750.000 / 0 | 60.750.000 / 0 |
| Ông Trọng(vôi thầu, bây) × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 35.678.000 / 0 | 35.678.000 / 0 |
| Quang Minh (chống thấm) × Tiên Lãng (SH) | Lê Văn Huyên | 25.800.000 / 25.800.000 | 0 / 0 |
| Quang Minh (chống thấm) × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 7.200.000 / 7.200.000 | 0 / 0 |
| Thuỷ lợi Hải Dương × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | -50.000.000 / -50.000.000 | -50.000.000 / -50.000.000 |
| Tiên Lãng Petro × Tiên Lãng (SH) | Lê Văn Huyên | 66.250.000 / 66.250.000 | 66.250.000 / 66.250.000 |
| Tiên Lãng Petro × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 120.792.500 / 120.792.500 | 120.792.500 / 120.792.500 |
| Vận tải Hải Đạt × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 0 / -68.501.500 | 49.300.000 / -68.501.500 |
| Xây lắp Đoàn Kết × Tiên Lãng (SH) | Lê Văn Huyên | 716.204.719 / -247.241.148 | 716.204.719 / -247.241.148 |
| Xây lắp Đoàn Kết × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 428.221.859 / 60.339.960 | 428.221.859 / 60.339.960 |

## 5. Chỉ có phát sinh 2026, CSV không có dòng nào

| NCC × công trình | Chủ thể | Lấy hàng / đã trả 2026 (TT) | Còn nợ (TT / HĐ) |
|---|---|---:|---:|
| Công ty TNHH Nam Hương × Xây dựng Dải cây xanh | Lê Văn Huyên | 154.422.000 / 0 | 154.422.000 / 0 |
| Đại Ngàn × Phí khác (các dự án) | Công ty CP Xây dựng Ngô Quyền | 0 / 0 | 0 / 0 |
| Ông Phương ( nhân công) × Tiên Lãng (SH) | Lê Văn Huyên | 0 / 0 | 0 / 0 |
| Thí nghiệm 912 × Tiên Lãng (SH) | Lê Văn Huyên | 12.765.600 / 0 | 12.765.600 / 12.765.600 |
| Thí nghiệm 912 × Tiên Lãng (Việt Úc) | Lưu Minh Xuân | 12.765.600 / 0 | 12.765.600 / 12.765.600 |

## Ghi chú

- Phương Minh 24.430.000: CSV ghi ở «346 Cát Dài» (dòng 52), workbook ghi Số Dư ở «326 - Lô 34». ERP đang nhập một lần theo workbook để không cộng trùng.
- Thương Hiệu Trần × Trại Chuối gồm cả «Kim Khí» (CSV dòng 42 và 47). CSV dòng 47 ghi đã trả 102.453.547, trong khi Nhập Liệu có thêm khoản trả 200.000.000 ngày 05/08/2026.
- Nửa dưới của CSV (từ dòng 122, «Đến ngày 15/01/2025») là bảng cũ, không được dùng.
- Dòng 17 của CSV (Đại Ngàn, «Phí khác (chênh lệch hóa đơn)» 454.234.867 ở cột R) không có tên công trình nên không nhập.
