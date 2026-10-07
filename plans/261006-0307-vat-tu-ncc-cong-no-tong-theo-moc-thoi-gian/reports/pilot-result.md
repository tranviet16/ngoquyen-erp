# Kết quả pilot — 3 NCC, thuế HĐ, tổng hợp NCC × Chủ thể

- Ngày chạy: 07/10/2026
- Môi trường: container `ngoquyen-erp-3001` (127.0.0.1:3001, build lại từ working tree `main` @ `ac96064`), DB thật `ngoquyyen_erp` (docker-postgres-1:5433)
- Runbook: [pilot-excel-mau-runbook.md](pilot-excel-mau-runbook.md)
- Kết luận: **Đạt.** 5 mục tiêu đều khớp. Có 3 lỗi/khoảng trống ngoài phạm vi khoá kỳ (xem "Phát hiện") và 11 chỗ runbook cần sửa.

## Trước khi chạy

| Bước | Kết quả |
|---|---|
| Sao lưu DB | ✓ — `pg_dump` qua `docker exec` (`scripts/backup-db.sh` không chạy được trên Windows) |
| `prisma migrate deploy` | ✓ — áp dụng `20261006110000_normalize_ledger_dates_to_business_day` |
| Audit ngày sổ cái | ✓ — 0 dòng lệch (lệnh đúng: `npx tsx --env-file=.env scripts/audit-ledger-dates.ts`) |
| `pnpm test:integration` | ✓ — lần 1: 1 file lỗi chập chờn; chạy lại: 16/16 file xanh |

## Nam Hương — 2 kỳ + ký + khoá kỳ

Số dư đầu thực tế trên DB là **310.605.120 asOf 27/04/2026**, không phải 189.805.120 asOf 31/03 như runbook. Vì vậy kỳ đầu bắt đầu **28/04** (sau mốc số dư), không phải 27/04.

| Kỳ | A (đầu kỳ) | B (phát sinh) | C (trả) | Nợ cuối | Ký | Khớp |
|---|---|---|---|---|---|---|
| 28/04 → 26/05 | 310.605.120 | 44.400.000 | 100.000.000 | 255.005.120 | ✓ | khớp Nợ cuối runbook. A lệch runbook vì số dư đầu khác |
| 27/05 → 26/06 | 255.005.120 | 30.460.000 | 0 | 285.465.120 | ✓ | khớp |

- Giá kỳ 2: 1.850 × 3 phiếu; kỳ 3: 1.850 (phiếu 05/06) và 1.450 × 2 phiếu 25/06. Kết quả B khớp.
- **Khoá kỳ:** thêm phiếu ngày 10/05/2026 → server từ chối ✓. Tuy nhiên UI **không hiện thông báo lỗi** (xem Phát hiện 2).

## Bê Tông Hải Phòng — Thuế hoá đơn

- Số dư đầu: 0, asOf 26/04/2026.
- Phiếu 15/05/2026: Bê tông 12 m³, Tân Lộc CDC, nhập không giá.
- Chốt kỳ 27/04 → 26/05: giá 1.000.000 → B = 12.000.000 ✓.
  - Gợi ý mặc định là 15/05 → 26/05, tức từ ngày phiếu đầu tiên. Đây là hành vi thiết kế khi NCC chưa có marker (`lib/vat-tu-ncc/__tests__/period-bounds.test.ts`), nên đã sửa tay "Từ" thành 27/04.
- Tab Thanh toán:
  - Chuyển khoản 5.000.000, ngày 20/05.
  - Thuế HĐ 11.448.000, số HĐ `PILOT-HD-0001`, ngày 20/05.
  - Kết quả: "Nợ hiện tại" = 18.448.000 ✓.
- Đối chiếu 27/04 → 26/05: A 0, B 12.000.000, C 5.000.000, **Thuế/ĐC 11.448.000**, Tổng 18.448.000 ✓.
  - Cột tên "Thuế/ĐC" trên UI; runbook ghi "Thuế HĐ".
- Kỳ chưa ký (theo runbook không yêu cầu ký).

## Lộc Tài — Báo giá + 2 công trình

| Dòng | Hiệu lực | Giá | Giá trước | Chênh | Badge |
|---|---|---|---|---|---|
| 1 | 01/05/2026 | 3.300.000 → sửa **3.400.000** ✓ | — | — | Mới |
| 2 | 15/06/2026 | 2.600.000 | 3.400.000 | −800.000 | Giảm ✓ |
| 3 | 01/07/2026 | 3.000.000 | 2.600.000 | +400.000 | Tăng ✓ |

