---
title: "Module Thanh toán: kế hoạch theo đợt + tổng hợp tháng"
description: "Module mới /thanh-toan: lập đợt thanh toán (KH/KT) → submit → GĐ duyệt per-item → tổng hợp tháng readonly + export Excel"
status: pending
priority: P2
created: 2026-05-14
effort: "6-8h"
---

# Module Thanh toán

## Goal
Replace 2 SOP Excel files bằng workflow online:
- `Ke_hoach_TT_tien_vat_tu.xlsx` → trang `/thanh-toan/ke-hoach` (đa đợt/tháng/category)
- `Tổng_hợp_thanh_toán_tháng.xlsx` → trang `/thanh-toan/tong-hop` (aggregate readonly)

Workflow: `canbo_vt`/`ketoan` lập → `submitted` → `isDirector` duyệt per-item → `approved` → tổng hợp aggregate `soDuyet`.

## Out of scope
- Tích hợp `SupplierReconciliation`/`ProjectSupplierDebtSnapshot` auto-fill `congNo`/`luyKe` (KH gõ tay — phase sau)
- Workflow đa cấp (chỉ 1 cấp: GĐ; admin override)
- Cron auto-close round
- Mobile-first UI (desktop trước, mobile sau)

## Architecture

**Schema:** 2 bảng `PaymentRound` + `PaymentRoundItem` (Approach A — aggregate on read, không materialize tổng hợp).

```prisma
model PaymentRound {
  id           Int       @id @default(autoincrement())
  month        String    // "YYYY-MM"
  sequence     Int       // đợt 1/2/3/...
  category     String    // "vat_tu" | "nhan_cong" | "dich_vu" | "khac"
  status       String    @default("draft")  // draft|submitted|approved|rejected|closed
  createdById  String
  submittedAt  DateTime?
  approvedById String?
  approvedAt   DateTime?
  note         String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  createdBy  User                @relation("PaymentRoundCreator", fields: [createdById], references: [id])
  approvedBy User?               @relation("PaymentRoundApprover", fields: [approvedById], references: [id])
  items      PaymentRoundItem[]

  @@unique([month, sequence, category])
  @@index([status, month])
  @@map("payment_rounds")
}

model PaymentRoundItem {
  id           Int       @id @default(autoincrement())
  roundId      Int
  supplierId   Int
  projectScope String    // "cty_ql" | "giao_khoan"
  projectId    Int?
  congNo       Decimal   @default(0) @db.Decimal(18, 2)
  luyKe        Decimal   @default(0) @db.Decimal(18, 2)
  soDeNghi     Decimal   @default(0) @db.Decimal(18, 2)
  soDuyet      Decimal?  @db.Decimal(18, 2)
  approvedAt   DateTime?
  approvedById String?
  note         String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  round      PaymentRound @relation(fields: [roundId], references: [id], onDelete: Cascade)
  supplier   Supplier     @relation(fields: [supplierId], references: [id])
  project    Project?     @relation(fields: [projectId], references: [id])
  approvedBy User?        @relation("PaymentItemApprover", fields: [approvedById], references: [id])

  @@index([roundId])
  @@index([supplierId])
  @@map("payment_round_items")
}
```

**Workflow state machine:**
```
draft ──submit──> submitted ──approve──> approved ──close──> closed
                      │
                      └──reject──> rejected ──reopen──> draft
```
- `draft`: KH chỉnh sửa items thoải mái
- `submitted`: chỉ GĐ thấy nút duyệt per-item; KH readonly
- `approved`: khi ALL items có `approvedAt` (auto) hoặc GĐ bấm "Chốt đợt"
- `closed`: lock — chỉ admin reopen

**Per-item approval UX:**
- Mỗi row có 3 hành động: `Duyệt = đề xuất` (1-click, set soDuyet=soDeNghi), `Duyệt` (input rồi confirm), `Từ chối` (soDuyet=0)
- Bulk button trên header: "Duyệt tất cả = đề xuất"
- Indicator: badge per-row `Chờ duyệt` | `Đã duyệt: X` | `Từ chối`

**RBAC:**
- View list: tất cả role
- Lập/sửa draft: `canbo_vt`, `ketoan`, `admin`
- Submit: chỉ creator hoặc admin
- Duyệt per-item: `isDirector` hoặc `admin`
- Close/Reopen: `admin`

**Audit:** Prisma `$extends` middleware (lib/prisma.ts) tự log `payment_rounds`/`payment_round_items` update. KHÔNG bypass.

**Aggregation cho `/tong-hop`:**
```sql
SELECT supplier_id, project_scope, SUM(so_de_nghi), SUM(so_duyet)
FROM payment_round_items i
JOIN payment_rounds r ON r.id = i.round_id
WHERE r.month = $1
  AND r.status IN ('approved', 'closed')
  AND r.deleted_at IS NULL
GROUP BY supplier_id, project_scope
```
Render thành bảng pivot khớp cấu trúc `Tổng_hợp_thanh_toán_tháng.xlsx`.

## Constraints
- KHÔNG dùng `bypassAudit` cho single update (middleware đã handle)
- Reuse `Supplier` model, KHÔNG tạo party mới
- `xlsx` package đã có sẵn → dùng cho export
- Naming: kebab-case files, `payment-` prefix cho lib/

## Risks
- **Race khi GĐ duyệt + KH sửa**: chặn bằng `status === 'submitted'` guard ở action (throw nếu draft) | KH không sửa được khi submitted (UI disabled)
- **Tự động chuyển `approved`**: dễ trigger nhầm nếu có item null. Logic: chuyển approved chỉ khi `items.every(i => i.approvedAt !== null)` và `items.length > 0`
- **Migration trên prod**: bảng mới empty, không có rủi ro backfill

## Phases
| ID | Title | Effort | Status |
|----|-------|--------|--------|
| 1  | Schema + migration | 1h | pending |
| 2  | Service + RBAC + workflow | 2h | pending |
| 3  | Trang kế hoạch (lập + duyệt per-item) | 2.5h | pending |
| 4  | Trang tổng hợp + export Excel | 1.5h | pending |
| 5  | Nav + smoke test | 0.5h | pending |

## Success Criteria
- [ ] Migration `npx prisma migrate dev` chạy clean
- [ ] KH tạo round draft → thêm 3 items → submit → status=submitted
- [ ] GĐ login → vào round submitted → click "Duyệt = đề xuất" trên 3 items → round tự động → approved
- [ ] `/tong-hop?month=2026-05` hiển thị aggregate đúng SUM
- [ ] Export Excel khớp template SOP
- [ ] Non-director gọi approve action → throw forbidden
- [ ] Audit log row được ghi cho mỗi update
- [ ] Type-check pass
