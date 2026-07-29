# Phase 05 — Kiểm chứng: opening + tái lập 2 kỳ Nam Hương + lưới an toàn

## Context links
- Brainstorm §Quyết định #8, §Chỉ số thành công
- Scout §1.3 (số cụ thể Nam Hương: 310.605.120 → 255.005.120 → 285.465.120)
- 5 file Excel gốc, đặc biệt `SOP/theo-doi-vat-tu-thang/Gạch Nam Hương.xlsx`

## Overview
Nạp dữ liệu Nam Hương vào ERP bằng tay (không importer): (a) tạo Entity Chủ thể + gán vào các Project liên quan; (b) nhập `LedgerOpeningBalance` cho các (entity, supplier, project) từ số `A` kỳ đầu quan sát trong Excel; (c) tái lập 2 kỳ gần nhất (T5, T6/2026) bằng cách nhập phiếu ngày + gắn giá + chốt kỳ + ghi thanh toán; (d) so khớp với Excel; (e) thêm báo cáo so khớp phiếu↔ledger làm lưới an toàn để phát hiện lệch tương lai.

## Key Insights
- Excel `A` kỳ đầu Nam Hương = `=35866799+109336700+44600000+1621` — 4 project cấu thành. Nhập opening tách theo project để tự nhiên gộp lại khi in.
- Kỳ ~26/27 lệch chuẩn trong Excel — chỉ ảnh hưởng khâu nhập; sau khi vào ERP, kỳ chốt của ERP là 27→26 chuẩn. Phase 4 dùng ngày event, không phụ thuộc `periodFrom/periodTo` Excel.
- Payment Nam Hương Excel toàn CK tròn (100.000.000) — nhập qua `cong-no-vt/nhap-lieu` (ngoài đợt) là nhanh nhất cho pilot; hoặc tạo PaymentRound giả để verify Phase 3.
- "Lưới an toàn" = report so khớp Σ `qty*unitPrice` từ `supplier_delivery_daily` với Σ `amountTt` `lay_hang` linked (`deliveryId`) trong cùng khoảng — highlight orphan.

## Requirements
1. Runbook `plans/260729-1543-vat-tu-thang-doi-chieu-cong-no/reports/nam-huong-pilot-runbook.md` (bên trong `reports/`):
   - Danh sách project + entity cần tạo (từ Excel).
   - Danh sách opening cần nhập (4 dòng LedgerOpeningBalance).
   - Danh sách phiếu 2 kỳ (copy từ sheet "Vật tư ngày" Nam Hương).
   - Bảng giá theo kỳ (từ sheet "Đối chiếu": 1.900 / 1.850 / 1.450 đ/viên).
   - Bảng thanh toán 2 kỳ.
   - Số kỳ vọng A/B/C/Tổng nợ đối chiếu Excel.
2. Route `/vat-tu-ncc/[supplierId]/kiem-tra-khop` (báo cáo lưới an toàn, admin-only):
   - Bảng liệt kê phiếu `date ∈ [from..to]` mà không có ledger event (`deliveryId` NULL match).
   - Bảng liệt kê ledger `lay_hang` `date ∈ [from..to]` với `deliveryId=NULL` (nhập tay lịch sử — có thể hợp lệ, nhưng highlight).
   - Bảng liệt kê chênh: Σ `qty*unitPrice` (phiếu) vs `amountTt` (event) theo (supplier, item, period).
3. Service `lib/vat-tu-ncc/period-recon-check-service.ts` — 1 raw SQL FULL OUTER JOIN.
4. Test integration mô phỏng luồng end-to-end Nam Hương pilot (dùng seed subset):
   - Setup: entity + 3 project + supplier + 3 opening + 8 phiếu + 2 thanh toán.
   - Assert: `computeReconciliation(kỳ 1)` → A/B/C/closing khớp giá trị Excel.
   - Assert: `computeReconciliation(kỳ 2).opening === computeReconciliation(kỳ 1).closing`.
   - Assert: `getMaterialCurrentBalance(asOf=periodTo kỳ 2)` gộp qua project khớp `Tổng nợ` cuối cùng.

