# Brainstorm — Rewrite tab "Phân loại chi phí" (Tài chính NQ)

**Date:** 2026-05-11
**Status:** Approved

## Problem
Trang `/tai-chinh/phan-loai-chi-phi` đang là **CRUD master data `ExpenseCategory`** (hierarchical tree). SOP cho thấy trang này phải là **TRA CỨU/FILTER** giao dịch trên Sổ nhật ký:
- Filter: Nhóm giao dịch (Thu cố định / Thu biến đổi / Chi cố định / Chi biến đổi), Loại cụ thể (= ExpenseCategory), Từ-Đến tháng, Từ khóa
- Output: KPI tổng tiền + bảng kết quả + drill-down

Code hiện tại sai purpose. Ngoài ra `JournalEntry.entryType` chỉ có `thu|chi|chuyen_khoan` — KHÔNG có khái niệm "cố định/biến đổi" (SOP yêu cầu).

## Goal
Rewrite page thành filter view. Thêm `costBehavior` enum cho JournalEntry để phân biệt cố định vs biến đổi. CRUD ExpenseCategory giữ nguyên nhưng MVP không yêu cầu page riêng (admin dùng SQL hoặc move vào sub-route sau).

## Approaches considered

| # | Approach | Verdict |
|---|----------|---------|
| 1 | Filter view trên journal_entries, thêm `costBehavior` enum | ✅ Chọn — bám sát SOP, schema nhỏ gọn |
| 2 | Tách 2 sub-route (filter + CRUD category) | ❌ Tăng độ phức tạp, MVP chưa cần CRUD UI |
| 3 | Filter view + move CRUD sang phan-loai-giao-dich | ⚠️ Đẹp hơn về phân chia trách nhiệm nhưng scope rộng — để follow-up |

## Decisions

| Quyết định | Lựa chọn | Rationale |
|------------|----------|-----------|
| Trang | Rewrite thành filter view | SOP truth |
| Nhóm cố định/biến đổi | Thêm cột `costBehavior` enum (`fixed | variable | transfer`) trên JournalEntry | Trực tiếp, không phụ thuộc category hierarchy |
| Số nhóm filter | 4 nhóm = entryType × costBehavior (trừ transfer) → Thu cố định, Thu biến đổi, Chi cố định, Chi biến đổi | Map 1-1 SOP |
| CRUD ExpenseCategory | KHÔNG xóa logic CRUD trong service. Trang CRUD UI tạm bỏ — admin dùng SQL/seeder | YAGNI: chưa có nhu cầu UI thường xuyên |
| Backfill `costBehavior` JE cũ | Default `variable`, admin chỉnh sau qua bulk-update tool (hậu MVP) | Pragmatic — không block migration |
| Drill-down | Click row → mở JE detail (cùng modal/route với nhật ký) | DRY: dùng UI nhật ký hiện có |

## Final design

### Schema change
```prisma
model JournalEntry {
  // ... existing fields
  costBehavior String @default("variable") // "fixed" | "variable" | "transfer"

  @@index([costBehavior, date])
}
```
Migration: backfill all rows hiện có thành `"variable"` (an toàn — admin sửa sau).

### Page layout `/tai-chinh/phan-loai-chi-phi`
```
🔍 Tra cứu & Phân loại giao dịch
[Nav 6 link tài chính giữ nguyên]

⚙ Bộ lọc
[Nhóm: All ▼] [Loại cụ thể: All ▼] [Từ: yyyy-mm] [Đến: yyyy-mm] [Từ khóa]

📊 Tổng hợp
[KPI: Tổng tiền matching] [KPI: Số giao dịch] [KPI: Trung bình/GD]

📋 Bảng kết quả (max 500 row, paginate)
Ngày | Nhóm | Loại cụ thể | Mô tả | Nguồn | Số tiền | →
                                              [Click row → JE detail]
```

### Server query
```ts
listJournalEntries({
  entryType?: "thu" | "chi",
  costBehavior?: "fixed" | "variable",
  expenseCategoryId?: number,
  dateFrom?: string,
  dateTo?: string,
  q?: string,  // search in description
  page, pageSize
});
```
Thêm aggregate `{ totalAmount, rowCount, avgAmount }` cho KPI.

### JE form update
Form `/tai-chinh/nhat-ky` thêm dropdown `costBehavior` (3 lựa chọn). Default theo `entryType`:
- `thu` → default `variable`
- `chi` → default `variable`
- `chuyen_khoan` → force `transfer` (disabled)

### Nhóm hiển thị
4 nhóm trên UI = composed key:
- "Thu cố định" = `entryType=thu, costBehavior=fixed`
- "Thu biến đổi" = `entryType=thu, costBehavior=variable`
- "Chi cố định" = `entryType=chi, costBehavior=fixed`
- "Chi biến đổi" = `entryType=chi, costBehavior=variable`
- "Chuyển khoản" = `entryType=chuyen_khoan` (riêng, không có cố định/biến đổi)

## Out of scope (MVP)
- Bulk update `costBehavior` cho JE cũ (admin manual hoặc SQL)
- CRUD UI cho ExpenseCategory (giữ qua service/SQL)
- Export Excel kết quả filter
- Pivot view by category (tab phụ)
- Auto-suggest costBehavior dựa trên expenseCategory

## Files affected
| Action | File |
|--------|------|
| Edit | `prisma/schema.prisma` (add `costBehavior` field + index) |
| Create | `prisma/migrations/*_je_cost_behavior/migration.sql` (add col + backfill default) |
| Edit | `lib/tai-chinh/journal-service.ts` (accept costBehavior input + filter) |
| Rewrite | `app/(app)/tai-chinh/phan-loai-chi-phi/page.tsx` |
| Create | `components/tai-chinh/expense-filter-client.tsx` (client form + table) |
| Delete | `components/tai-chinh/expense-category-client.tsx` (CRUD UI cũ — chuyển service-only) |
| Edit | `app/(app)/tai-chinh/nhat-ky/*` (form thêm dropdown costBehavior) |

## Risks
| Risk | Mitigation |
|------|-----------|
| JE cũ default `variable` → báo cáo lệch | Document: admin chỉnh thủ công các JE Thu/Chi cố định (lương VP, thuê nhà, BHXH) sau migration |
| Filter query slow ở 10k+ rows | Index `(costBehavior, date)` + `(entryType, date)`; limit 500 row + paginate |
| `expense-category-client` cũ có flow đang dùng? | Scout xác nhận chỉ trang `/phan-loai-chi-phi` import → an toàn xóa |
| User search "Từ khóa" full-text Vietnamese | `description ILIKE %q%` đủ cho MVP; full-text search là follow-up |

## Success criteria
- [ ] Trang `/tai-chinh/phan-loai-chi-phi` hiển thị filter form + KPI + bảng kết quả
- [ ] 4 nhóm composed key filter đúng
- [ ] KPI tổng + count + avg chính xác trên dataset filtered
- [ ] Click row drill-down sang JE detail (modal hoặc route)
- [ ] JE form lưu được `costBehavior`
- [ ] `npx tsc --noEmit` clean
- [ ] Migration backfill all JE cũ thành `variable` không error

## Effort
~3-4h, 1 phase.

## Dependencies
**Không phụ thuộc plan A (CashAccount).** Có thể ship song song. Nếu ship sau Plan A thì column "Nguồn" trong bảng kết quả sẽ hiển thị tên từ FK; trước Plan A thì hiển thị string trực tiếp.
