# Đối chiếu: số theo NCC trong "Can Doi Vat Tu 2.xlsx" với sổ công nợ vật tư (MNTC-GD1)

Ngày: 2026-11-13.

**Nguồn file:** sheet "In A4 – HĐ-TT", Phần A. Các cột dùng để so:
- T: thực tế (công nợ gồm VAT);
- E: hóa đơn đã xuất gồm VAT;
- I: thực nộp.

**Nguồn sổ:** `ledger_transactions` (sổ vật tư, công trình id 4 "MNTC-GD1"). Các số được cộng như sau:
- lay_hang.totalTt cho thực tế;
- lay_hang.totalHd cho hóa đơn;
- thanh_toan.totalTt cho thực nộp.

**Lưu ý về dữ liệu:**
- Đây là bản sao dữ liệu ngày 09/11/2026 trên VIETPC, không phải máy chủ thật.
- Danh mục NCC chưa có MST, nên NCC được ghép theo tên.
- Không có số dư đầu kỳ cho công trình 4.
- Giới hạn ngày không giải thích được các chênh lệch. Đã thử cắt ở hai mốc 30/06 và 22/10/2026 mà số vẫn lệch.

## Khớp

Khớp cả 3 cột (lệch không quá 40 đ):
- Lộc Tài HT
- Anh Thư
- Đông Yên
- Đất Việt Phát
- Phương Vũ

Khớp nhưng thực tế lệch vài đồng:
- Nhôm Kính HK: −10.000 đ
- Hùng Chi: −180 đ

## Lệch thực tế (công nợ gồm VAT)

| NCC | File | Sổ công nợ | Sổ − File |
|---|---:|---:|---:|
| Nam Hương | 252.273.360 | 300.587.760 | +48.314.400 |
| Bê tông Hải Phòng | 604.060.000 | 641.432.500 | +37.372.500 |
| Sobek | 247.084.494 | 254.701.278 | +7.616.784 |
| Việt Đức HP | 299.212.408 | 292.852.072 | −6.360.336 |
| Quang Minh HP (chống thấm) | 33.690.000 | 29.180.000 | −4.510.000 |
| Đại Ngàn | 634.774.390 | 637.728.160 | +2.953.770 |
| Quang Minh XD&VT | 161.620.000 | 160.500.000 | −1.120.000 |
| Điện cơ HP | 1.430.000 | 2.520.000 | +1.090.000 |
| Kim khí TT ↔ "Thương Hiệu Trần" (giả định là một NCC) | 220.211.600 | 219.536.300 | −675.300 |

## Lệch hóa đơn (gồm VAT)

| NCC | File | Sổ công nợ | Sổ − File |
|---|---:|---:|---:|
| Bê tông Hải Phòng | 786.364.499 | 625.544.500 | −160.819.999 |
| Sobek | 149.482.800 | 252.309.384 | +102.826.584 |
| Kim khí TT ↔ Thương Hiệu Trần | 107.301.764 | 0 | −107.301.764 |
| Phương Minh | 75.956.000 | 17.900.000 | −58.056.000 |
| Hoàng Yến | 28.500.000 | 0 | −28.500.000 |
| Kế Hằng | 23.467.180 | 46.954.362 | +23.487.182 (sổ gấp đôi, nghi nhập trùng) |
| Quang Minh HP (chống thấm) | 33.690.000 | 29.180.000 | −4.510.000 |
| Điện cơ HP | 1.430.000 | 0 | −1.430.000 |

## Lệch thực nộp

| NCC | File | Sổ công nợ | Sổ − File |
|---|---:|---:|---:|
| Quang Minh XD&VT | 300.000.000 | 100.000.000 | −200.000.000 |
| Sobek | 150.000.000 | 232.826.784 | +82.826.784 |
| Đá Việt Hà | 188.309.000 | 153.998.700 | −34.310.300 (đúng bằng số NCC đã hoàn về; sổ ghi số ròng) |
| Hoàng Yến | 28.500.000 | 0 | −28.500.000 (file ghi đã lấy về 18.600.000) |
| Điện cơ HP | 1.430.000 | 0 | −1.430.000 |

## Có trong file, không có trong sổ công nợ

Không có ở công trình 4, cũng không có ở công trình 1 "Trại Chuối":

| NCC | Thực tế | Hóa đơn |
|---|---:|---:|
| Phá dỡ Tiến Phát | 145.000.000 | 145.000.000 |
| Tiến Đạt (nền móng) | 1.002.807.000 | 1.002.807.000 |
| Thanh Tùng | 8.775.000 | 8.775.000 |
| Gia Hưng Thịnh | 28.200.000 | 41.115.600 |
| Phúc An Khang | 4.536.000 | 4.536.000 |
| Văn Toán | 4.289.959 | 4.289.959 |
| Chương Dương | 0 | 57.466.584 (đã lấy về đủ) |
| LPP | 0 | 45.360.000 (đã lấy về đủ) |

Tổ nhân công (Phần B, 11 tổ, thực tế 1.984.224.628 đ): sổ công nợ nhân công không có dòng nào cho công trình này.

## Câu hỏi còn mở

- "Kim khí TT" có phải là "Thương Hiệu Trần" trong danh mục NCC không?
- Khi thực tế trong file khác sổ công nợ, nguồn nào là chuẩn cho các bảng DT-TT và HĐ-TT?