- **Gợi ý giá khi nhập phiếu:**
  - Phiếu 05/06: gợi ý **3.400.000**. Đúng theo ngày hiệu lực, vì báo giá 2.600.000 chỉ áp dụng từ 15/06. Runbook đoán 2.600.000 là sai.
  - Phiếu 20/06: gợi ý 2.600.000 ✓.
- **Tách công trình:** phiếu 05/06 (10 ca, ĐVP-CDC) = 34.000.000 và phiếu 20/06 (8 ca, Tân Lộc CDC) = 20.800.000. Đây là 2 dòng sổ cái với `projectId` khác nhau ✓.
- **Chốt kỳ 27/05 → 26/06:** B = **54.800.000** ✓ (toast "Đã chốt kỳ: 2 phiếu"). Kỳ chưa ký.
- Lộc Tài chưa có marker, nên kỳ đầu được phép bắt đầu 27/05 dù số dư đầu asOf 26/04. Đúng quy tắc hiện hành trong `lib/vat-tu-ncc/period-bounds.ts`.

## Tổng hợp NCC × Chủ thể (`/cong-no-vt/tong-hop`)

| NCC | LH TT | Trả TT | Nợ TT | Nợ đối chiếu | Khớp |
|---|---|---|---|---|---|
| Nam Hương | 385.465.120 | 100.000.000 | 285.465.120 | 285.465.120 | ✓ |
| Bê Tông HP | 23.448.000 | 5.000.000 | 18.448.000 | 18.448.000 | ✓ |
| Lộc Tài HT | 54.800.000 | 0 | 54.800.000 | 54.800.000 | ✓ |
| **Tổng (Ngô Quyền = Tổng công ty)** | 463.713.120 | 105.000.000 | **358.713.120** | 358.713.120 | ✓ |

- **Preset "Toàn bộ":** mặc định, URL không có `?period=` ✓.
- **Preset "Kỳ chuẩn 27→26":**
  - T5/2026 → 27/04 – 26/05: Nam Hương Nợ 255.005.120, BTHP 18.448.000, Lộc Tài 0 ✓.
  - T6/2026 → 27/05 – 26/06: Nam Hương 285.465.120, BTHP 18.448.000 (chuyển số dư), Lộc Tài 54.800.000 ✓.
  - Nhãn biên 27→26 khớp Excel (mục tiêu 1).
- **Cột HĐ:** toàn bộ bằng 0, vì pilot chỉ nhập số TT. Thuế HĐ được ghi vào `amountTt`, đúng runbook "Thuế hoá đơn (TT)".
- **Xuất Excel:** đã gọi `POST /api/export/excel` trong trang và đọc file trong bộ nhớ, không lưu ra đĩa.
  - Tên file `cong-no-tong-hop-toan-bo-den-nay.xlsx`, HTTP 200, 19,6 KB.
  - Header 2 hàng gộp ô (`A2:A3`, `B2:G2` Ngô Quyền, `H2:M2` TỔNG CÔNG TY).
  - 3 dòng NCC khớp ma trận; dòng TỔNG = 463.713.120 / 105.000.000 / 358.713.120 ✓.
  - Chưa mở file bằng Excel desktop để xem định dạng hiển thị.

## Kiểm tra khoá kỳ & tuần tự hoá

- **Khoá kỳ:** ✓. Server từ chối phiếu vào kỳ đã ký (Nam Hương 10/05).
- **Tuần tự hoá NCC:** không kiểm được bằng thao tác UI đơn lẻ. Đã có integration test bao phủ, và test xanh:
  - `pg_advisory_xact_lock(hashtext('vat-tu-ncc:' || supplierId))` trong `lib/vat-tu-ncc/period-lock.ts`.
  - `test/integration/vat-tu-ncc-chot-ky-linh-hoat.integration.test.ts` gồm "hai lần chốt song song… chỉ một thành công" và "ghi thue_hd song song với ký kỳ".

## Phát hiện

1. **Sửa khoá của dòng số dư đầu tạo dòng trùng.**
   - Khi đổi NCC (hoặc chủ thể / dự án) của một dòng có sẵn trên lưới Số dư ban đầu, hệ thống tạo dòng mới và **giữ nguyên dòng cũ**. Tái hiện 2 lần.
   - Cơ chế:
     - `onAddRow` tạo dòng tạm với NCC mặc định (NCC đầu tiên) trong `components/ledger-grid/opening-grid.tsx`.
     - `patch` đi qua `setOpeningRow` (`lib/ledger/ledger-service.ts`), hàm này tìm dòng theo ledgerType + entity + party + project, không theo `id`.
   - Hậu quả: dòng rác số dư 0 của NCC sai. Pilot đã xoá tay 2 dòng (id 2, 4).
