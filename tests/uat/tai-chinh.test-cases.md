# UAT Test Cases — Tài Chính (Finance)

Module: Tài Chính (Loans, Journal, Expense Categories, Dashboard, Cashflow, Payables/Receivables)
Role coverage: admin, ketoan, viewer
Last updated: 2026-05-04

## Test Cases

| ID | Pre-condition | Steps | Expected Result | Role | Priority |
|----|---------------|-------|-----------------|------|----------|
| UAT-TC-001 | ketoan logged in | 1. Navigate to Tài Chính > Vay. 2. Click "Thêm khoản vay". 3. Enter: lender "Ngân hàng BIDV", principal 2,000,000,000, interest rate 8.5%, start date 2026-01-01, duration 24 months. 4. Save. | Loan record created. Monthly interest schedule auto-generated. | ketoan | P0 |
| UAT-TC-002 | Loan from UAT-TC-001 exists | 1. Click on loan to open detail. 2. Verify repayment schedule shows 24 rows. 3. Click "Ghi nhận trả nợ" for month 1. 4. Enter payment date + amount. 5. Save. | Payment recorded. Outstanding balance decreases. | ketoan | P0 |
| UAT-TC-003 | ketoan logged in | 1. Navigate to Tài Chính > Nhật Ký. 2. Click "Thêm bút toán". 3. Enter: date 2026-05-01, description "Thu tiền dự án ABC", credit account "Tiền mặt", debit account "Doanh thu", amount 100,000,000. 4. Save. | Journal entry created. Appears in journal list. Debit = Credit. | ketoan | P0 |
| UAT-TC-004 | Journal entry exists | 1. Open entry. 2. Click Edit. 3. Change amount to 120,000,000. 4. Save. | Entry updated. Audit log records change. | ketoan | P1 |
| UAT-TC-005 | admin logged in | 1. Navigate to Tài Chính > Phân Loại Chi Phí. 2. Click "Thêm". 3. Enter category name "Chi phí vật liệu", code "CP-VL". 4. Save. | Category appears in list. Available for selection in journal. | admin | P0 |
| UAT-TC-006 | ketoan logged in, data exists | 1. Navigate to Tài Chính (Dashboard). 2. View summary cards. | Dashboard shows: total revenue, total expense, net cash flow, outstanding loans. Data matches underlying records. | ketoan | P1 |
| UAT-TC-007 | Journal entries exist for 3+ months | 1. Navigate to Tài Chính > Báo Cáo Thanh Khoản. 2. Select date range. | Cashflow forecast shows projected inflows/outflows per period. | ketoan | P1 |
| UAT-TC-008 | ketoan logged in | 1. Navigate to Tài Chính > Phải Thu/Trả. 2. View receivables tab. | Receivables list shows: counterparty, due date, amount, overdue flag. | ketoan | P0 |
| UAT-TC-009 | Payable entry exists | 1. In Phải Thu/Trả > Phải Trả. 2. Click "Ghi nhận thanh toán". 3. Enter amount + date. 4. Save. | Payable balance reduced. Status updated. | ketoan | P0 |
| UAT-TC-010 | viewer role | 1. Navigate to all Tài Chính sections. 2. Try to add journal entry. | All views readable. No write capability. | viewer | P0 |
| UAT-TC-011 | Data exists | 1. Navigate to Tài Chính > Báo Cáo Thanh Khoản. 2. Click "Xuất Excel". | Excel downloaded with cashflow report. Matches screen totals. | ketoan | P1 |
| UAT-TC-012 | Loan overdue (past payment date, unpaid) | 1. View loan detail. 2. Check overdue installments. | Overdue installments highlighted. Total overdue amount shown. | ketoan | P1 |
