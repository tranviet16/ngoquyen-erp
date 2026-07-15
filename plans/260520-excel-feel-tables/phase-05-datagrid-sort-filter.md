---
phase: 5
title: DataGrid sort/filter
status: completed
priority: P2
effort: 0.5d
dependencies:
  - 1
---

# Phase 5: DataGrid sort/filter

## Overview

Thêm sort header + filter row vào `components/data-grid` (glide-data-grid wrapper) cho 4 trang ledger (cong-no-vat-tu opening + nhap-lieu, cong-no-nha-cung-cap opening + nhap-lieu). Khác Phase 2: ledger đã load full rows → sort/filter chạy IN-MEMORY trên client, không URL-driven. Inline-edit đã có sẵn qua `use-grid-mutation` (Phase 0).

## Requirements

- Functional:
  - Click header sortable → cycle asc → desc → none (back to default insertion order).
  - Filter row dưới header với widget theo kind (text contains, number range, date range, select).
  - Sort + filter combine: filter trước, sort sau.
  - Add row / delete row hoạt động bình thường trên view đã filter (insert vào full set, không phải view).
  - Reset filter button.
- Non-functional:
  - Reuse `FilterValue` types từ Phase 1 (`lib/table/types.ts`) — không define lại.
  - In-memory: dataset ledger ≤ vài nghìn rows; sort/filter native JS OK.
  - Không break inline-edit, paste, optimistic UI.

## Architecture

```
DataGrid (Phase 5):
  ├── Header row (glide custom drawCell):
  │   ├── Title + sort indicator (▲/▼/⇅)
  │   └── Click → setSortState({col, dir})
  ├── Filter row (1 row pinned trên top, outside glide hoặc dùng glide trick):
  │   └── Widget per column kind
  ├── Body rows (derived):
  │   const view = useMemo(() => {
  │     let r = applyFilter(rows, filters);
  │     r = applySort(r, sort);
  │     return r;
  │   }, [rows, filters, sort]);
  └── Pass `view` → glide-data-grid render
```

Vì glide-data-grid khó custom header click + filter row inline, có 2 option:
- **A) Header click qua `onHeaderClicked` callback** (glide hỗ trợ); filter row làm 1 HTML row riêng phía trên grid (outside glide).
- **B) Tự render thuần HTML table → bỏ glide cho ledger**. Đắt — bỏ qua, giữ glide.

→ Chọn A.

State:
```ts
const [sort, setSort] = useState<{col: string; dir: "asc"|"desc"} | null>(null);
const [filters, setFilters] = useState<Record<string, FilterValue>>({});
const view = useMemo(() => applyFilterSort(rows, filters, sort, columns), [...]);
```

## Related Code Files

- Modify: `components/data-grid/data-grid.tsx` — wire sort/filter UI + derived view.
- Create: `components/data-grid/filter-bar.tsx` — HTML row above glide với widget per column.
- Create: `components/data-grid/use-grid-view.ts` — hook quản sort+filter state + derived view.
- Create: `components/data-grid/apply-filter-sort.ts` — pure functions `applyFilter` + `applySort`.
- Modify: `components/data-grid/types.ts` — thêm `sortable?: boolean`, `filterable?: boolean`, `filterKind?: FilterKind` vào column spec.
- Reuse: `lib/table/types.ts` (Phase 1) cho `FilterValue` types.

## Implementation Steps

1. Extend `DataGridColumn` type:
   ```ts
   {
     id: string,
     title: string,
     // NEW:
     sortable?: boolean,
     filterable?: boolean,
     filterKind?: "text" | "number" | "date" | "select" | "boolean",
     filterOptions?: { id: string; name: string }[],
   }
   ```

2. Implement `apply-filter-sort.ts` (pure):
   - `applyFilter(rows, filters, columns)`: foreach row → check mọi filter pass → keep.
     - text: row[key]?.toLowerCase().includes(val.toLowerCase()).
     - range: row[key] >= gte && row[key] <= lte.
     - dateRange: tương tự với Date compare.
     - equals: row[key] === val.
   - `applySort(rows, sort)`: stable sort theo `sort.col` + `sort.dir`. Null/undefined cuối list.

3. Implement `use-grid-view.ts`:
   - Hook trả về `{sort, setSort, filters, setFilter, view, resetFilters}`.
   - `setSort(col)`: cycle current → asc → desc → null.
   - `setFilter(col, val | null)`: update map; null → delete key.

4. Implement `filter-bar.tsx`:
   - 1 row HTML grid (CSS grid-template-columns sync với glide column widths).
   - Per column filterable → render widget; non-filterable → empty cell.
   - Debounce 300ms cho text/number/date.

5. Modify `data-grid.tsx`:
   - Import `useGridView`, pass `view` (thay vì `rows`) xuống glide.
   - Wire `onHeaderClicked` → `setSort(col)`.
   - Custom draw header indicator (▲/▼) qua `drawHeader` callback hoặc append vào `column.title` dynamic.
   - Render `<FilterBar>` trước `<DataEditor>`.
   - Toolbar: "Đã lọc N/M dòng" khi filter active + "Xóa lọc" button.

6. Per 4 trang ledger client (cong-no-vat-tu opening + nhap-lieu, cong-no-nha-cung-cap opening + nhap-lieu):
   - Khai báo `sortable` cho cột có ý nghĩa (date, name, amount).
   - Khai báo `filterable` + `filterKind` cho cột meaningful.
   - Không cần code khác — hook lo phần còn lại.

7. Manual test mỗi trang:
   - Click header → sort.
   - Gõ filter → rows giảm.
   - Sort + filter combine OK.
   - Add row → insert vào full set, view auto-update.
   - Inline-edit row trong view filtered → save OK, view giữ nguyên.
   - Reset filter → all rows back.

8. `npx tsc --noEmit && npm run lint`.

## Success Criteria

- [ ] 4 trang ledger có sort header + filter row hoạt động.
- [ ] Sort + filter combine đúng (filter trước, sort sau).
- [ ] Inline-edit không break.
- [ ] Add/delete row hoạt động trên full set, view auto-refresh.
- [ ] Reset filter button OK.
- [ ] `tsc` xanh, lint xanh.

## Risk Assessment

- **glide-data-grid limited header customization**: `onHeaderClicked` + `drawHeader` đủ cho sort indicator. Filter row ra ngoài glide.
- **Filter bar column width sync với glide**: dùng same `columns[i].width`; có thể glitch khi user resize column. Phase này không support resize, nếu user resize → filter bar lệch (document as known limitation).
- **Large dataset performance**: ledger thường ≤ vài nghìn rows. `useMemo` cache view. Nếu >10k rows trong tương lai → migrate sang server-side filter (out scope).
- **Sort không stable với insertion-order default**: dùng stable sort (Array.sort ES2019+ đã stable).
- **Filter trong khi pending edit**: edit pending đẩy update vào full `rows` (qua `setRows` của `use-grid-mutation`). View tự rerender. OK.
