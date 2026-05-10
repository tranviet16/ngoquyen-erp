---
phase: 1
title: "Foundation"
status: pending
priority: P1
effort: "2-3d"
dependencies: []
---

# Phase 1: Foundation

## Overview

Cài Glide, viết wrapper `<DataGrid>` generic + theme khớp shadcn + helper `bulkUpsert` Prisma + hook `useGridMutation`. Mọi phase sau dùng chung primitives này.

## Requirements

**Functional:**
- Wrapper `<DataGrid>` nhận columns/rows/handlers, render Glide bên trong
- Hỗ trợ: edit cell, paste range (TSV), add row, delete rows
- Optimistic update + rollback nếu server fail + toast (sonner đã có)
- Theme: light/dark sync `next-themes`, accent indigo khớp highlight TỔNG đã làm
- Keyboard: Tab/Shift+Tab/Enter/Esc/Arrow nav (Glide built-in)

**Non-functional:**
- Bundle ảnh hưởng landing = 0 (dynamic import per-page)
- Type-safe: `DataGridColumn<T>` generic theo row type
- Validation 2 lớp: Zod ở cell-edit (UX), Zod ở server action (truth)

## Architecture

```
<DataGrid<T>>  (components/data-grid/data-grid.tsx)
  ├─ props: columns, rows, role, handlers, schema (Zod)
  ├─ internal: localRows state (optimistic), pendingOps queue
  ├─ uses: useGridMutation<T> for server-action plumbing
  └─ renders: <DataEditor> from glide-data-grid

useGridMutation<T>  (components/data-grid/use-grid-mutation.ts)
  ├─ optimistic apply → server call → reconcile or rollback
  ├─ debounce 300ms cho single-cell edits theo row
  └─ toast on error

bulkUpsert helper  (lib/db/bulk.ts)
  ├─ generic: bulkUpsert<T>(model, rows, uniqueKey)
  └─ Prisma transaction, validate FK trước, fail toàn bộ nếu lỗi

Theme  (components/data-grid/theme.ts)
  ├─ glideThemeLight / glideThemeDark objects
  └─ hook useGlideTheme() đọc next-themes
```

## Related Code Files

**Create:**
- `components/data-grid/data-grid.tsx` — wrapper chính
- `components/data-grid/use-grid-mutation.ts` — hook optimistic
- `components/data-grid/theme.ts` — Glide theme khớp shadcn
- `components/data-grid/types.ts` — `DataGridColumn<T>`, `DataGridHandlers<T>`
- `components/data-grid/cells.tsx` — custom cell renderers (currency, date, fk-select)
- `lib/db/bulk.ts` — `bulkUpsert<T>` helper
- `lib/db/__tests__/bulk.test.ts` — test cho bulkUpsert

**Modify:**
- `package.json` — thêm `@glideapps/glide-data-grid` (peer: `lodash.merge`, `marked`, `react-responsive-carousel`)
- `app/globals.css` — import `glide-data-grid/dist/index.css` (hoặc inline)

## Implementation Steps

1. `npm i @glideapps/glide-data-grid lodash.merge marked react-responsive-carousel`
2. Import CSS Glide vào `app/globals.css`
3. Viết `components/data-grid/types.ts`:
   ```ts
   export interface DataGridColumn<T> {
     id: keyof T & string;
     title: string;
     width?: number;
     kind: "text" | "number" | "currency" | "date" | "select" | "boolean";
     readonly?: boolean | ((row: T, role: string) => boolean);
     options?: { id: number | string; name: string }[]; // for select
     validator?: ZodTypeAny;
   }
   export interface DataGridHandlers<T> {
     onCellEdit: (rowId: number, col: keyof T, value: unknown) => Promise<T>;
     onBulkPaste?: (rows: Partial<T>[]) => Promise<T[]>;
     onAddRow?: (template: Partial<T>) => Promise<T>;
     onDeleteRows?: (ids: number[]) => Promise<void>;
   }
   ```
4. Viết `components/data-grid/theme.ts`:
   - Map từ shadcn CSS vars sang Glide theme keys (`bgCell`, `bgHeader`, `textHeader`, `accentColor`, etc.)
   - Hook `useGlideTheme()` đọc `useTheme()` from next-themes
5. Viết `components/data-grid/use-grid-mutation.ts`:
   - State: `localRows: T[]`, `pendingOps: Map<rowId, op>`
   - `applyEdit(rowId, col, value)` → optimistic update local → debounced server call → on success replace với server response, on fail rollback + toast
6. Viết `components/data-grid/data-grid.tsx`:
   - Props: `columns`, `rows`, `role?`, `handlers`, `height?`
   - Dynamic import `DataEditor` from `glide-data-grid`
   - Implement `getCellContent(cell)` từ row + col + readonly check
   - Implement `onCellEdited`, `onPaste` (parse clipboard TSV → handlers.onBulkPaste)
   - Toolbar: "+ Thêm dòng", "Xóa N dòng đã chọn"
7. Viết `lib/db/bulk.ts`:
   ```ts
   export async function bulkUpsert<T extends { id?: number }>(
     model: PrismaModelDelegate,
     rows: Partial<T>[],
     uniqueKey: keyof T = "id" as keyof T
   ): Promise<T[]>
   ```
   - 1 transaction
   - Tách create vs update theo `uniqueKey` có giá trị
   - Validate FK qua `connect` clause (Prisma sẽ throw nếu invalid)
8. Test smoke: tạo 1 demo page `app/(app)/__demo/data-grid/page.tsx` (xóa sau Phase 6) với 5 cột để verify paste range + edit + add + delete
9. Compile check: `npm run build` (hoặc `next build`) phải pass

## Success Criteria

- [ ] `<DataGrid>` render được trên demo page với 5 cột
- [ ] Paste 10×3 từ Excel vào → tất cả cell điền đúng
- [ ] Edit 1 cell + Tab → server action fire sau 300ms, không block UI
- [ ] Sai validation Zod → cell highlight đỏ + toast, rollback
- [ ] Theme dark/light sync next-themes mượt (no flash)
- [ ] Bundle landing không tăng (`next build` size diff ≈ 0 cho `/`)
- [ ] `bulkUpsert` test pass: create-only, update-only, mixed, invalid FK rollback

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Glide theme object phức tạp, không khớp shadcn | Spike trước (~2h), nếu lệch >10% accept và fix incremental |
| Optimistic conflict 2 user edit cùng row | Server return `updatedAt` → reconcile theo timestamp; nếu conflict, refetch + toast |
| Paste range với row có FK invalid | Transaction rollback toàn bộ, toast hiển thị row index lỗi |
| Custom cell renderer (currency VND) phức tạp | Bắt đầu bằng text + parse, custom renderer sang Phase 6 |
| `lodash.merge` peer dep dính bundle | Import từ `lodash-es/merge` thay thế nếu nặng |

## Dependencies

Blocks Phase 2, 3, 4, 5.
