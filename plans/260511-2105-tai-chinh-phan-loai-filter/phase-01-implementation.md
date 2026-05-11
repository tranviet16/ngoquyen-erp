---
phase: 1
title: "Implementation"
status: pending
priority: P2
effort: "3-4h"
dependencies: []
---

# Phase 1: Implementation

## Overview
Thêm `costBehavior` field cho `JournalEntry` + backfill default `variable`. Rewrite `/tai-chinh/phan-loai-chi-phi` thành filter view: form lọc (4 nhóm + category + date range + keyword), KPI tổng hợp, bảng kết quả + drill-down JE. Xóa CRUD UI cũ (giữ service-only).

## Architecture

### Schema (Prisma)
```prisma
model JournalEntry {
  // ... existing
  costBehavior String @default("variable") // "fixed" | "variable" | "transfer"

  @@index([costBehavior, date])
}
```

### Migration backfill
```sql
-- Prisma migration tự tạo ALTER TABLE ADD COLUMN với default
-- Sau đó append:
UPDATE journal_entries SET "costBehavior" = 'transfer' WHERE "entryType" = 'chuyen_khoan';
-- Phần còn lại giữ default 'variable' — admin chỉnh thủ công fixed entries (lương VP, BHXH, thuê nhà) sau
```

### `lib/tai-chinh/journal-service.ts` updates
- `JournalEntryInput` thêm `costBehavior?: "fixed" | "variable" | "transfer"`
- `createJournalEntry`/`patchJournalEntry` set field; auto-force `transfer` khi `entryType=chuyen_khoan`
- `listJournalEntries` thêm filter:
  ```ts
  type ListFilter = {
    entryType?: "thu" | "chi" | "chuyen_khoan";
    costBehavior?: "fixed" | "variable" | "transfer";
    expenseCategoryId?: number;
    dateFrom?: string; // yyyy-mm-dd
    dateTo?: string;
    q?: string; // ILIKE %q% description
    page?: number;
    pageSize?: number;
  };
  ```
- Trả về `{ rows, total, aggregate: { totalAmountVnd, rowCount, avgAmountVnd } }`

### Page `/tai-chinh/phan-loai-chi-phi/page.tsx` (rewrite)
Server component:
- Parse `searchParams` (nhóm composed key, categoryId, từ, đến, q, page)
- Map composed key → `{entryType, costBehavior}`:
  - `thu-fixed` → `{entryType:"thu", costBehavior:"fixed"}`
  - `thu-variable`, `chi-fixed`, `chi-variable`
  - `transfer` → `{entryType:"chuyen_khoan"}`
- Call `listJournalEntries(filter)` + `listExpenseCategories()` (cho dropdown)
- Render `<ExpenseFilterClient initial=... categories=... result=... />`

### `components/tai-chinh/expense-filter-client.tsx` (create)
Client component:
- Filter form (5 control: Select nhóm, Select category, 2 month-input, text input keyword) → submit qua URL `searchParams` (router.push)
- KPI 3 card: Tổng tiền, Số GD, Trung bình
- Bảng kết quả: Ngày | Nhóm | Loại cụ thể | Mô tả | Nguồn | Số tiền | →
- Click row → navigate `/tai-chinh/nhat-ky?focus=${id}` (hoặc modal — TBD: dùng `<Link>` đơn giản trước)
- Pagination footer

### JE form `/tai-chinh/nhat-ky/*` update
Thêm dropdown `costBehavior`:
- `entryType=thu` → default `variable`, options [fixed, variable]
- `entryType=chi` → default `variable`, options [fixed, variable]
- `entryType=chuyen_khoan` → force `transfer` (disabled hoặc hidden)

### Delete CRUD UI
- Xóa `components/tai-chinh/expense-category-client.tsx`
- Service `lib/tai-chinh/expense-category-service.ts` giữ nguyên (vẫn dùng cho dropdown trong filter view + JE form)

## Related Code Files
- **Create:**
  - `components/tai-chinh/expense-filter-client.tsx`
