---
phase: 2
title: Schema + Cleanup Migration
status: pending
priority: P1
effort: 4h
dependencies: []
---

# Phase 2 — Schema + Cleanup Migration

## Overview
Tạo entity `SlDtLot` độc lập + 4 bảng phụ trợ. Migrate 67 Project rows hiện hữu sang `sl_dt_lot` (giữ id), update FK của `sl_dt_targets` và `payment_schedules`, soft-delete 67 Project rows.

## Schema (Prisma)

```prisma
model SlDtLot {
  id              Int      @id @default(autoincrement())
  code            String   @unique  // "Lô 5A"
  lotName         String              // free-text
  phaseCode       String              // "I", "II", "III"
  groupCode       String              // "A", "B"
  sortOrder       Int                 // ordering trong group
  estimateValue   Decimal  @db.Decimal(18, 2)  // Giá trị dự toán (cột C SL)
  contractValue   Decimal? @db.Decimal(18, 2)  // Giá trị HĐ (cột D DT) — có thể null nếu chưa ký
  deletedAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  targets         SlDtTarget[]
  paymentPlan     SlDtPaymentPlan?
  monthlyInputs   SlDtMonthlyInput[]
  progressStatus  SlDtProgressStatus[]

  @@index([phaseCode, groupCode, sortOrder])
  @@map("sl_dt_lots")
}

model SlDtMilestoneScore {
  id            Int      @id @default(autoincrement())
  milestoneText String   @unique  // "Mái tầng 1", "Xong khung BTCT"
  score         Int                 // numeric score (5, 10, 20, ...)
  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@map("sl_dt_milestone_scores")
}

model SlDtPaymentPlan {
  id              Int      @id @default(autoincrement())
  lotId           Int      @unique
  dot1Amount      Decimal  @db.Decimal(18, 2) @default(0)
  dot1Milestone   String?  // text — references SlDtMilestoneScore.milestoneText
  dot2Amount      Decimal  @db.Decimal(18, 2) @default(0)
  dot2Milestone   String?
  dot3Amount      Decimal  @db.Decimal(18, 2) @default(0)
  dot3Milestone   String?
  dot4Amount      Decimal  @db.Decimal(18, 2) @default(0)
  dot4Milestone   String?  // thường = "Quyết toán"
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lot             SlDtLot  @relation(fields: [lotId], references: [id], onDelete: Cascade)
  @@map("sl_dt_payment_plans")
}

model SlDtMonthlyInput {
  id                Int      @id @default(autoincrement())
  lotId             Int
  year              Int
  month             Int
  // Sản lượng inputs
  slKeHoachKy       Decimal  @db.Decimal(18, 2) @default(0)
  slThucKyTho       Decimal  @db.Decimal(18, 2) @default(0)
  slLuyKeTho        Decimal  @db.Decimal(18, 2) @default(0)
  slTrat            Decimal  @db.Decimal(18, 2) @default(0)
  // Doanh thu inputs
  dtKeHoachKy       Decimal  @db.Decimal(18, 2) @default(0)  // E
  dtThoKy           Decimal  @db.Decimal(18, 2) @default(0)  // F
  dtThoLuyKe        Decimal  @db.Decimal(18, 2) @default(0)  // G
  qtTratChua        Decimal  @db.Decimal(18, 2) @default(0)  // I
  dtTratKy          Decimal  @db.Decimal(18, 2) @default(0)  // J
  dtTratLuyKe       Decimal  @db.Decimal(18, 2) @default(0)  // K
  ghiChu            String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  lot               SlDtLot  @relation(fields: [lotId], references: [id], onDelete: Cascade)
  @@unique([lotId, year, month])
  @@map("sl_dt_monthly_inputs")
}

model SlDtProgressStatus {
  id                  Int      @id @default(autoincrement())
  lotId               Int
  year                Int
  month               Int
  milestoneText       String?       // tiến độ hiện tại (cột M Chỉ tiêu)
  settlementStatus    String?       // P col: "Đã quyết toán" hoặc null
  // Tiến độ thi công cho UI Tiến độ XD
  khungBtct           String?       // "Xong khung BTCT", "Mái tầng 2"
  xayTuong            String?
  tratNgoai           String?
  xayTho              String?
  tratHoanThien       String?
  hoSoQuyetToan       String?       // "Đã ký" / "Chưa ký"
  ghiChu              String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  lot                 SlDtLot  @relation(fields: [lotId], references: [id], onDelete: Cascade)
  @@unique([lotId, year, month])
  @@map("sl_dt_progress_statuses")
}
```

