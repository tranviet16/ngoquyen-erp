---
phase: 2
title: DataTable v2 (sort/filter/inline)
status: completed
priority: P1
effort: 1d
dependencies:
  - 1
---

# Phase 2: DataTable v2 (sort/filter/inline)

## Overview

Nâng `components/data-table.tsx` từ table read-only paginated → table có sort header, filter row, inline-edit opt-in. URL-driven (đẩy lên router), respect pagination.

## Requirements

- Functional:
  - Sort: click header sortable cycle asc → desc → none (về default), push URL.
  - Filter row: dưới header, widget theo kind (text input, number range, date range, select dropdown). Debounce 300ms.
  - Inline-edit: cell với `editable=true` → dblclick → input → blur/Enter commit. Server action gọi qua prop.
  - `stopPropagation` ở edit cell + filter widget tránh trigger row-click.
  - "Đang lưu..." indicator khi có pending save.
- Non-functional:
  - Tận dụng shadcn `<Table>`, không thêm thư viện.
  - Backward compatible: trang chưa migrate (không khai báo `sortable/filterable/editable`) vẫn render như cũ.
  - `<select>` dropdown trong cell cap 200 options; >200 fallback sang form.

## Architecture

```
<DataTable v2>
  ├── Search box (giữ nguyên)
  ├── <table>
  │   ├── <thead>
  │   │   ├── header row: column title + sort indicator (▲/▼/⇅)
  │   │   └── filter row: per-column widget (text/range/date/select)
  │   └── <tbody>
  │       └── rows với cell:
  │           - readonly → render như cũ
  │           - editable → dblclick → input overlay → commit
  ├── Pagination (giữ nguyên)
  └── Toolbar: "Đang lưu..." indicator khi pending > 0
```

Column metadata mở rộng (`ColumnDef<T>`):
```ts
{
  key: string,
  header: string,
  render?: (row) => ReactNode,
  align?: "left" | "right" | "center",
  // NEW:
  kind?: "text" | "number" | "date" | "select" | "boolean",
  sortable?: boolean,
  filterable?: boolean,
  filterOptions?: { id, name }[],          // for select kind
  editable?: boolean,
  editKind?: "text" | "number" | "boolean" | "select",
  editOptions?: { id, name }[],
  parseEdit?: (raw: string) => unknown,    // cho number/date
}
```

New props:
```ts
{
  onCellEdit?: (row: T, key: string, value: unknown) => Promise<T | void>,
  resourceSpec?: ResourceSpec,             // for URL state respect
}
```

## Related Code Files

- Modify: `components/data-table.tsx` — main upgrade.
- Create: `components/data-table/sort-header.tsx` — sortable header cell.
- Create: `components/data-table/filter-cell.tsx` — filter widget per kind.
- Create: `components/data-table/editable-cell.tsx` — inline-edit cell với dblclick + input overlay.
- Create: `components/data-table/use-table-state.ts` — hook quản URL state (parse + push qua router).
- Create: `components/data-table/__tests__/` — minimal tests cho sort URL push.

## Implementation Steps

1. Tách `data-table.tsx` thành nhiều file con như Related Code Files (mỗi file <200 lines theo development-rules).

2. Implement `sort-header.tsx`:
   - Click cycle. Khi click trên cột không phải đang sort → asc. Đã asc → desc. Đã desc → none (return default).
   - Hiển thị icon: ▲ (asc), ▼ (desc), ⇅ (sortable nhưng chưa sort), không có icon (không sortable).
   - Call `onSortChange(col, dir | null)` prop.

3. Implement `filter-cell.tsx`:
   - Render theo `kind`:
     - text → `<Input>` debounced.
     - number → 2 `<Input type="number">` cho gte/lte.
     - date → 2 `<input type="date">` cho from/to.
     - select → `<select>` với option "Tất cả" + filterOptions.
     - boolean → `<select>` với "Tất cả" / "Có" / "Không".
   - Call `onFilterChange(col, FilterValue | null)`.

4. Implement `editable-cell.tsx`:
   - Default render dùng `column.render` (hoặc raw value).
   - Dblclick → switch sang input overlay theo `editKind`.
   - Enter/blur → commit qua `onCellEdit(row, key, parsed)` → toast.
   - Esc → cancel, revert.
   - `e.stopPropagation()` trên container để không trigger row-click.
   - Loading state khi commit đang chạy.

5. Implement `use-table-state.ts`:
   - Hook parse current URL → `TableQueryState` qua `parseTableQuery` từ Phase 1.
   - Expose `setSort(col, dir)`, `setFilter(col, val)`, `setSearch(s)`, `setPage(p)`.
   - Mỗi setter push URL qua `router.push(pathname + "?" + buildQueryString(...))`.
   - useTransition cho loading state.

6. Refactor `data-table.tsx`:
   - Import từ các file con.
   - Render header row + filter row trong `<TableHead>`.
   - Render `<EditableCell>` thay vì `<TableCell>` raw khi `column.editable`.
   - Pass URL state + handlers.
   - Toolbar "Đang lưu..." khi có inflight edit (track count tương tự `use-grid-mutation`).

7. Smoke test trang `__demo/data-grid` (hoặc tạo `__demo/data-table` nếu cần).

8. `npx tsc --noEmit && npm run lint`.

## Success Criteria

- [ ] Click header → URL update, server fetch lại với orderBy đúng.
- [ ] Gõ filter → URL update sau debounce, fetch lại với where đúng.
- [ ] Dblclick editable cell → input → Enter commit → row update, toast success.
- [ ] Esc → cancel, không gọi server.
- [ ] Pagination respect sort + filter.
- [ ] Trang cũ (chưa khai báo sortable/filterable/editable) vẫn render OK.
- [ ] `tsc` xanh, lint xanh.

## Risk Assessment

- **File >200 lines**: theo development-rules, tách thành ≥4 file con như đã thiết kế.
- **Inline-edit conflict với row-click**: `stopPropagation` + dblclick (không single-click) → an toàn.
- **Filter spam server**: debounce 300ms, useTransition cho loading state.
- **URL push race với pending edit**: edit pending → block sort/filter button (disabled) cho đến khi commit xong. Hoặc flush trước khi push.
- **Trang chưa migrate bị vỡ**: column metadata mới đều optional, render legacy nếu không có.
