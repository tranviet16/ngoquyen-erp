---
title: ERP Ngọ Quyến – Phase 1 Brainstorm Summary
date: 2026-05-04
status: pending-approval
---

# ERP Ngọ Quyến – Phase 1 Design Summary

## 1. Problem Statement

Doanh nghiệp xây dựng đang vận hành toàn bộ trên 6 file Excel (folder `SOP/`), gặp các vấn đề:
- Không đa người dùng đồng thời, dễ ghi đè.
- Không có lịch sử thay đổi, không phân quyền.
- Master data trùng lặp giữa các file (NCC, dự án, vật tư...) → số liệu lệch.
- Báo cáo tổng hợp phải copy-paste thủ công giữa file.

**Mục tiêu Phase 1:** Số hóa nguyên trạng Excel sang web app nội bộ, **giữ nguyên logic & layout báo cáo**, thêm: multi-user, audit log, RBAC, master data tập trung.

---

## 2. Scope – 6 Module lớn

| # | Module | Nguồn Excel | Ghi chú |
|---|--------|-------------|---------|
| 1 | **Vật tư theo Nhà cung cấp** | `Gạch Nam Hương.xlsx`, `Quang Minh cát,gạch.xlsx` | Mỗi NCC lớn = 1 trang riêng (Vật tư ngày / Vật tư tháng / Đối chiếu công nợ). Có thể nhân bản cho NCC mới. |
| 2 | **Quản lý Tài chính** | `Hệ thống quản lý tài chính NQ.xlsx` | Vay, dòng tiền, phải thu/trả, phân loại chi phí, dashboard. |
| 3 | **Công nợ Vật tư** | `Quản Lý Công Nợ Vật Tư.xlsx` | Giao dịch TT/HĐ, số dư đầu kỳ, tổng hợp công nợ theo Chủ thể × NCC × Dự án. |
| 4 | **Công nợ Nhân công** *(NEW)* | (clone schema #3) | Cùng cấu trúc như #3, đối tượng = đội thi công / nhân công thay vì NCC vật tư. |
| 5 | **Quản lý Dự án Xây dựng** | `Quản Lý Dự Án Xây Dựng.xlsx` | 12 sheet con: tiến độ, nghiệm thu, dự toán, dự toán điều chỉnh (CO), định mức, giao dịch, phát sinh, hợp đồng, dòng tiền 3 bên. |
| 6 | **Sản lượng – Doanh thu** | `SL - DT 2025.xlsx` | Chỉ tiêu SL/DT theo tháng, báo cáo SL/DT thực hiện, tiến độ nộp tiền, tiến độ XD. |

---

## 3. Quyết định kiến trúc đã chốt

| Hạng mục | Lựa chọn |
|----------|----------|
| Mục tiêu | Số hóa nguyên trạng Excel |
| Triển khai | Web nội bộ, < 20 user, VPS / LAN |
| Stack | Next.js (App Router) + TypeScript + PostgreSQL + Prisma |
| UI nhập liệu | **Grid Excel-like** (AG Grid Community / Handsontable) cho sheet giao dịch + Form chuẩn cho master data |
| TT vs HĐ | **2 cột số tiền trong cùng 1 dòng** (`amount_tt`, `vat_tt`, `amount_hd`, `vat_hd`) |
| Build order | Master Data → Dự án → các module còn lại |
| Phase 1 features | RBAC + Audit log + Import Excel one-shot + Export Excel/PDF |

---

## 4. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js App Router                      │
│  ┌──────────────┬──────────────┬──────────────┬───────────┐ │
│  │ /master-data │ /du-an       │ /cong-no-vt  │ /tai-chinh│ │
│  │ /vat-tu-ncc  │ /cong-no-nc  │ /sl-dt       │ /reports  │ │
│  └──────┬───────┴──────┬───────┴──────┬───────┴─────┬─────┘ │
│         └──────────────┴──────────────┴─────────────┘       │
│                          │                                   │
│                  Server Actions / Route Handlers             │
│                          │                                   │
│  ┌───────────────────────▼────────────────────────────────┐  │
│  │   Domain Services (per module) + Shared Services:      │  │
│  │   - LedgerService (TT/HĐ posting engine, dùng cho #3,4)│  │
│  │   - ImportService (Excel → DB)                         │  │
│  │   - ExportService (DB → Excel/PDF theo mẫu)            │  │
│  │   - AuditService                                       │  │
│  └───────────────────────┬────────────────────────────────┘  │
│                          │                                   │
│                       Prisma ORM                             │
└──────────────────────────┼───────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ PostgreSQL  │
                    └─────────────┘
```

**Nguyên tắc:** Module 3 & 4 (Công nợ VT / Công nợ NC) dùng chung `LedgerService` engine ở backend, nhưng UI và route tách riêng để user thấy giống Excel. DRY ở core, KISS ở UI.

---

## 5. Master Data (Sprint 0 – build trước)

| Bảng | Mô tả | Field chính |
|------|-------|-------------|
| `entities` (Chủ thể) | Công ty / cá nhân quản lý ngân quỹ | name, type (company/person) |
| `suppliers` (NCC vật tư) | Nhà cung cấp vật tư | name, tax_code, phone, address |
| `contractors` (Đội thi công) | Nhà thầu phụ / đội nhân công | name, contact, leader |
| `projects` (Dự án) | Công trình | code, name, owner_investor, contract_value, start_date, end_date |
| `project_categories` (Hạng mục) | Hạng mục thuộc dự án | project_id, code, name (vd "1. Chuẩn Bị Mặt Bằng") |
| `items` (Vật tư / dịch vụ) | Catalog vật tư + nhân công + máy móc | code, name, unit, type (material/labor/machine) |
| `users` + `roles` | Auth + RBAC | email, password_hash, role (admin/ketoan/canbo_vt/chihuy/viewer) |
| `audit_logs` | Lịch sử thay đổi | user_id, table, record_id, action, before, after, timestamp |

---

## 6. Schema chính theo module (rút gọn)

### 6.1 Module 3 & 4 – Công nợ Vật tư / Nhân công (cùng engine)
```
ledger_transactions
  id, ledger_type ('material'|'labor'),
  date, transaction_type ('lay_hang'|'thanh_toan'|'dieu_chinh'),
  entity_id, supplier_id|contractor_id, project_id, item_id,
  amount_tt, vat_pct_tt, vat_tt, total_tt,
  amount_hd, vat_pct_hd, vat_hd, total_hd,
  invoice_no, invoice_date, content, status, note

ledger_opening_balance
  ledger_type, entity_id, party_id, project_id,
  balance_tt, balance_hd, as_of_date
```

### 6.2 Module 5 – Dự án xây dựng
- `project_schedule` (tiến độ): hạng mục, công việc, BĐ/HT KH/TT, %, trễ
- `project_acceptance` (nghiệm thu): đợt NT, kết quả, SL NT CĐT/NB
- `project_estimate` (dự toán gốc): item, KL, đơn giá, thành tiền
- `project_change_orders` (CO): mã CO, mô tả, tác động chi phí, tác động TĐ
- `project_estimate_adjusted` (view tổng hợp dự toán + CO)
- `project_norms` (theo dõi định mức): KL DT vs KL TT, % đã dùng, cờ cảnh báo
- `project_transactions` (giao dịch dự án): nhập vật tư/nhân công/máy theo dự án (nguồn cho định mức)
- `project_contracts` (hợp đồng + giấy phép): loại, đối tác, giá trị, ngày HH, cảnh báo
- `project_cashflow_3way` (dòng tiền 3 bên): chiều GD (CĐT↔Cty↔Đội), số tiền, đợt

### 6.3 Module 6 – SL/DT
```
sl_dt_targets (chỉ tiêu)
  project_id, year, month, sl_target, dt_target, ...
sl_dt_actuals (thực hiện)
  project_id, year, month, sl_actual, dt_actual, ...
payment_schedule (tiến độ nộp tiền)
  project_id, dot, plan_date, plan_amount, actual_date, actual_amount
```

### 6.4 Module 2 – Tài chính NQ
- `loan_contracts` (hợp đồng vay)
- `loan_payments` (thanh toán vay)
- `journal_entries` (sổ nhật ký giao dịch)
- `expense_categories` (phân loại chi phí)
- `payable_receivable` (phải trả / phải thu — view consolidated từ ledger + thủ công)

### 6.5 Module 1 – Vật tư NCC (per-supplier)
```
supplier_delivery_daily (Vật tư ngày)
  supplier_id, date, item_id, qty, unit, cb_vat_tu, chi_huy_ct, ke_toan
supplier_delivery_monthly (Vật tư tháng — view tổng hợp từ daily)
supplier_reconciliation (Đối chiếu công nợ)
  supplier_id, period, ...
```
> *Ghi chú:* Cấu trúc giống nhau cho mọi NCC; UI tạo trang theo từng NCC bằng cách filter `supplier_id`. Khi thêm NCC mới chỉ cần tạo record trong `suppliers`, không cần code mới.

---

## 7. Roadmap Phase 1 (~10–12 tuần / 1 dev full-time)

| Sprint | Tuần | Hạng mục |
|--------|------|----------|
| S0 | 1–2 | Setup repo, Auth, RBAC, Audit log middleware, Master Data CRUD, Import Excel framework |
| S1 | 3–5 | Module 5 – Dự án (lớn nhất, nhiều sub-feature) |
| S2 | 6 | Module 1 – Vật tư NCC (per-supplier views) |
| S3 | 7 | Module 3 – Công nợ Vật tư + LedgerService core |
| S4 | 8 | Module 4 – Công nợ Nhân công (reuse LedgerService) |
| S5 | 9 | Module 6 – SL/DT + báo cáo tháng |
| S6 | 10 | Module 2 – Tài chính NQ + Dashboard tổng hợp |
| S7 | 11 | One-shot import dữ liệu Excel lịch sử + Export PDF/Excel theo mẫu |
| S8 | 12 | UAT, fix bug, training, go-live |

---

## 8. Rủi ro & Mitigation

| Rủi ro | Mức | Mitigation |
|--------|-----|------------|
| Công thức Excel phức tạp khó replicate (vd Tổng Hợp Công Nợ) | Cao | Đọc kỹ formula trước khi code mỗi module; có file Excel làm "ground truth test" |
| User kế toán chống đối thay đổi | Cao | UI grid Excel-like + giữ tên cột/sheet giống Excel + train song song 2 tuần |
| Master data lịch sử lệch (cùng NCC nhiều tên viết khác) | Trung | Bước import Excel có giai đoạn "data cleansing" — map manual |
| TT vs HĐ logic edge case (ví dụ HĐ về sau, 1 HĐ cover nhiều GD) | Trung | Phase 1 chỉ làm 1-1; flag các case lệch để user xử lý thủ công; Phase 2 cải tiến |
| Performance grid với 10k+ row | Thấp | AG Grid virtual scroll + server-side pagination |

---

## 9. Tech Stack chi tiết

- **Frontend**: Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui, AG Grid Community, TanStack Query
- **Backend**: Next.js Server Actions + Route Handlers, Zod validation
- **DB**: PostgreSQL 16 + Prisma 5
- **Auth**: Better Auth (email + password, RBAC roles)
- **Import/Export**: SheetJS (xlsx) cho parse + write Excel; pdf-lib hoặc Puppeteer cho PDF
- **Audit**: Prisma middleware tự log mọi mutation
- **Deploy**: Docker compose trên VPS công ty (Next.js + Postgres + nginx)

---

## 10. Success Criteria

- ✅ 100% dữ liệu lịch sử từ 6 file Excel import được vào DB không lỗi.
- ✅ Báo cáo tháng (Tổng hợp công nợ, SL/DT, Dòng tiền 3 bên) khớp 100% với Excel cũ trên dataset mẫu.
- ✅ ≥ 5 user dùng đồng thời không lỗi conflict.
- ✅ Mọi thao tác tạo/sửa/xóa có audit log.
- ✅ Export Excel ra file giống mẫu cũ (kế toán không cần làm lại).
- ✅ Thời gian load màn hình giao dịch < 2s với 10k row.

---

## 11. Out of Scope (Phase 2+)

- Mobile app
- Multi-tenant / multi-company isolation
- Tích hợp ngân hàng / e-invoice (HĐĐT) tự động
- BI dashboard nâng cao (cube/OLAP)
- Workflow approval đa cấp
- API public

---

## Next Steps

1. User review & duyệt design này.
2. Nếu OK → chạy `/ck:plan` để tạo plan chi tiết theo từng phase (phase-01-setup, phase-02-master-data, phase-03-du-an, ...).
3. Bắt đầu Sprint 0.
