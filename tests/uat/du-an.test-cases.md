# UAT Test Cases — Dự Án (Project Management)

Module: Dự Án
Role coverage: admin, chihuy_ct, ketoan, viewer
Last updated: 2026-05-04

## Test Cases

| ID | Pre-condition | Steps | Expected Result | Role | Priority |
|----|---------------|-------|-----------------|------|----------|
| UAT-DA-001 | Project "DA-2026-001" exists, no estimate | 1. Open project. 2. Click tab "Dự Toán". 3. Click "Thêm hạng mục". 4. Enter category "Phần thô", unit "m3", qty 500, unit price 2,000,000. 5. Save. | Estimate line added. Total = 1,000,000,000 VNĐ. | admin | P0 |
| UAT-DA-002 | Estimate exists for "DA-2026-001" | 1. Go to Dự Toán tab. 2. Click Edit on a line. 3. Change qty to 600. 4. Save. | Total recalculated to 1,200,000,000. Change reflected instantly. | admin | P0 |
| UAT-DA-003 | Project exists, contractor seeded | 1. Go to tab "Hợp Đồng". 2. Click "Thêm hợp đồng". 3. Select contractor, enter contract value 800,000,000, sign date. 4. Save. | Contract appears in list. Contract value visible. | admin | P0 |
| UAT-DA-004 | Contract exists | 1. Open contract detail. 2. Click Edit. 3. Change value to 900,000,000. 4. Save. | Contract value updated. Audit log records change. | admin | P1 |
| UAT-DA-005 | Project exists | 1. Go to tab "Tiến Độ". 2. Click "Thêm mốc". 3. Enter milestone "Xong móng", planned date 2026-06-30, weight 20%. 4. Save. | Milestone appears in schedule. Progress bar updates. | chihuy_ct | P0 |
| UAT-DA-006 | Milestone "Xong móng" exists | 1. Go to Tiến Độ. 2. Click Edit on milestone. 3. Set actual date 2026-07-05. 4. Save. | Milestone shows actual date. Delay flag shown (5 days late). | chihuy_ct | P1 |
| UAT-DA-007 | Project exists | 1. Go to tab "Phát Sinh". 2. Click "Thêm phát sinh". 3. Enter description "Thay đổi nền móng", amount 50,000,000, reason "Địa chất yếu". 4. Save. | Change order appears in list. Total change orders updated. | admin | P0 |
| UAT-DA-008 | Project with milestones exists | 1. Go to tab "Nghiệm Thu". 2. Click "Thêm nghiệm thu". 3. Select milestone, enter completion %, date, notes. 4. Save. | Acceptance record created. Linked to milestone. | chihuy_ct | P0 |
| UAT-DA-009 | Project with transactions | 1. Go to tab "Giao Dịch". 2. Click "Thêm". 3. Enter transaction: type thu, amount 200,000,000, date, note. 4. Save. | Transaction listed. Cash flow balance updated. | ketoan | P0 |
| UAT-DA-010 | Project with transactions | 1. Go to tab "Dòng Tiền 3 Bên". 2. Verify columns: Chủ đầu tư, Nhà thầu chính, NCC. | Cash flow three-party view shows correct aggregated data per party. | ketoan | P1 |
| UAT-DA-011 | viewer role, project exists | 1. Open project. 2. Navigate all tabs. 3. Attempt to add any record. | All tabs readable. Add/edit buttons hidden or return 403. | viewer | P0 |
| UAT-DA-012 | Project with estimate | 1. Go to "Dự Toán Điều Chỉnh" tab. 2. Add adjusted estimate line. 3. Save. | Adjusted estimate separate from original. Comparison possible. | admin | P2 |
