# Runbook pilot Nam Hương — tái lập 2 kỳ gần nhất trong ERP

Nguồn: `SOP/theo-doi-vat-tu-thang/Gạch Nam Hương.xlsx`, sheet "Đối chiếu công nợ" (3 kỳ).
Mục tiêu: nhập tay 2 kỳ gần nhất (kỳ 5 + kỳ 6/2026), đối chứng bảng đối chiếu ERP khớp 100% Excel.
Integration test tự động hóa đúng kịch bản này: `test/integration/vat-tu-ncc-pilot.integration.test.ts`.

## Số kỳ vọng (đã xác minh công thức trong Excel)

| Kỳ | Excel range | A (dư mang sang) | B (cộng P/S) | C (chuyển khoản) | Tổng nợ |
|---|---|---|---|---|---|
| Kỳ 4/2026 | 01/4 → 27/4 | 189.805.120 | 120.800.000 | 0 | **310.605.120** |
| Kỳ 5/2026 | 28/4 → 26/5 | 310.605.120 | 44.400.000 | 100.000.000 | **255.005.120** |
| Kỳ 6/2026 | 26/5 → 26/6 | 255.005.120 | 30.460.000 | 0 | **285.465.120** |

Pilot nhập từ **mốc hết 27/4/2026** (A kỳ 5) — kỳ 4 không tái lập.

## Lưu ý biên kỳ (Excel lệch chuẩn)

- Excel dùng biên 28/4→26/5 và 26/5→26/6 (kỳ 6 lặp ngày 26/5 — may là không có phiếu ngày 26/5 nên không đếm trùng).
- ERP chuẩn hóa 27→26: kỳ 5/2026 = 27/04→26/05, kỳ 6/2026 = 27/05→26/06. Mọi phiếu của Excel kỳ 5/6 đều rơi đúng kỳ ERP tương ứng.
- Ngày trong Excel có ô đảo ngày/tháng (`04/5` lưu thành 2026-04-05, `09/5` thành 2026-09-05, 1 ô `11/4` thành 2026-11-04, 1 ô sai năm `19/4/2025`) — bảng dưới đã chuẩn hóa dd/mm/yyyy theo ngữ cảnh kỳ.

## Bước 1 — Master data

1. Chủ thể (Entity): "Công ty CP Xây dựng Ngô Quyền" (type: company) — nếu chưa có.
2. NCC (Supplier): "Công ty TNHH Nam Hương".
3. Công trình: các dự án Trại Chuối / Tân Lộc CDC / ĐVP - CDC — **gán Chủ Thể** cho từng dự án (cột mới `entityId`). Phiếu pilot nhập vào 1 công trình (Trại Chuối) là đủ để khớp số gộp.
4. Vật tư (Item): "Gạch đặc A1", ĐVT viên, type material.

## Bước 2 — Số dư đầu

`/cong-no-vt/so-du-ban-dau`: 1 dòng material — Chủ thể Ngô Quyền, NCC Nam Hương, công trình *(để trống — gộp)*, TT = **310.605.120**, ngày 27/04/2026.
(Excel gộp 4 thành phần `35.866.799 + 109.336.700 + 44.600.000 + 1.621` không truy vết được theo công trình — nhập gộp 1 dòng; nếu muốn tách theo công trình thì tự phân bổ và ghi chú.)

## Bước 3 — Phiếu ngày kỳ 5/2026 (không nhập giá)

`/vat-tu-ncc/{NamHương}/ngay` — 3 phiếu, Gạch đặc A1, công trình Trại Chuối:

| Ngày | KL (viên) |
|---|---|
| 04/05/2026 | 8.000 |
| 09/05/2026 | 8.000 |
| 13/05/2026 | 8.000 |

## Bước 4 — Chốt kỳ 5/2026

Tab **Chốt kỳ** → tháng 5/2026 → gắn giá **1.850 đ/viên** cả 3 phiếu → Chốt kỳ.
Kỳ vọng: 3 phiếu, phát sinh B = **44.400.000**.

## Bước 5 — Thanh toán kỳ 5

`/cong-no-vt/nhap-lieu`: 1 dòng thanh_toan — Ngô Quyền / Nam Hương, ngày 20/05/2026 (ngày sổ phụ thực tế nếu có), TT = **100.000.000**.
(Hoặc: lập PaymentRound vat_tu 100tr → duyệt → **đóng đợt** — sự kiện tự sinh khi đóng.)

## Bước 6 — Phiếu + chốt kỳ 6/2026

Phiếu:

| Ngày | KL (viên) | Giá khi chốt |
|---|---|---|
| 05/06/2026 | 8.000 | 1.850 |
| 25/06/2026 | 5.400 | 1.450 |
| 25/06/2026 | 5.400 | 1.450 |

Chốt kỳ tháng 6/2026 → B = **30.460.000**.

## Bước 7 — Đối chiếu & ký

1. Tab **Đối chiếu công nợ** → kỳ 27/04–26/05: A=310.605.120, B=44.400.000, C=100.000.000, Tổng nợ=**255.005.120** — khớp Excel.
2. Kỳ 27/05–26/06: A=255.005.120 (tự carry-over), B=30.460.000, C=0, Tổng nợ=**285.465.120** — khớp Excel.
3. Mở chi tiết kỳ → in thử → "NCC đã ký — khóa kỳ" cho kỳ 5 rồi kỳ 6.
4. Verify khóa: thêm phiếu ngày 10/05/2026 → hệ thống từ chối (kỳ đã ký).

## Bước 8 — Lưới an toàn

Tab **Kiểm tra khớp** (admin) → khoảng 27/04–26/06/2026 → kỳ vọng: 0 phiếu mồ côi, 0 phát sinh mồ côi, 0 chênh lệch.

## Kết quả

Ghi kết quả chạy tay vào `reports/nam-huong-pilot-result.md` (khớp/lệch từng số, nguyên nhân nếu lệch: dữ liệu nhập sai vs logic sai).

## Rollout các NCC còn lại

Lặp runbook với Phương Minh / Anh Thư / Lộc Tài / Quang Minh: nhập dư nợ tại mốc chốt gần nhất + chạy tiếp trong ERP (không cần tái lập kỳ cũ). Lộc Tài tính "Ca" máy xúc — vẫn cùng khuôn phiếu/vật tư. Quang Minh nhiều loại vật tư — tổng phụ theo loại tự hiển thị ở bảng đối chiếu.
