# SL-DT: Nhập tháng mới — clone đầy đủ 4 sheets

**Status:** pending
**Goal:** UX 1-trang để tạo báo cáo SL/DT/Chỉ tiêu/Tiến độ XD tháng mới, kế thừa đầy đủ từ tháng trước theo cấu trúc 4 sheets Excel.

## Quyết định đã chốt
- (1) Lũy kế: auto-compute = prev + kỳ (cho phép override với cảnh báo)
- (2) `qtTratChua`: kế thừa nguyên trạng từ tháng trước
- (3) 6 stage texts (Tiến độ XD): kế thừa nguyên trạng

## Phases

### Phase 1 — Server action `cloneFromPreviousMonth(year, month)`
File: `app/(app)/sl-dt/nhap-thang-moi/actions.ts` (new)
- Tìm tháng gần nhất < (year, month) có data trong `sl_dt_monthly_inputs`.
- Cho mỗi `lot` (deletedAt null):
  - Insert `sl_dt_monthly_inputs(lotId, year, month, ...)` với:
    - `estimateValue, contractValue, qtTratChua` ← copy raw từ prev
    - `slThucKyTho=0, slKeHoachKy=0, dtThoKy=0, dtKeHoachKy=0, dtTratKy=0` (kỳ mới reset)
    - `slTrat` ← copy prev (luỹ kế trát, ít đổi)
    - `slLuyKeTho ← prev.slLuyKeTho`, `dtThoLuyKe ← prev.dtThoLuyKe`, `dtTratLuyKe ← prev.dtTratLuyKe` (sẽ tự cộng khi user nhập kỳ)
  - Insert `sl_dt_progress_statuses(...)`: copy nguyên 8 cột text (milestone + settlement + 6 stage)
- ON CONFLICT DO NOTHING (idempotent — không ghi đè nếu đã có).

### Phase 2 — Page server `/sl-dt/nhap-thang-moi`
Files: `page.tsx`, dùng searchParams `?year=&month=`.
- Default tới tháng kế tiếp tháng mới nhất có data.
- Load: lots + existing inputs/progress cho `(y,m)` + previousInputs cho cả 64 lô (để biết luỹ kế baseline để client auto-compute).
- Nếu empty → render banner "Tạo từ tháng X" (gọi action Phase 1).
- Nếu đã có → render form Phase 3.

### Phase 3 — Client form với 4 tabs
File: `nhap-thang-moi-client.tsx` (mới, < 200 dòng — split components)
- Tabs: "Sản lượng", "Doanh thu", "Chỉ tiêu", "Tiến độ XD".
- Mỗi tab = 1 bảng spreadsheet, 1 row/lô.
- Cols editable: input number/text. Cols derived (luỹ kế, %, còn phải): tính realtime via `compute.ts`, hiển thị xám.
- Lũy kế: hiển thị `prev + kỳ`; user gõ override → hiện badge ⚠ nếu lệch.
- Bottom toolbar: "Lưu tháng X" (gọi action Phase 4) + "Reset từ tháng trước".

### Phase 4 — Server action `saveMonthlyData(year, month, payload)`
- Bulk upsert `sl_dt_monthly_inputs` + `sl_dt_progress_statuses` trong 1 transaction.
- Validation: year/month range, Decimal range, lot tồn tại.

### Phase 5 — Wire-up
- Thêm card "Nhập tháng mới" vào `/sl-dt/page.tsx`.
- Type-check + smoke build.

## Files
**New:**
- `app/(app)/sl-dt/nhap-thang-moi/page.tsx`
- `app/(app)/sl-dt/nhap-thang-moi/actions.ts`
- `app/(app)/sl-dt/nhap-thang-moi/nhap-thang-moi-client.tsx`
- `app/(app)/sl-dt/nhap-thang-moi/tab-san-luong.tsx`
- `app/(app)/sl-dt/nhap-thang-moi/tab-doanh-thu.tsx`
- `app/(app)/sl-dt/nhap-thang-moi/tab-chi-tieu.tsx`
- `app/(app)/sl-dt/nhap-thang-moi/tab-tien-do-xd.tsx`

**Modified:**
- `app/(app)/sl-dt/page.tsx` — thêm card link.

## Out of scope
- Không đụng adapter / parser (đã ổn).
- Không thay đổi schema (đủ cột rồi).
- Không thêm filter "ẩn lô không có data" — phase sau.
