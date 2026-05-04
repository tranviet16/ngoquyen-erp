---
phase: 8
title: "Module: Quản lý Tài chính NQ + Dashboard tổng hợp"
status: pending
priority: P2
effort: "1.5w"
dependencies: [5, 6]
---

# Phase 8: Module Quản lý Tài chính NQ

## Overview
Module tài chính tổng cấp doanh nghiệp: hợp đồng vay, lịch thanh toán vay, sổ nhật ký giao dịch, phân loại chi phí, phải thu/phải trả tổng, dashboard tổng hợp consolidate từ tất cả module.

## Requirements
**Functional:**
- Hợp đồng vay (loan contracts): bên cho vay, lãi suất, thời hạn, gốc, lịch trả
- Thanh toán vay: ghi nhận trả gốc + lãi từng kỳ
- Sổ nhật ký giao dịch (journal entries): mọi dòng tiền của cty (thu/chi/chuyển)
- Phân loại chi phí: hierarchical (vd "Vật tư > Thép", "Nhân công > Đội A")
- Phải thu / Phải trả: consolidated view từ Ledger (Phase 5,6) + journal manual entries
- Dashboard: cash position, top NCC nợ, top dự án doanh thu, alert hợp đồng/đợt vay sắp hạn

**Non-functional:**
- Dashboard load <3s với 1 năm data

## Architecture
**Schema:**
```prisma
model LoanContract {
  id, lenderName, principalVnd Decimal, interestRatePct Decimal,
  startDate, endDate, paymentSchedule String,  // "monthly|quarterly|bullet"
  status String, contractDoc String?, note String?
}

model LoanPayment {
  id, loanContractId, dueDate, principalDue Decimal, interestDue Decimal,
  paidDate DateTime?, principalPaid Decimal?, interestPaid Decimal?,
  status String, note String?
}

model JournalEntry {                  // Sổ nhật ký giao dịch
  id, date, entryType String,         // "thu|chi|chuyen_khoan"
  amountVnd Decimal, fromAccount String?, toAccount String?,
  expenseCategoryId Int?, refModule String?, refId Int?,  // link tới module gốc
  description String, attachmentUrl String?, note String?
}

model ExpenseCategory {
  id, code, name, parentId Int?, level Int,
  @@index([parentId])
}

model PayableReceivableAdjustment {  // Manual phải thu/trả ngoài ledger
  id, date, partyType String, partyName String, projectId Int?,
  type String,                       // "payable|receivable"
  amountVnd Decimal, dueDate DateTime?, status String, note String?
}
```

**Dashboard data sources:**
- Cash position: SUM(JournalEntry) by month
- Material debt: LedgerService('material').summary()
- Labor debt: LedgerService('labor').summary()
- Project P&L: ProjectAcceptance + ProjectTransaction
- Loans due: LoanPayment WHERE due_date < now()+30d AND status='pending'
- Contract expiring: ProjectContract WHERE expiry_date < now()+90d

**UI:**
```
/tai-chinh
├── page.tsx                       ← dashboard tổng hợp
├── vay/page.tsx                   ← list hợp đồng vay
├── vay/[id]/page.tsx              ← detail + lịch trả
├── nhat-ky/page.tsx               ← AG Grid journal entries
├── phan-loai-chi-phi/page.tsx
├── phai-thu-tra/page.tsx          ← consolidated view
└── bao-cao-thanh-khoan/page.tsx   ← cash flow forecast
```

## Related Code Files
**Create:**
- `prisma/schema.prisma` (5 models)
- `lib/tai-chinh/{loan,journal,expense-category,pr-adjustment,dashboard}-service.ts`
- `app/(app)/tai-chinh/{page,vay,vay/[id],nhat-ky,phan-loai-chi-phi,phai-thu-tra,bao-cao-thanh-khoan}/page.tsx`
- `components/tai-chinh/dashboard-card.tsx`
- `components/tai-chinh/cashflow-chart.tsx` (recharts)
- `components/tai-chinh/loan-payment-schedule.tsx`

## Implementation Steps
1. Migration 5 models
2. Service CRUD cho từng entity
3. Loan generator: tạo hợp đồng → auto generate `LoanPayment` records theo schedule
4. Journal entry: AG Grid editable, autocomplete expense category
5. Phân loại chi phí: tree view + drag-drop sort (shadcn tree component)
6. Phải thu/trả: query consolidate từ 3 nguồn (material ledger + labor ledger + manual adjustments)
7. Dashboard: 6 card + 2 chart, mỗi card data từ 1 query đã optimize
8. Báo cáo thanh khoản: forecast cashflow 3 tháng tới (loan payments + scheduled receipts/payments)
9. Verify với "Hệ thống quản lý tài chính NQ.xlsx" mẫu

## Success Criteria
- [ ] CRUD 5 entity đầy đủ
- [ ] Loan generator tạo đúng số kỳ + số tiền gốc/lãi
- [ ] Journal entry link được tới module gốc (refModule + refId)
- [ ] Dashboard hiển thị đầy đủ 6 KPI + chart
- [ ] Phải thu/trả khớp tổng từ Ledger + manual adjustments
- [ ] Performance dashboard <3s

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Dashboard query phức tạp, chậm | Cache 5 phút trong-memory; chia query nhỏ chạy parallel với Promise.all |
| Phân loại chi phí thay đổi structure → broken FK | Soft delete category, không cho xóa nếu còn ref |
| Journal entry trùng với Ledger transaction → double counting | Quy ước rõ: Journal chỉ ghi cash flow tổng cấp công ty; Ledger ghi nghiệp vụ NCC. Báo cáo P&L phải pick 1 nguồn — document rõ |
| Lãi suất floating khó model | Phase 1: chỉ fixed rate; flag floating rate là "manual entry mỗi kỳ" |