2. **Thêm phiếu ngày bị khoá kỳ không báo lỗi trên UI.**
   - `handleCreate` trong `components/vat-tu-ncc/delivery-grid.tsx` không có try/catch.
   - Production che lỗi server action (POST 500), nên dialog cứ đứng đó và người dùng không biết vì sao.
3. **Báo giá chỉ nhận vật tư loại `material`, nhưng Phiếu ngày nhận mọi loại.**
   - `app/(app)/vat-tu-ncc/[supplierId]/bao-gia/page.tsx` lọc `type: "material"`; `.../ngay/page.tsx` không lọc.
   - Kết quả: "Ca (máy xúc)" (loại `machine`) giao được nhưng không báo giá được.
   - Pilot đã đổi `CA-MX` sang `material` trong Danh mục vật tư. Cần chốt nghiệp vụ: báo giá có nhận ca máy không, hay phiếu ngày phải lọc như báo giá.

## Runbook cần sửa

1. Số dư đầu Nam Hương: 310.605.120 asOf 27/04/2026 (không phải 189.805.120 asOf 31/03). Vì vậy kỳ đầu là 28/04 → 26/05.
2. Lệnh audit cần `--env-file=.env`.
3. `scripts/backup-db.sh` không chạy trên Windows; cần thêm cách `docker exec … pg_dump`.
4. Chốt kỳ dùng ô Từ / Đến (dd/mm/yyyy), không có bộ chọn "Tháng 5/2026".
5. Nợ TT tổng hợp của Nam Hương là **285.465.120** (luỹ kế), không phải 540.470.240 (cộng 2 kỳ).
6. Kỳ 3 điền sẵn giá 1.850 cho mọi phiếu; phải sửa tay 2 phiếu 25/06 thành 1.450.
7. NCC chưa có marker: kỳ đầu gợi ý bắt đầu từ ngày phiếu đầu tiên, không phải ngày 27.
8. Cột thuế trên Đối chiếu có nhãn "Thuế/ĐC".
9. Gợi ý giá Lộc Tài phiếu 05/06 là 3.400.000, vì báo giá 2.600.000 hiệu lực từ 15/06.
10. Ma trận tổng hợp có 6 cột cho **mỗi** nhóm chủ thể và thêm nhóm TỔNG CÔNG TY (13 cột tổng cộng); dòng là NCC.
11. "Ca (máy xúc)" phải là loại `material` mới báo giá được (Phát hiện 3).

## Dữ liệu pilot đã tạo trên DB thật

| Loại | Bản ghi |
|---|---|
| Phiếu ngày (`supplier_delivery_daily`) | id 7 (BTHP, note `PILOT BTHP kỳ 5`), 8–9 (Lộc Tài, note `PILOT LT ca 1/2`). Id 1–6 Nam Hương có sẵn từ 04/08 — pilot chỉ gán giá khi chốt |
| Báo giá (`supplier_price_quotes`) | id 1–3, Lộc Tài, note `PILOT BG1..3` |
| Kỳ (`supplier_reconciliations`) | id 1–2 Nam Hương **đã ký**; id 3 BTHP, id 4 Lộc Tài chưa ký |
| Sổ cái vật tư (`ledger_transactions`) | id 2–12 (`lay_hang` sinh khi chốt; BTHP `thanh_toan` id 9, `thue_hd` id 10, HĐ `PILOT-HD-0001`). Id 1 (Nam Hương trả 100.000.000) có sẵn từ 04/08 |
| Số dư đầu (`ledger_opening_balances`) | id 3 BTHP 0; id 5 Lộc Tài 0 (đã xoá dòng rác id 2, 4). Id 1 Nam Hương 310.605.120 có sẵn từ 04/08 |
| Danh mục | Item `CA-MX` (id 3) đổi loại `machine` → `material` |

Hai kỳ Nam Hương đã ký nên khoá phiếu tháng 5–6 của NCC này. Nếu cần dọn pilot phải huỷ ký / khôi phục từ bản sao lưu.

## Câu hỏi còn mở (chưa triển khai)

- Có bắt buộc ký kỳ theo thứ tự không?
- Có xử lý các importer ghi SQL thô (bỏ qua khoá kỳ) không?
