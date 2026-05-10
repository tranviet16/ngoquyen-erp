---
phase: 7
title: "Module: Sản lượng – Doanh thu"
status: pending
priority: P2
effort: "1w"
dependencies: [3]
---

# Phase 7: Module Sản lượng – Doanh thu

## Overview
Theo dõi chỉ tiêu (KPI) sản lượng & doanh thu tháng theo dự án, so sánh với thực hiện, cộng tiến độ nộp tiền của chủ đầu tư.

## Requirements
**Functional:**
- Chỉ tiêu SL/DT theo (project, year, month)
- Báo cáo SL thực hiện theo tháng (lấy từ `ProjectAcceptance.amountInternalVnd` của Phase 3)
- Báo cáo DT theo tháng (lấy từ `ProjectAcceptance.amountCdtVnd` + collection)
- Tiến độ nộp tiền: kế hoạch các đợt vs thực tế
- Tiến độ XD: % hoàn thành theo dự án × tháng
- Báo cáo summary: tổng/tháng, tổng/dự án, % hoàn thành chỉ tiêu

**Non-functional:**
- Aggregate query phải nhanh (cache layer hoặc materialized view nếu cần)

## Architecture
**Schema:**
```prisma
model SlDtTarget {                  // Chỉ tiêu SL DT Tháng
  id          Int @id @default(autoincrement())
  projectId   Int
  year        Int
  month       Int
  slTarget    Decimal @db.Decimal(18,2)   // sản lượng kế hoạch (VNĐ)
  dtTarget    Decimal @db.Decimal(18,2)   // doanh thu kế hoạch
  note        String?
  @@unique([projectId, year, month])
}

model PaymentSchedule {              // Tiến độ nộp tiền
  id          Int @id @default(autoincrement())
  projectId   Int
  batch       String                 // "Đợt 1", "Đợt 2"
  planDate    DateTime
  planAmount  Decimal @db.Decimal(18,2)
  actualDate  DateTime?
  actualAmount Decimal? @db.Decimal(18,2)
  status      String                 // "pending|paid|overdue"
  note        String?
}
```

**Computed (view):**
```sql
CREATE VIEW vw_sl_dt_actual AS
  SELECT project_id,
         date_part('year', accepted_at) AS year,
         date_part('month', accepted_at) AS month,
         sum(amount_internal_vnd) AS sl_actual,
         sum(amount_cdt_vnd) AS dt_actual
  FROM project_acceptance
  WHERE accepted_at IS NOT NULL
  GROUP BY project_id, year, month;
```

**UI:**
```
/sl-dt
├── page.tsx                       ← summary all-projects
├── chi-tieu/page.tsx              ← AG Grid editable target
├── bao-cao-sl/page.tsx            ← read-only (target vs actual)
├── bao-cao-dt/page.tsx
├── tien-do-nop-tien/page.tsx
└── tien-do-xd/page.tsx
```

## Related Code Files
**Create:**
- `prisma/schema.prisma` (2 models + view)
- `lib/sl-dt/{target,payment-schedule,report}-service.ts`
- `app/(app)/sl-dt/{page,chi-tieu,bao-cao-sl,bao-cao-dt,tien-do-nop-tien,tien-do-xd}/page.tsx`
- `components/sl-dt/sl-dt-grid.tsx`
- `components/sl-dt/payment-schedule-form.tsx`

## Implementation Steps
1. Migration 2 models + view
2. Service CRUD chỉ tiêu + payment schedule
3. Service report: join target × actual view → compute %
4. Page chỉ tiêu: AG Grid theo (project × month) ma trận
5. Page báo cáo SL/DT: bảng so sánh target vs actual + % + chênh lệch
6. Page tiến độ nộp tiền: timeline view + danh sách đợt + cảnh báo overdue
7. Page tiến độ XD: bảng project × month, % hoàn thành (lấy từ ProjectSchedule)
8. Verify với "SL - DT 2025.xlsx" mẫu (sheets BC_SanLuong, BC_DoanhThu, TIẾN ĐỘ NỘP TIỀN)

## Success Criteria
- [ ] Chỉ tiêu CRUD qua grid
- [ ] Báo cáo SL/DT tự động khớp với Excel mẫu
- [ ] Tiến độ nộp tiền cảnh báo đợt quá hạn
- [ ] Filter theo year/month/project hoạt động
- [ ] Export Excel cho báo cáo (handled in Phase 9)

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Sản lượng định nghĩa khác doanh thu (gross vs net) — dễ nhầm | Comment rõ trong code: SL = giá trị nghiệm thu nội bộ; DT = giá trị nghiệm thu CĐT |
| Project chưa có data Phase 3 thì báo cáo trống | Hiển thị "—" thay vì 0 để rõ ý nghĩa |
| Excel mẫu có nhiều sheet trùng (mỗi tháng 1 sheet) | Ta dùng 1 bảng + filter, không tạo sheet/tháng — báo trước với user |
