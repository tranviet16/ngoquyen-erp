# Runbook pilot — 3 NCC, thuế hoá đơn, tổng hợp NCC × Chủ thể, báo giá, thanh toán

Mục tiêu: nhập tay dữ liệu 3 NCC trong mẫu `SOP/theo-doi-vat-tu-thang/Excel mẫu.xlsx`, kiểm chứng:
1. Kỳ chuẩn 27→26 khớp biên Excel (đổi nhãn từ "26/5→26/6" sang "27/5→26/6")
2. Thuế hoá đơn tăng nợ ở tab Thanh toán
3. Trang Tổng hợp NCC × Chủ thể khớp Excel sheet "Công Nợ"
4. Báo giá gợi ý giá, sửa được
5. Excel tổng hợp mở được, số khớp

## Trước khi chạy

1. **Docker + Postgres**: Kiểm tra stack đang chạy (`docker ps`).
2. **Sao lưu DB**: `./scripts/backup-db.sh` → `backups/` (xem `docs/operations/backup-restore.md`).
3. **Chuẩn hoá ngày sổ cái** (phase 1): `npx migration:deploy` hoặc manual `prisma migrate deploy` áp dụng migration `20261006110000_normalize_ledger_dates_to_business_day` — kiểm tra `SELECT count(*) FROM ledger_transactions WHERE date <> date_trunc('day', date)` = 0.
4. **Audit ngày**:
   ```bash
   npx tsx scripts/audit-ledger-dates.ts
   ```
   Kỳ vọng output: 0 (không có dòng nào lệch ngày nghiệp vụ).
5. **Test integration**: 
   ```bash
   pnpm test:integration
   ```
   Kiểm tra không có lỗi liên quan vật tư NCC.

## Bước 1 — Master data (Chủ thể, NCC, công trình, vật tư)

1. **Chủ thể (Entity)**: "Công ty CP Xây dựng Ngô Quyền" (type: company) — nếu chưa có, tạo mới. Ghi lại ID.
2. **NCC (Supplier)**:
   - "Công ty TNHH Nam Hương"
   - "Công ty TNHH Bê Tông Hải Phòng"
   - "Công ty TNHH Lộc Tài"
3. **Công trình (Project)**: Tối thiểu 3 dự án (Trại Chuối, Tân Lộc CDC, ĐVP - CDC), mỗi dự án **gán Chủ Thể** (cột `entityId` → entity ID vừa tạo).
4. **Vật tư (Item)**: 
   - "Gạch đặc A1" (ĐVT: viên)
   - "Bê tông" (ĐVT: m³)
   - "Ca (máy xúc)" (ĐVT: ca)

## Bước 2 — Nam Hương: Số dư đầu + 3 kỳ

### 2.1 Số dư đầu

Menu → **Công Nợ VT > Số Dư Ban Đầu**
- Chủ thể: Ngô Quyền
- NCC: Nam Hương
- Dự án: *(để trống — gộp tất cả công trình)*
- Số dư (TT): **189.805.120**
- Ngày asOf: **31/03/2026**

Ghi lại mốc này để chốt kỳ đầu tiên.

### 2.2 Kỳ 1 (01/4 → 27/4/2026) — không chốt trong pilot

Skip — pilot bắt đầu từ mốc số dư hết 27/4.

### 2.3 Kỳ 2 (27/4 → 26/5/2026)

**Phiếu ngày** (`/vat-tu-ncc/Nam Hương/ngay`):

| Ngày | Vật tư | Số lượng | Đơn giá | Dự án |
|---|---|---|---|---|
| 04/05/2026 | Gạch A1 | 8.000 viên | *để trống lúc nhập* | Trại Chuối |
| 09/05/2026 | Gạch A1 | 8.000 viên | *để trống* | Trại Chuối |
| 13/05/2026 | Gạch A1 | 8.000 viên | *để trống* | Trại Chuối |

**Chốt kỳ** (`/vat-tu-ncc/Nam Hương/chot-ky`):
- Chọn **Tháng 5/2026**
- Gợi ý mặc định: **27/04/2026 → 26/05/2026** ✓
- Gán giá: **1.850 đ/viên** cho cả 3 phiếu
- Chốt kỳ
- Kỳ vọng: phát sinh (B) = **44.400.000 VND**

**Thanh toán**: 
- Menu → **Công Nợ VT > Nhập Liệu**
- Dòng 1 (chuyển khoản):
  - Ngày: **20/05/2026**
  - Loại: **Trả tiền**
  - Số tiền: **100.000.000 VND**

