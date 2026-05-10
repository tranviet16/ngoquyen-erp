---
phase: 4
title: "Migrate SL-DT Input Tables"
status: pending
priority: P2
effort: "2d"
dependencies: [1]
---

# Phase 4: Migrate SL-DT Input Tables

## Overview

Migrate các bảng nhập liệu Sản lượng / Doanh thu sang `<DataGrid>`: `nhap-thang-moi` (monthly inputs), `tien-do-xd` (tiến độ xây dựng), `tien-do-nop-tien` (tiến độ nộp tiền), `cau-hinh` (config phases/groups/lots nếu là dạng bảng).

## Requirements

**Functional:**
- `nhap-thang-moi`: bảng nhập SL/DT theo lot × tháng — cần fill handle để copy giá trị xuống
- `tien-do-xd`: nhập tiến độ phần trăm theo lot × tháng
- `tien-do-nop-tien`: nhập số tiền nộp theo period
- `cau-hinh`: CRUD lots, phases, groups (nếu là bảng)

**Non-functional:**
- Tôn trọng aggregation (lot → group → phase) — chỉ edit ở cấp lot, các cấp trên là read-only rollup ở reports
- Preserve `phaseCode`/`groupCode`/`sortOrder`/`deletedAt`

## Architecture

```
app/(app)/sl-dt/nhap-thang-moi/page.tsx
  └─ <SlDtMonthlyInputGrid>
       └─ <DataGrid<MonthlyInputRow>>
            ├─ columns: lotName (readonly), [12 tháng × SL/DT] hoặc pivoted
            └─ handlers → upsertMonthlyInput / bulkUpsert

app/(app)/sl-dt/tien-do-xd/page.tsx → <SlDtTienDoXdGrid>
app/(app)/sl-dt/tien-do-nop-tien/page.tsx → <SlDtTienDoNopTienGrid>
app/(app)/sl-dt/cau-hinh/page.tsx → <SlDtCauHinhGrid> (nếu bảng)
```

## Related Code Files

**Create:**
- `components/sl-dt/monthly-input-grid.tsx`
- `components/sl-dt/tien-do-xd-grid.tsx`
- `components/sl-dt/tien-do-nop-tien-grid.tsx`
- `components/sl-dt/cau-hinh-grid.tsx` (conditional — chỉ nếu cau-hinh dạng bảng)

**Modify:**
- 4 page files tương ứng
- `lib/sl-dt/monthly-input-service.ts` (hoặc tương đương) — thêm `bulkUpsertMonthlyInputs`
- `lib/sl-dt/progress-service.ts` (hoặc tương đương) — thêm bulk variant

## Implementation Steps

1. Scout từng page hiện tại:
   - `Read app/(app)/sl-dt/nhap-thang-moi/page.tsx` — hiểu data shape, hiện đang render gì
   - Tương tự cho 3 page còn lại
2. Quyết định layout cho `nhap-thang-moi`:
   - **Option A**: pivot — row = lot, cols = [T1 SL, T1 DT, T2 SL, T2 DT, ...]
   - **Option B**: long — row = (lot, month), cols = [SL, DT]
   - Recommend A (gần Excel hơn, fill handle hữu ích kéo ngang/dọc)
3. Viết grid components, map handlers tương tự Phase 2
4. Thêm `bulkUpsert*` vào service tương ứng
5. Update page files, swap component
6. Test: edit 1 cell, paste 12×2 (1 năm), add lot mới, soft delete

## Success Criteria

- [ ] `/sl-dt/nhap-thang-moi` render `<DataGrid>`, paste 1 năm dữ liệu từ Excel hoạt động
- [ ] `/sl-dt/tien-do-xd` edit phần trăm tiến độ → reflect ngay ở `/sl-dt/bao-cao-sl`
- [ ] `/sl-dt/tien-do-nop-tien` → reflect ở `/sl-dt/chi-tieu` cột "DT cần thực hiện theo tiến độ"
- [ ] Báo cáo rollup (`bao-cao-sl`, `bao-cao-dt`, `chi-tieu`) không regression

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Pivot layout có 24 cột (12 tháng × SL+DT) → Glide handle ổn nhưng config dài | Generate columns array bằng loop, không hard-code |
| Phase/group rows trong cau-hinh có hierarchy | Nếu bảng, dùng grouped rows feature của Glide; nếu phức tạp, giữ HTML table và OOS phase này |
| Tiến độ nộp tiền có period dynamic | Cấu hình period range qua filter, columns adapt theo |
| Edit ở `tien-do-nop-tien` ảnh hưởng compute "DT cần thực hiện" | `router.refresh()` sau edit để recompute server-side |

## Dependencies

Blocked by Phase 1. Có thể chạy song song với Phase 2, 3.
