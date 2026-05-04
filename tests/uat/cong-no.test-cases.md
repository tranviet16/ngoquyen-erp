# UAT Test Cases — Công Nợ (Material & Labor Ledger)

Module: Công Nợ Vật Tư (cong-no-vt) + Công Nợ Nhân Công (cong-no-nc)
Role coverage: admin, ketoan, canbo_vt, viewer
Last updated: 2026-05-04

## Công Nợ Vật Tư

| ID | Pre-condition | Steps | Expected Result | Role | Priority |
|----|---------------|-------|-----------------|------|----------|
| UAT-CN-001 | Supplier exists, project exists | 1. Navigate to Công Nợ VT > Nhập Liệu. 2. Click "Thêm". 3. Enter: supplier, project, date 2026-05-01, type "Nợ phát sinh" (debt), amount 50,000,000. 4. Save. | Ledger entry created. Supplier balance updated. | ketoan | P0 |
| UAT-CN-002 | Debt entry from UAT-CN-001 | 1. Go to Nhập Liệu. 2. Add payment entry: supplier, date 2026-05-15, type "Trả tiền" (payment), amount 30,000,000. 3. Save. | Payment entry created. Balance = 20,000,000 (outstanding). | ketoan | P0 |
| UAT-CN-003 | Entries exist for May 2026 | 1. Navigate to Công Nợ VT > Báo Cáo Tháng. 2. Select month 05/2026. | Monthly report shows: opening balance, new debts, payments, closing balance per supplier. | ketoan | P0 |
| UAT-CN-004 | Data exists | 1. In Báo Cáo Tháng. 2. Click "Xuất Excel". | Excel downloaded with monthly ledger. Totals match on-screen values. | ketoan | P1 |
| UAT-CN-005 | Multiple suppliers with balances | 1. Navigate to Công Nợ VT > Chi Tiết. 2. Select supplier "NCC Vật Tư Bắc Giang". | Ledger shows chronological entries: date, type, amount, running balance. | ketoan | P1 |
| UAT-CN-006 | No opening balance set | 1. Navigate to Công Nợ VT > Số Dư Ban Đầu. 2. Enter opening balance for supplier: 100,000,000. 3. Save. | Opening balance recorded. Báo Cáo Tháng closing balance recalculated. | admin | P0 |

## Công Nợ Nhân Công

| ID | Pre-condition | Steps | Expected Result | Role | Priority |
|----|---------------|-------|-----------------|------|----------|
| UAT-CN-007 | Contractor exists, project exists | 1. Navigate to Công Nợ NC > Nhập Liệu. 2. Add labor debt: contractor, project, date, type "Nợ", amount 80,000,000. 3. Save. | Labor ledger entry created. Contractor balance = 80,000,000. | ketoan | P0 |
| UAT-CN-008 | Labor debt from UAT-CN-007 | 1. Add payment entry: contractor, date, type "Trả", amount 50,000,000. 2. Save. | Balance = 30,000,000 outstanding. Monthly report updated. | ketoan | P0 |
| UAT-CN-009 | Data in both VT and NC | 1. Navigate to Công Nợ NC > Báo Cáo Tháng. 2. Select month. | Separate monthly report for labor contractors, independent of material supplier report. | ketoan | P1 |
| UAT-CN-010 | Opening balance not set for contractor | 1. Navigate to Công Nợ NC > Số Dư Ban Đầu. 2. Enter opening balance for contractor: 200,000,000. 3. Save. | Opening balance saved. Báo cáo tháng reflects it as starting point. | admin | P0 |
| UAT-CN-011 | viewer role | 1. Navigate to Công Nợ VT and NC. 2. Try to add entry. | All views readable. Add/edit/delete not accessible. | viewer | P0 |
| UAT-CN-012 | Multiple months of data | 1. Navigate to Báo Cáo Tháng (VT). 2. Switch between April and May 2026. | Each month shows independent totals. Closing balance of April = Opening balance of May. | ketoan | P0 |
