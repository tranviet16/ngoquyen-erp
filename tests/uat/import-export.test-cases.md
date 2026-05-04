# UAT Test Cases — Import / Export

Module: Admin > Import + API Export
Role coverage: admin, ketoan
Last updated: 2026-05-04

## Adapter Files (place in tests/uat/fixtures/ for testing)
- `gach-nam-huong-sample.xlsx` — Gạch Nam Hương adapter
- `quang-minh-sample.xlsx` — Quang Minh (cát, gạch) adapter
- `cong-no-vat-tu-sample.xlsx` — Công nợ vật tư adapter
- `du-an-xay-dung-sample.xlsx` — Dự án xây dựng adapter
- `tai-chinh-nq-sample.xlsx` — Tài chính NQ adapter
- `sl-dt-sample.xlsx` — SL/DT adapter

## Import Test Cases

| ID | Pre-condition | Steps | Expected Result | Role | Priority |
|----|---------------|-------|-----------------|------|----------|
| UAT-IE-001 | Admin logged in, sample file `gach-nam-huong-sample.xlsx` ready | 1. Navigate to Admin > Import. 2. Select adapter "Gạch Nam Hương". 3. Upload sample file. 4. Click "Preview". | Preview table shows parsed rows with correct column mapping. No error rows. Row count matches file. | admin | P0 |
| UAT-IE-002 | Preview from UAT-IE-001 shown | 1. Click "Commit". 2. Confirm dialog. | Import run created with status "completed". Records persisted to DB. ImportRun record shows committed. | admin | P0 |
| UAT-IE-003 | ImportRun from UAT-IE-002 committed | 1. Upload same `gach-nam-huong-sample.xlsx` again. 2. Preview. 3. Commit. | System detects duplicate (file hash match or row deduplication). No duplicate records created. ImportRun shows "duplicate/skipped". | admin | P0 |
| UAT-IE-004 | Admin logged in | 1. Upload `quang-minh-sample.xlsx` with adapter "Quang Minh". 2. Preview. | Preview shows supplier delivery rows. Supplier names matched to existing master data (or flagged if unknown). | admin | P0 |
| UAT-IE-005 | Admin logged in | 1. Upload `cong-no-vat-tu-sample.xlsx`. 2. Select adapter "Công Nợ Vật Tư". 3. Preview. | Ledger entries shown with supplier, project, amount. Unknown suppliers flagged in preview. | admin | P0 |
| UAT-IE-006 | Admin logged in | 1. Upload `du-an-xay-dung-sample.xlsx`. 2. Select adapter "Dự Án Xây Dựng". 3. Preview then Commit. | Project transactions imported. Totals match source file sums. | admin | P0 |
| UAT-IE-007 | Admin logged in | 1. Upload `tai-chinh-nq-sample.xlsx`. 2. Select adapter "Tài Chính NQ". 3. Preview then Commit. | Finance journal entries imported. Debit/credit balanced. | admin | P0 |
| UAT-IE-008 | Admin logged in | 1. Upload `sl-dt-sample.xlsx`. 2. Select adapter "SL/DT". 3. Preview then Commit. | Revenue targets imported. Monthly breakdown matches source. | admin | P0 |

## Export Test Cases

| ID | Pre-condition | Steps | Expected Result | Role | Priority |
|----|---------------|-------|-----------------|------|----------|
| UAT-IE-009 | Material ledger data for May 2026 exists | 1. Navigate to Công Nợ VT > Báo Cáo Tháng. 2. Select 05/2026. 3. Click "Xuất Excel". | Excel downloaded: template "cong-no-monthly". Correct headers, totals, formatting. | ketoan | P0 |
| UAT-IE-010 | Reconciliation data exists | 1. Navigate to Vật Tư NCC > Đối Chiếu. 2. Click "Xuất Excel". | Excel: template "doi-chieu". Supplier, deliveries, payments, balance columns. | ketoan | P1 |
| UAT-IE-011 | Project estimate exists | 1. Navigate to Dự Án > Dự Toán. 2. Click "Xuất Excel". | Excel: template "du-toan". Estimate lines, quantities, unit prices, totals. | admin | P1 |
| UAT-IE-012 | SL/DT data exists | 1. Navigate to SL/DT > Báo Cáo DT. 2. Click "Xuất Excel". | Excel: template "sl-dt". Monthly revenue target vs actual per project. | ketoan | P1 |