## Migration order

### Step 1 — Create new tables
```sql
CREATE TABLE sl_dt_lots (...);
CREATE TABLE sl_dt_milestone_scores (...);
CREATE TABLE sl_dt_payment_plans (...);
CREATE TABLE sl_dt_monthly_inputs (...);
CREATE TABLE sl_dt_progress_statuses (...);
```

### Step 2 — Migrate Project → SlDtLot
```sql
INSERT INTO sl_dt_lots (id, code, "lotName", "phaseCode", "groupCode", "sortOrder", "estimateValue", "createdAt", "updatedAt")
SELECT p.id, p.name, p.name, '?', '?', p.id, COALESCE(p."contractValueVnd", 0), p."createdAt", p."updatedAt"
FROM projects p
WHERE p.id IN (SELECT DISTINCT "projectId" FROM sl_dt_targets);

-- Reset sequence beyond max id
SELECT setval('sl_dt_lots_id_seq', (SELECT MAX(id) FROM sl_dt_lots));
```
Note: `phaseCode` và `groupCode` chưa có data đúng — set placeholder '?', sẽ được populate đúng khi user re-import file Excel ở Phase 5.

### Step 3 — Add FK columns to existing SL-DT tables
```sql
ALTER TABLE sl_dt_targets ADD COLUMN "lotId" INT;
UPDATE sl_dt_targets SET "lotId" = "projectId";
ALTER TABLE sl_dt_targets ALTER COLUMN "lotId" SET NOT NULL;
ALTER TABLE sl_dt_targets ADD CONSTRAINT sl_dt_targets_lotId_fkey
  FOREIGN KEY ("lotId") REFERENCES sl_dt_lots(id) ON DELETE CASCADE;
ALTER TABLE sl_dt_targets DROP CONSTRAINT IF EXISTS "sl_dt_targets_projectId_fkey";
ALTER TABLE sl_dt_targets DROP COLUMN "projectId";
-- recreate unique constraint on (lotId, year, month) if existed
```
Same cho `payment_schedules`. Drop view `vw_sl_dt_actual` nếu còn ref `projectId` từ SL-DT (recreate ở Phase 4 service nếu cần).

### Step 4 — Soft-delete 67 Project rows
```sql
UPDATE projects SET "deletedAt" = NOW()
WHERE id IN (SELECT id FROM sl_dt_lots);
```
Trang Quản lý dự án đã filter `deletedAt IS NULL` → 67 lô biến mất khỏi list.

### Step 5 — Drop legacy SL-DT tables (sl_dt_targets cũ structure)
Chỉ drop sau khi confirm Phase 3 adapter mới hoạt động. Giữ tạm trong commit này, drop ở Phase 5.

## Files
- Create: `prisma/migrations/20260506130000_sl_dt_independent_module/migration.sql`
- Modify: `prisma/schema.prisma` (add 5 models, no changes to existing models trong commit này)

## Success Criteria
- [ ] 5 bảng mới tồn tại, migration apply clean
- [ ] 67 rows trong `sl_dt_lots`
- [ ] 67 rows soft-deleted trong `projects`
- [ ] `sl_dt_targets.lotId` FK hoạt động, không còn `projectId`
- [ ] Trang `/du-an` không hiện 67 lô SL-DT
- [ ] `prisma generate` không lỗi

## Risks
- **R1**: payment_schedules schema cũ có thể đang được dùng ở UI nào đó → grep `payment_schedules` toàn repo trước khi DROP. Hiện tại theo Phase 1 audit, chỉ adapter SL-DT và service `report-service.ts` dùng.
- **R2**: Trang công nợ NCC có thể đang hiển thị một trong 67 lô như "project" → đã verify zero references qua diag script.

## Rollback
- Restore: `UPDATE projects SET "deletedAt" = NULL WHERE id IN (...)`.
- Re-add `projectId` column trên 2 bảng từ `lotId`.
- DROP các bảng mới.
