# UAT Test Cases — Master Data

Module: Master Data (Danh mục)
Role coverage: admin, ketoan, viewer
Last updated: 2026-05-04

## Test Cases

| ID | Pre-condition | Steps | Expected Result | Role | Priority |
|----|---------------|-------|-----------------|------|----------|
| UAT-MD-001 | Admin logged in, no entity with tax code "0101234567" | 1. Navigate to Master Data > Entities. 2. Click "Thêm". 3. Enter name "Công ty TNHH ABC", tax code "0101234567", address "Hà Nội". 4. Click "Lưu". | New entity appears in list with correct data. No duplicate tax code error. | admin | P0 |
| UAT-MD-002 | Entity "Công ty TNHH ABC" exists | 1. Find entity in list. 2. Click Edit icon. 3. Change address to "TP.HCM". 4. Click "Lưu". | Entity updated in list. Old address no longer shown. Audit log records update. | admin | P0 |
| UAT-MD-003 | Entity "Công ty TNHH ABC" exists | 1. Find entity. 2. Click Delete icon. 3. Confirm dialog. | Entity soft-deleted (removed from list). Cannot be re-added with same tax code. | admin | P1 |
| UAT-MD-004 | Admin logged in | 1. Navigate to Master Data > Suppliers. 2. Click "Thêm". 3. Enter name "NCC Vật Tư Bắc Giang", phone "0912345678". 4. Click "Lưu". | Supplier appears in list with correct data. | admin | P0 |
| UAT-MD-005 | Supplier "NCC Vật Tư Bắc Giang" exists | 1. Find supplier. 2. Click Edit. 3. Change phone to "0987654321". 4. Save. | Supplier phone updated. | admin | P1 |
| UAT-MD-006 | Admin logged in | 1. Navigate to Master Data > Contractors. 2. Click "Thêm". 3. Enter name "Nhà thầu XD Hoàng Sơn", tax code "0209876543". 4. Click "Lưu". | Contractor appears in list. | admin | P0 |
| UAT-MD-007 | Admin logged in | 1. Navigate to Master Data > Items. 2. Click "Thêm". 3. Enter name "Xi măng Hoàng Thạch PC40", unit "bao". 4. Click "Lưu". | Item appears in list with unit "bao". | admin | P0 |
| UAT-MD-008 | Item "Xi măng Hoàng Thạch PC40" exists | 1. Find item. 2. Click Edit. 3. Change unit to "tấn". 4. Save. | Item unit updated to "tấn". | admin | P1 |
| UAT-MD-009 | Admin logged in, entity + project type data seeded | 1. Navigate to Master Data > Projects. 2. Click "Thêm". 3. Enter project name "Nhà ở XH Phú Lương", code "DA-2026-001", owner entity. 4. Click "Lưu". | Project appears in project list with status "active". | admin | P0 |
| UAT-MD-010 | Project "DA-2026-001" exists | 1. Click on project. 2. Verify detail page loads with tabs: Tổng quan, Hợp đồng, Dự toán, Tiến độ. | All tabs accessible. Project info correct. | admin | P1 |
| UAT-MD-011 | viewer role logged in | 1. Navigate to Master Data > Entities. 2. Attempt to click "Thêm". | Button hidden or action forbidden (403 / no button visible). | viewer | P0 |
| UAT-MD-012 | Admin logged in, duplicate tax code "0101234567" in system | 1. Try to add new entity with tax code "0101234567". 2. Click "Lưu". | Validation error: "Mã số thuế đã tồn tại". Record not created. | admin | P1 |
