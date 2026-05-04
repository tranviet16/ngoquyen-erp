# UAT Test Cases — SL/DT (Sản Lượng / Doanh Thu)

Module: SL-DT (Revenue & Volume Targets)
Role coverage: admin, ketoan, chihuy_ct, viewer
Last updated: 2026-05-04

## Test Cases

| ID | Pre-condition | Steps | Expected Result | Role | Priority |
|----|---------------|-------|-----------------|------|----------|
| UAT-SL-001 | Admin logged in, project DA-2026-001 exists | 1. Navigate to SL/DT. 2. Click "Chỉ Tiêu". 3. Click "Thêm chỉ tiêu". 4. Enter: project DA-2026-001, year 2026, month 5, target revenue 500,000,000. 5. Save. | Target appears in chỉ tiêu list for 05/2026. | admin | P0 |
| UAT-SL-002 | Target from UAT-SL-001 exists | 1. Go to Chỉ Tiêu. 2. Click Edit on target. 3. Change to 600,000,000. 4. Save. | Target updated. Report reflects new value. | admin | P1 |
| UAT-SL-003 | Target from UAT-SL-001 exists | 1. Go to Chỉ Tiêu. 2. Click Delete on target. 3. Confirm. | Target removed. No orphan data. | admin | P1 |
| UAT-SL-004 | Target exists | 1. Navigate to SL/DT > Tiến Độ Nộp Tiền. 2. Click "Thêm kỳ nộp". 3. Enter: project, due date 2026-06-15, amount 200,000,000. 4. Save. | Payment schedule entry created with status "Chưa nộp". | admin | P0 |
| UAT-SL-005 | Payment schedule entry exists | 1. Open entry. 2. Click Edit. 3. Enter actual payment date 2026-06-10, actual amount 200,000,000. 4. Save. | Status changes to "Đã nộp". On-time flag shown (5 days early). | ketoan | P0 |
| UAT-SL-006 | Payment schedule with missed deadline | 1. View payment entry with due date in past, no actual date. | Status shows "Quá hạn". Highlighted in red. | ketoan | P1 |
| UAT-SL-007 | Multiple months of targets + actuals | 1. Navigate to SL/DT > Báo Cáo DT. 2. Select year 2026. | Report shows monthly breakdown: target vs actual revenue per project. | ketoan | P0 |
| UAT-SL-008 | Revenue report data exists | 1. In Báo Cáo DT, click "Xuất Excel". | Excel file downloaded with annual revenue report. Totals match screen. | ketoan | P1 |
| UAT-SL-009 | Targets and actuals exist | 1. Navigate to SL/DT > Báo Cáo SL. 2. View volume report. | Volume report shows production targets vs actuals per period. | chihuy_ct | P1 |
| UAT-SL-010 | Projects exist | 1. Navigate to SL/DT > Tiến Độ XD. 2. View construction progress timeline. | Timeline shows milestones, planned vs actual progress per project. | chihuy_ct | P0 |
| UAT-SL-011 | viewer role | 1. Navigate all SL/DT sections. 2. Try to add target. | Read-only views accessible. No add/edit capability. | viewer | P0 |
| UAT-SL-012 | Target without actual entered | 1. View Báo Cáo DT for current month. | Actual column shows 0 or blank (not error). Achievement % calculated as 0%. | ketoan | P2 |
