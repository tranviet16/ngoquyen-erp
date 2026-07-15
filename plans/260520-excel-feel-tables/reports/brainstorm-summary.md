# Brainstorm Summary — Excel-feel cho tất cả bảng

**Date:** 2026-05-20
**Status:** Approved, ready for `/ck:plan`

## Problem Statement

User cần mọi bảng trong app có trải nghiệm Excel-like:
- Sort/filter mọi cột.
- Inline edit (cho field phù hợp).
- Thêm/xóa dòng tiện như Excel.

Hiện tại có 2 hệ thống bảng:

| Pattern | Component | Trang | Đặc tính |
|---|---|---|---|
| Read-only paginated | `DataTable` (shadcn) | master-data/*, du-an, vay | Server-paginated qua URL, search, row-click → detail |
| Excel-like grid | `DataGrid` (glide-data-grid) | cong-no-vt/nc (so-du + nhap-lieu) | Inline edit, paste, +/- dòng, optimistic save |

## Requirements

**Functional:**
- Sort: click header → asc/desc/none, URL-driven (master-data) hoặc in-memory (ledger).
- Filter: per-column widget theo kind (text/number/date/select), URL-driven (master-data) hoặc in-memory (ledger).
- Inline edit master-data: opt-in cho field "safe" (text, bool, number, enum).
- Pagination respects sort+filter (server-side cho master-data).
- Giữ nút "Thêm" → form modal/page hiện tại.
- Giữ row-click → trang chi tiết.

**Non-functional:**
- SQL injection-safe: whitelist columns per resource.
- Race-safe: pending edits flush trước khi URL push.
- Bundle: không thêm thư viện nặng (tận dụng shadcn + glide đã có).

## Approved Approach: Hybrid Evolution

Giữ 2 hệ thống bảng (đúng vai trò), nâng cấp song song bằng infrastructure chung.

```
lib/table/query-params.ts (URL ↔ {orderBy, where, skip, take})
       ↓                                          ↓
  <DataTable> v2                            <DataGrid> +
  (master-data, server)                     (ledger, client)
   - sort header                             - sort header
   - filter row                              - filter row
   - inline edit (opt-in)                    - đã có edit
   - giữ nút Thêm                            - đã có +/-
```

### Decisions (5 câu hỏi đã chốt)

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Inline-edit field nào? | Text/bool/number/enum ✅; FK/date nghiệp vụ/audit ❌. Khai báo `editable + editKind` per column. |
| 2 | Persisted view? | **Mức 1**: URL-based. Bỏ DB-saved presets (YAGNI). |
| 3 | Bulk edit? | **OUT scope**. Đợi nhu cầu thực. |
| 4 | Filter Decimal/date? | **Range** (≥, ≤). Equals chỉ cho text/enum/FK. |
| 5 | Default sort? | Giữ per-page default trong column metadata. Header hiển thị mũi tên. |

### Inline-edit phân loại

| Loại field | Inline? |
|---|---|
| Text (name, code, note, address, phone, email) | ✅ |
| Boolean (isActive, requiresInvoice) | ✅ (toggle 1-click) |
| Number/Decimal (unitPrice, vatPct, creditLimit) | ✅ |
| Enum nhỏ (<5 options) | ✅ (dropdown trong ô) |
| FK (entityId, projectId, categoryId) | ❌ (dùng form) |
| Date nghiệp vụ (asOfDate, dueDate) | ❌ (dùng form) |
| Computed/audit (createdAt, createdBy, deletedAt) | ❌ (read-only) |

## Architecture

### Layer 1 — Shared query-params helper

`lib/table/query-params.ts`:
- Parser: `URLSearchParams` → `{ sort?: {col, dir}, filters: Record<col, FilterValue>, page, pageSize }`.
- Prisma builder: → `{ orderBy, where, skip, take }`. Whitelist columns per resource.
- URL builder: state → URL string.
- FilterValue types: `{kind: "text", contains}`, `{kind: "range", gte?, lte?}`, `{kind: "equals", value}`, `{kind: "dateRange", from?, to?}`.

### Layer 2 — `<DataTable>` v2

Mở rộng `components/data-table.tsx`:
- Sortable headers: click cycle asc→desc→none, push URL.
- Filter row dưới header: per-kind widget (text input, number range, date picker, select dropdown).
- Inline-edit: cell với `editable=true` → dblclick → input → blur/Enter commit → call patch action.
- `stopPropagation` trên edit cell để không trigger row-click.
- Column metadata mở rộng: `kind`, `sortable`, `filterable`, `editable`, `editKind`.

### Layer 3 — Ledger `<DataGrid>`

- Custom header overlay (glide-data-grid header click handler):
  - Click → sort by column.
  - Filter row riêng (component bao quanh `<DataEditor>`).
- Filter in-memory (rows đã load full).

### Layer 4 — Per-page wiring

Mỗi trang master-data:
- Khai báo column metadata đầy đủ.
- Loader: parse URL → query-params helper → Prisma `findMany` + `count`.
- Inline-edit: import patch action per resource.

## Phases (Implementation)

| Phase | Output | Effort | Priority |
|---|---|---|---|
| 1 | `lib/table/query-params.ts` + tests (parser, Prisma builder, whitelist) | 0.5d | P1 |
| 2 | `<DataTable>` v2: sort header, filter row, kind metadata, inline-edit infra | 1d | P1 |
| 3 | Wire 6 master-data pages (entities/suppliers/contractors/items/projects/du-an) | 1d | P1 |
| 4 | Patch actions + inline-edit opt-in per resource | 1d | P2 |
| 5 | `<DataGrid>` sort + filter header (client-side) cho ledger | 0.5d | P2 |

**Total ~4d.**

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| SQL injection qua filter param | HIGH | Whitelist columns + kinds per resource. No raw SQL. Prisma typed `where`. |
| Inline-edit + row-click conflict | MED | `stopPropagation`, dblclick để trigger edit |
| URL params dài | LOW | Strip defaults, namespace `filter.*` |
| FK filter dropdown nặng (>1000 options) | MED | Cap 200, search-driven nếu vượt |
| Race optimistic edit + URL push | MED | Flush pending trước push (đã có pattern beforeunload từ data-grid) |
| Patch actions vô tình ghi đè field sensitive | HIGH | Mỗi patch action whitelist field cho phép sửa |
| Glide header sort/filter UX khác Excel | LOW | Document cho user, sử dụng convention chung |

## Security Considerations

- **Authz:** Inline-edit gọi server action có `requireRole` per resource (giống transactions/opening balances hiện tại).
- **Audit:** Mọi patch đi qua Prisma → audit middleware capture diff tự động.
- **Whitelist:** Server-side parser từ chối column không có trong whitelist (filter/sort/edit).
- **Validation:** Zod schema cho mỗi patch payload.

## Success Criteria

- [ ] Mọi bảng master-data có sort header + filter row, URL-driven.
- [ ] Pagination respect sort + filter.
- [ ] Inline-edit hoạt động cho field "safe" trên 6+ trang master-data.
- [ ] Ledger DataGrid có sort + filter header (in-memory).
- [ ] Không regression: form modal Thêm/Sửa, row-click detail, soft-delete vẫn hoạt động.
- [ ] Test pass: query-params helper unit tests, ít nhất 1 e2e per resource.
- [ ] Bundle không tăng >10KB.

## Out of Scope

- Bulk edit (đợi nhu cầu thực).
- Persisted view DB-saved presets.
- Column reorder/resize cross-session.
- Export filtered view sang Excel.
- Real-time collaboration on inline edit.

## Next Steps

→ Invoke `/ck:plan` với context này tại `plans/260520-excel-feel-tables/`.