- **Edit:**
  - `prisma/schema.prisma` (add `costBehavior` field + index)
  - `lib/tai-chinh/journal-service.ts` (input + filter + aggregate)
  - `app/(app)/tai-chinh/phan-loai-chi-phi/page.tsx` (rewrite)
  - `app/(app)/tai-chinh/nhat-ky/*` (form thêm dropdown costBehavior)
- **Delete:**
  - `components/tai-chinh/expense-category-client.tsx` (verify không có import khác)

## Implementation Steps

1. **Schema + migration:**
   - Edit `prisma/schema.prisma`: add `costBehavior String @default("variable")` + index `(costBehavior, date)`
   - `npx prisma migrate dev --name je_cost_behavior`
   - Append SQL backfill `UPDATE ... WHERE entryType='chuyen_khoan' SET costBehavior='transfer'`
   - `npx prisma generate`

2. **Service update:**
   - `journal-service.ts`: extend `JournalEntryInput` + `listJournalEntries` filter + aggregate
   - `createJournalEntry`/`patchJournalEntry`: auto-force `transfer` cho `chuyen_khoan`
   - Verify TypeScript clean

3. **Page rewrite `/tai-chinh/phan-loai-chi-phi`:**
   - Rewrite `page.tsx` thành filter view (server component parse searchParams)
   - Map composed key → entryType + costBehavior
   - Fetch list + categories + aggregate
   - Pass vào client

4. **Filter client component:**
   - Tạo `components/tai-chinh/expense-filter-client.tsx`
   - Form 5 control submit qua router.push với URL params
   - 3 KPI card + bảng kết quả + pagination
   - Row link → `/tai-chinh/nhat-ky?focus=${id}` (graceful — JE detail page handle param sau)

5. **JE form update:**
   - `app/(app)/tai-chinh/nhat-ky/*` form thêm Select `costBehavior`
   - Default theo `entryType`; disable khi `chuyen_khoan`
   - Verify create/edit JE lưu đúng field

6. **Cleanup CRUD UI cũ:**
   - Scout: `grep -rn "expense-category-client" app components` → nếu chỉ phan-loai-chi-phi import → safe delete
   - Xóa file `components/tai-chinh/expense-category-client.tsx`
   - Giữ service `expense-category-service.ts`

7. **Verify:**
   - `npx tsc --noEmit` clean
   - Manual QA:
     - `/tai-chinh/phan-loai-chi-phi`: chọn nhóm "Chi biến đổi", date range → KPI + bảng đúng
     - Filter category, keyword → bảng filter đúng
     - Click row → navigate sang nhật ký
     - JE form lưu `costBehavior` đúng
   - DB check: `SELECT "costBehavior", COUNT(*) FROM journal_entries GROUP BY 1` → mỗi nhóm có count expected

## Success Criteria
- [ ] Migration add column + backfill `transfer` cho `chuyen_khoan` chạy clean
- [ ] Page `/tai-chinh/phan-loai-chi-phi` hiển thị filter form 5 control + 3 KPI + bảng
- [ ] 4 nhóm composed key map đúng filter
- [ ] KPI totalAmount/rowCount/avgAmount tính đúng trên dataset filtered
- [ ] Click row drill-down sang JE detail (route hoặc modal)
- [ ] JE form lưu `costBehavior` qua dropdown, auto-`transfer` cho chuyen_khoan
- [ ] `expense-category-client.tsx` xóa, không broken import
- [ ] `npx tsc --noEmit` clean
- [ ] Existing JE create/edit không vỡ

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| JE cũ default `variable` → báo cáo lệch | Document: admin chỉnh thủ công các JE Thu/Chi cố định (lương VP, thuê nhà, BHXH) hậu migration |
| Filter slow với 10k+ rows | Index `(costBehavior, date)` + limit 500 row + paginate |
| `expense-category-client` cũ có usage khác? | Scout `grep -rn "expense-category-client"` trước khi xóa |
| Full-text search VN | MVP: `description ILIKE %q%` đủ — full-text là follow-up |
| Composed key URL params bloat | Dùng key ngắn (`g=` cho nhóm, `c=` category, `f=`/`t=` from/to, `q=` keyword) |
| Plan A ship sau → "Nguồn" hiển thị string | Conditional render: nếu có `fromAccountRef` → name FK, fallback string |