Kỳ vọng đối chiếu: A=189.805.120, B=44.400.000, C=100.000.000 → Nợ cuối = **255.005.120**

### 2.4 Kỳ 3 (27/5 → 26/6/2026)

**Phiếu ngày**:

| Ngày | Vật tư | Số lượng | Đơn giá | Dự án |
|---|---|---|---|---|
| 05/06/2026 | Gạch A1 | 8.000 viên | *để trống* | Trại Chuối |
| 25/06/2026 | Gạch A1 | 5.400 viên | *để trống* | Trại Chuối |
| 25/06/2026 | Gạch A1 | 5.400 viên | *để trống* | Trại Chuối |

**Chốt kỳ**:
- Tháng 6/2026 → mặc định **27/05/2026 → 26/06/2026** ✓
- Giá: **1.850 đ/viên** (3 phiếu đầu), **1.450 đ/viên** (2 phiếu cuối)
- Kỳ vọng: B = **30.460.000 VND**

Kỳ vọng đối chiếu: A=255.005.120 (carry-over), B=30.460.000, C=0 → Nợ cuối = **285.465.120**

### 2.5 Ký xác nhận

Tab **Đối chiếu công nợ** → chọn kỳ 27/4→26/5:
- A (đầu kỳ) = **189.805.120** ✓
- B (phát sinh) = **44.400.000** ✓
- C (trả) = **100.000.000** ✓
- Nợ cuối = **255.005.120** ✓
- Click **In** → "Ký" (NCC ký xác nhận)

Rồi kỳ 27/5→26/6:
- A = **255.005.120** ✓
- B = **30.460.000** ✓
- C = **0** ✓
- Nợ cuối = **285.465.120** ✓
- Ký xác nhận

**Kiểm tra khoá kỳ**: Thêm phiếu ngày 10/05/2026 → hệ thống từ chối (kỳ 27/4→26/5 đã ký).

## Bước 3 — Bê Tông Hải Phòng: Thuế hoá đơn tab Thanh toán

1. **Số dư đầu**: Chủ thể Ngô Quyền, NCC Bê Tông HP, ngày 26/04/2026, TT = **X** (ghi giá trị nếu có, hoặc 0).
2. **Phiếu ngày kỳ 27/4→26/5** (ít nhất 1 phiếu): 
   - Ngày, Bê tông, SL, dự án (vd. Tân Lộc CDC)
   - Không gán giá lúc nhập
3. **Chốt kỳ** tháng 5/2026 → gán giá → chốt.
4. **Tab Thanh toán** (`/vat-tu-ncc/Bê Tông HP/thanh-toan`):
   - Dòng 1: Loại **Thanh toán** (chuyển khoản), số tiền **(một số)**
   - Dòng 2: Loại **Thuế hoá đơn** (TT), số hoá đơn bắt buộc, số tiền **11.448.000 VND**
   - Ngày: **20/05/2026** (kỳ 27/4→26/5)
   - Lưu
5. **Đối chiếu công nợ**: Kiểm tra dòng thuế hoá đơn xuất hiện ở cột "Thuế HĐ" (Lấy hàng).

## Bước 4 — Lộc Tài: Báo giá + 2 công trình

1. **Số dư đầu**: Chủ thể Ngô Quyền, NCC Lộc Tài, 26/04/2026.
2. **Báo giá** (`/vat-tu-ncc/Lộc Tài/bao-gia`):
   - Vật tư "Ca (máy xúc)"
   - Dòng 1: từ **01/05/2026**, giá **3.300.000 đ/ca**
   - Dòng 2: từ **15/06/2026**, giá **2.600.000 đ/ca**
   - Dòng 3: từ **01/07/2026**, giá **3.000.000 đ/ca**
   - Sửa dòng 1 → giá đổi thành **3.400.000** → lưu (kiểm tra "Giảm" / "Tăng" badge).
3. **Phiếu ngày kỳ 27/5→26/6**:
   - Dòng 1: 05/06/2026, Ca, 10 ca, dự án ĐVP - CDC
     - Khi tạo phiếu, form tự điền giá **2.600.000** (báo giá hiệu lực 15/6? → cần kiểm tra logic gợi ý).
   - Dòng 2: 20/06/2026, Ca, 8 ca, dự án Tân Lộc CDC
     - Tự điền giá **2.600.000** (?).
4. **Chốt kỳ** tháng 6 → kiểm tra phát sinh tách theo công trình (2 công trình = 2 hàng trong đối chiếu sau này).