## Architecture
```
Pilot chạy thủ công:
  Admin UI:
    1. Master data → tạo Entity + Project.entityId
    2. cong-no-vt/so-du-ban-dau → nhập 4 opening
    3. vat-tu-ncc/[NamHuong]/ngay → nhập phiếu 2 kỳ (không giá)
    4. vat-tu-ncc/[NamHuong]/chot-ky → chọn tháng, gắn giá, chốt
    5. cong-no-vt/nhap-lieu → nhập 2 thanh toán (hoặc dùng PaymentRound)
    6. vat-tu-ncc/[NamHuong]/doi-chieu → tạo kỳ, xem chi tiết, đối chứng số Excel
    7. Ký kỳ → verify lock

Automated safety net:
  vat-tu-ncc/[NamHuong]/kiem-tra-khop
    ├── orphan deliveries (no linked event)
    ├── orphan events (deliveryId NULL, historical)
    └── amount mismatch per (supplier, item, period)
```

## Related code files
- `lib/vat-tu-ncc/period-recon-check-service.ts` (MỚI)
- `app/(app)/vat-tu-ncc/[supplierId]/kiem-tra-khop/page.tsx` (MỚI)
- `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx` (thêm tab "Kiểm tra khớp" — admin-only, hoặc gate bằng role)
- `test/integration/vat-tu-ncc-pilot.integration.test.ts` (MỚI — dùng mẫu `cong-no-luy-ke.integration.test.ts`)
- `plans/260729-1543-vat-tu-thang-doi-chieu-cong-no/reports/nam-huong-pilot-runbook.md` (MỚI)

## Implementation Steps
1. Trích số từ Excel Nam Hương ra runbook (dùng Read PDF/xlsx nếu cần; hoặc mở file trong Excel). Ghi chú: dùng `docx/` không đúng workspace — dùng `SOP/`.
2. Viết `period-recon-check-service.ts` — 1 SQL với 3 SELECT UNIONed hoặc trả về 3 field.
3. Route + trang bảng đơn giản (table + subtotal chênh lệch).
4. Thêm tab "Kiểm tra khớp" (chỉ hiển thị nếu user là admin — dùng `canAccessEntitlement`).
5. Viết integration test tự động end-to-end (không cần chạy tay).
6. Chạy pilot tay theo runbook, ghi kết quả vào `reports/nam-huong-pilot-result.md` (viết sau khi chạy — trong phase implementation, không tạo trước).

## Todo list
- [ ] Viết `nam-huong-pilot-runbook.md` từ Excel (số + phiếu + thanh toán)
- [ ] `period-recon-check-service.ts` với 3 rule check
- [ ] Route + page "kiem-tra-khop" (admin-only)
- [ ] Cập nhật tab layout (conditional render)
- [ ] Integration test end-to-end pilot Nam Hương (assert số Excel)
- [ ] Chạy pilot thủ công theo runbook — điền kết quả `reports/nam-huong-pilot-result.md`
- [ ] Nếu lệch: root-cause trong runbook (dữ liệu sai vs. logic sai)

## Success Criteria
- Integration test end-to-end pass: A/B/C/Tổng nợ khớp Excel Nam Hương 2 kỳ trong sai số 0đ.
- Pilot thủ công: kế toán tự vận hành xong 2 kỳ Nam Hương, số in ra khớp Excel; kỳ ký khóa được write mới.
- Báo cáo kiểm tra khớp Nam Hương 2 kỳ: 0 orphan, 0 mismatch.
- Rollout khả thi: các NCC còn lại (Phương Minh, Anh Thư, Lộc Tài, Quang Minh) chỉ cần lặp runbook, không cần code thêm.

## Risk Assessment
| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Excel Nam Hương có dữ liệu bẩn (STT sót, ngày đảo) | Cao | Runbook làm sạch trước khi nhập; nhập tay có kiểm soát |
| Opening 4 project tách trong Excel nhưng gộp dưới `A` | Trung bình | Nhập LedgerOpeningBalance từng project riêng — Phase 4 gộp khi in |
| Kỳ Excel lệch biên (28→26) → phiếu ngày 27 rơi vào kỳ ERP nhưng không kỳ Excel | Trung bình | Runbook chú thích cách hiệu chỉnh; chấp nhận sai lệch có kiểm soát, note vào kết quả pilot |
| Thanh toán Excel không có ngày rõ (tròn 100tr) | Thấp | Dùng ngày cuối kỳ hoặc ngày sổ phụ thực tế của kế toán |

## Security Considerations
- Tab "Kiểm tra khớp" ẩn với non-admin (đọc dữ liệu thô ledger + phiếu).
- Runbook chứa số tiền thực → giữ trong repo (không public); không có PII.

## Next steps
Sau khi Nam Hương pilot pass, tuyên bố plan hoàn thành. Rollout các NCC còn lại là công tác data-entry theo runbook mẫu — không nằm trong scope plan này (KISS).
