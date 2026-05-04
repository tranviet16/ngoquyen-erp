# UAT Test Cases — Vật Tư NCC (Supplier Delivery)

Module: Vật Tư NCC
Role coverage: admin, canbo_vt, ketoan, viewer
Last updated: 2026-05-04

## Test Cases

| ID | Pre-condition | Steps | Expected Result | Role | Priority |
|----|---------------|-------|-----------------|------|----------|
| UAT-VT-001 | Supplier "NCC Vật Tư Bắc Giang" exists, item "Xi măng PC40" seeded | 1. Navigate to Vật Tư NCC. 2. Select supplier. 3. Click tab "Ngày". 4. Click "Thêm giao nhận". 5. Enter date 2026-05-01, item Xi măng, qty 200, unit price 90,000, project DA-2026-001. 6. Save. | Delivery record appears in daily view. Amount = 18,000,000. | canbo_vt | P0 |
| UAT-VT-002 | Delivery record from UAT-VT-001 exists | 1. Go to supplier page. 2. Click tab "Tháng". 3. Select month 05/2026. | Monthly grid shows: item Xi măng, total qty 200, total amount 18,000,000. Aggregated correctly. | canbo_vt | P1 |
| UAT-VT-003 | Multiple deliveries in May 2026 | 1. Go to tab "Tháng". 2. Add another delivery: date 2026-05-10, qty 300, same item. 3. Reload monthly view. | Monthly total qty = 500, total amount = 45,000,000. | canbo_vt | P0 |
| UAT-VT-004 | Deliveries exist | 1. Go to tab "Đối Chiếu". 2. Select supplier + date range. | Reconciliation shows: total delivered, total paid, outstanding balance. | ketoan | P0 |
| UAT-VT-005 | Reconciliation data exists | 1. In Đối Chiếu tab, click "Xuất Excel". | Excel file downloaded with supplier delivery data for selected range. | ketoan | P1 |
| UAT-VT-006 | Delivery record exists from UAT-VT-001 | 1. Find delivery in daily view. 2. Click Edit. 3. Change qty to 250. 4. Save. | Delivery qty updated. Monthly totals recalculated. | canbo_vt | P1 |
| UAT-VT-007 | Delivery record exists | 1. Find delivery. 2. Click Delete. 3. Confirm. | Record removed. Monthly totals updated. Audit log records delete. | admin | P1 |
| UAT-VT-008 | Multiple suppliers exist | 1. From Vật Tư NCC main page, search for supplier by name. | Supplier list filters in real-time. | canbo_vt | P2 |
| UAT-VT-009 | Deliveries across multiple months | 1. Navigate to tab "Tháng". 2. Switch between months. | Each month shows correct aggregated data independently. | canbo_vt | P1 |
| UAT-VT-010 | viewer role | 1. Navigate to Vật Tư NCC. 2. Select supplier. 3. View all tabs. 4. Attempt to add delivery. | All views readable. Add/edit disabled or hidden. | viewer | P0 |
| UAT-VT-011 | Delivery exists for DA-2026-001 | 1. Go to Đối Chiếu. 2. Filter by project "DA-2026-001". | Shows only deliveries for that project. Totals match. | ketoan | P1 |
| UAT-VT-012 | canbo_vt logged in | 1. Add delivery without selecting a project. | Validation error: project is required. Record not saved. | canbo_vt | P0 |