## Bước 5 — Tổng hợp NCC × Chủ thể

Menu → **Công Nợ VT > Tổng hợp NCC × Chủ thể** (`/cong-no-vt/tong-hop`)

1. **Bộ chọn mốc** (report-period-selector):
   - Preset: **Toàn bộ** (mặc định)
   - Kiểm tra URL: không có tham số `?period=` → hệ thống dùng mặc định
   - Nút "Áp dụng" (không hook URL)

2. **Ma trận** (6 cột × N dòng NCC + TỔNG CÔNG TY):
   - Cột: Chủ thể | LH TT | Trả TT | Nợ TT | LH HĐ | Trả HĐ | Nợ HĐ
   - Dòng: Ngô Quyền (3 NCC) → cộng lại | TỔNG CÔNG TY
   - So cột "Nợ TT" với "Tổng nợ" từ tab **Đối chiếu công nợ** của từng NCC:
     - Nam Hương nợ TT = 255.005.120 + 285.465.120 = **540.470.240** (hoặc chỉ kỳ gần nhất tùy preset)
     - Bê Tông HP nợ TT = **X** (+ thuế HĐ đã nhập)
     - Lộc Tài nợ TT = **Y** (tách 2 công trình)
   - Verify: tổng Nợ TT của Ngô Quyền = Nam + BTP + Lộc Tài

3. **Xuất Excel**:
   - Click "Xuất Excel" → `cong-no-tong-hop-toan-bo-den-nay.xlsx`
   - So với sheet "Công Nợ" của mẫu:
     - Header 2 hàng gộp ô (Chủ thể | LH TT / Trả TT / Nợ TT / LH HĐ / Trả HĐ / Nợ HĐ)
     - Dòng dữ liệu khớp ma trận
     - Tổng cộng cuối

## Bước 6 — Kiểm tra khoá kỳ & tuần tự hoá

1. **Khoá kỳ**: Thêm dòng vào kỳ đã ký → từ chối (lỗi "Kỳ đã ký").
2. **Tuần tự hoá**: Ghi sổ cái vật tư tay (admin action) khi có 2 transaction cùng NCC → verify khoá advisory được giữ.

## Bước 7 — Ghi kết quả

Tạo file `plans/261006-0307-vat-tu-ncc-cong-no-tong-theo-moc-thoi-gian/reports/pilot-result.md`:

```markdown
# Kết quả pilot

## Nam Hương 3 kỳ

- Kỳ 1 (01/4→27/4): Skip ✓
- Kỳ 2 (27/4→26/5): A=189.805.120 ✓, B=44.400.000 ✓, C=100.000.000 ✓, Nợ=255.005.120 ✓
- Kỳ 3 (27/5→26/6): A=255.005.120 ✓, B=30.460.000 ✓, C=0 ✓, Nợ=285.465.120 ✓
- Ký kỳ 2 + 3: ✓
- Khoá kỳ: ✓ (thêm phiếu vào kỳ đã ký → từ chối)

## Bê Tông Hải Phòng — Thuế hoá đơn

- Tab Thanh toán: ✓ (ghi TT + thuế HĐ)
- Thuế HĐ 11.448.000 xuất hiện ở cột Lấy hàng (Thuế HĐ): ✓
- Tổng nợ TT = [giá trị thực]: [khớp/lệch]

## Lộc Tài — Báo giá + 2 công trình

- Báo giá: giá đổi 3.300.000 → 3.400.000 ✓
- Gợi ý giá khi nhập phiếu: [kỳ vọng vs thực tế]
- 2 công trình tách trong đối chiếu: ✓
- Chốt kỳ: ✓

## Tổng hợp NCC × Chủ thể

- Bộ chọn mốc "Toàn bộ": ✓
- Ma trận 6 cột: ✓
- Nợ TT (cộng 3 NCC) = [giá trị]: [khớp/lệch]
- Excel xuất: ✓ (header 2 hàng, số khớp ma trận)

## Kiểm tra toàn hệ thống

- Audit ngày sổ cái: 0 ✓
- Tuần tự hoá NCC: [kiểm tra được/cần hoàn thiện]
- Tất cả tests xanh: ✓
```

Điền vào các ô [khớp/lệch] và [thực tế] sau khi chạy pilot.

---

**Tham chiếu**: `plans/260729-1543-vat-tu-thang-doi-chieu-cong-no/reports/nam-huong-pilot-runbook.md` (mẫu cũ cho 1 NCC, mục số dư + phiếu + chốt kỳ).
