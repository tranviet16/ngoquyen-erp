---
phase: 5
title: "Module: Công nợ Vật tư + LedgerService core"
status: pending
priority: P1
effort: "1.5w"
dependencies: [2]
---

# Phase 5: Module Công nợ Vật tư

## Overview
Build `LedgerService` engine (TT/HĐ duality) làm core dùng chung cho Công nợ Vật tư (Phase 5) và Công nợ Nhân công (Phase 6). UI: Nhập liệu, Số Dư Ban Đầu, Tổng Hợp Công Nợ, Báo Cáo Tháng, Công Nợ chi tiết theo Chủ thể.

## Requirements
**Functional:**
- Nhập giao dịch: Lấy Hàng / Thanh Toán / Điều Chỉnh, mỗi giao dịch có cặp TT + HĐ + VAT
- Số Dư Ban Đầu per (entity, supplier, project) tại ngày bắt đầu hệ thống
- Tổng Hợp Công Nợ pivot theo Chủ thể × NCC × Dự án
- Báo Cáo Tháng theo (month, entity)
- Công Nợ chi tiết: pivot Chủ thể trên cột, NCC trên row, có TT/HĐ song song

**Non-functional:**
- Pivot tính server-side qua SQL aggregation, không xử lý trong JS
- Số dư hiện tại = OpeningBalance + SUM(transactions) cộng dồn tới ngày query

## Architecture
**Schema (LedgerService chung):**
```prisma
model LedgerTransaction {
  id              Int @id @default(autoincrement())
  ledgerType      String           // "material" | "labor"
  date            DateTime
  transactionType String           // "lay_hang" | "thanh_toan" | "dieu_chinh"
  entityId        Int              // Chủ Thể
  partyId         Int              // supplier_id NẾU material, contractor_id NẾU labor
  projectId       Int?
  itemId          Int?             // null nếu thanh toán tổng

  // Thực tế
  amountTt        Decimal @db.Decimal(18,2) @default(0)
  vatPctTt        Decimal @db.Decimal(5,4)  @default(0)
  vatTt           Decimal @db.Decimal(18,2) @default(0)
  totalTt         Decimal @db.Decimal(18,2) @default(0)

  // Hóa đơn
  amountHd        Decimal @db.Decimal(18,2) @default(0)
  vatPctHd        Decimal @db.Decimal(5,4)  @default(0)
  vatHd           Decimal @db.Decimal(18,2) @default(0)
  totalHd         Decimal @db.Decimal(18,2) @default(0)

  invoiceNo       String?
  invoiceDate     DateTime?
  content         String?
  status          String  @default("pending")
  note            String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([ledgerType, entityId, partyId, projectId, date])
}

model LedgerOpeningBalance {
  id          Int @id @default(autoincrement())
  ledgerType  String
  entityId    Int
  partyId     Int
  projectId   Int?
  balanceTt   Decimal @db.Decimal(18,2)
  balanceHd   Decimal @db.Decimal(18,2)
  asOfDate    DateTime
  note        String?
  @@unique([ledgerType, entityId, partyId, projectId])
}
```

**LedgerService API** (`lib/ledger/ledger-service.ts`):
```ts
class LedgerService {
  constructor(private ledgerType: 'material' | 'labor') {}
  list(filter): Promise<LedgerTransaction[]>
  create(input): Promise<LedgerTransaction>      // auto compute totals
  update(id, input): Promise<LedgerTransaction>
  delete(id): Promise<void>
  summary(groupBy: ['entity'|'party'|'project'], filter): SummaryRow[]
  monthlyReport(year, month, entityId?): MonthlyReportRow[]
  currentBalance(entityId, partyId, projectId?, asOf?): { tt, hd }
  detailedDebtMatrix(filter): MatrixRow[]        // pivot Chủ Thể trên cột
}
```

**SQL summary example:**
```sql
SELECT entity_id, party_id, project_id,
  SUM(CASE WHEN transaction_type='lay_hang' THEN total_tt END) AS lh_tt,
  SUM(CASE WHEN transaction_type='thanh_toan' THEN total_tt END) AS tra_tt,
  -- + opening balance
FROM ledger_transactions WHERE ledger_type='material'
GROUP BY entity_id, party_id, project_id;
```

**UI:**
```
/cong-no-vt
├── page.tsx                       ← Tổng Hợp Công Nợ
├── nhap-lieu/page.tsx             ← AG Grid editable
├── so-du-ban-dau/page.tsx
├── bao-cao-thang/page.tsx
└── chi-tiet/page.tsx              ← matrix Chủ Thể × NCC
```

## Related Code Files
**Create:**
- `prisma/schema.prisma` (add 2 models)
- `lib/ledger/ledger-service.ts` (engine, ~200 dòng)
- `lib/ledger/ledger-types.ts`
- `lib/ledger/ledger-aggregations.ts` (raw SQL helpers)
- `lib/cong-no-vt/material-ledger-service.ts` (thin wrapper, fix `ledgerType='material'`)
- `app/(app)/cong-no-vt/{page,nhap-lieu,so-du-ban-dau,bao-cao-thang,chi-tiet}/page.tsx`
- `components/cong-no-vt/transaction-grid.tsx`
- `components/cong-no-vt/debt-matrix.tsx`
- `components/cong-no-vt/monthly-report.tsx`

## Implementation Steps
1. Migration 2 model
2. Implement `LedgerService` với full unit test (compute totals, summary SQL, current balance)
3. Material wrapper service
4. Page Nhập Liệu: AG Grid với cột TT/HĐ side-by-side, autocomplete NCC/Item từ master
5. Page Số Dư Ban Đầu: form + table, validation per `(entity, party, project)` unique
6. Page Tổng Hợp Công Nợ: aggregation query → table với footer total
7. Page Báo Cáo Tháng: chọn month/year/entity → render
8. Page Chi Tiết: pivot matrix, mỗi cell có TT trên / HĐ dưới
9. Verify với data Excel mẫu (Quản Lý Công Nợ Vật Tư.xlsx) — số khớp 100%

## Success Criteria
- [ ] Compute totals tự động đúng (amount + vat = total)
- [ ] Số dư hiện tại = opening + SUM giao dịch tới ngày query
- [ ] Tổng Hợp Công Nợ khớp 100% với sheet "Tổng Hợp Công Nợ" Excel mẫu
- [ ] Pivot Chủ Thể × NCC khớp sheet "Công Nợ"
- [ ] LedgerService có ≥80% unit test coverage
- [ ] Performance: query summary với 50k transaction <500ms

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Edge case: thanh toán cover nhiều giao dịch (1 UNC trả cho nhiều invoice) | Phase 1: ghi như 1 row "Thanh Toán" tổng; không link 1-1 với invoices. Phase 2 mới làm matching. |
| Chênh lệch TT vs HĐ là âm (paid before invoice) | Cho phép, hiển thị âm đỏ trong báo cáo |
| Số decimal lệch do rounding | Dùng `Decimal(18,2)` toàn bộ, không dùng float; test rounding edge cases |
| Pivot Chủ Thể × NCC scale chậm | Dùng materialized view, refresh nightly |
