# Excel-like Input Tables — Brainstorm Summary

**Date:** 2026-05-07
**Scope:** Toàn bộ bảng *nhập liệu* trong các module ERP

## Problem Statement

UX bảng nhập liệu hiện tại (HTML table + inline `<input>` + `useTransition`) chậm thao tác so với Excel: không có fill handle, không paste range, keyboard nav hạn chế, không multi-cell select. Cần nâng cấp đồng loạt mà KHÔNG đổi cách giao tiếp DB (server action + Prisma + soft delete).

## Constraints

- Desktop-only, internal users (admin + kế toán phân quyền)
- Không yêu cầu accessibility (screen reader)
- Không nhập liệu trên mobile/tablet
- Giữ nguyên server action + Prisma pattern
- Style không phá đồng bộ shadcn/Tailwind hiện có

## Approaches Evaluated

| | A. AG Grid Community | B. TanStack Table tự build | C. Glide Data Grid |
|---|---|---|---|
| Excel-like UX | Trung bình (fill handle là Enterprise $$$) | Thấp (phải tự code) | **Cao** (canvas, native paste range, fill handle MIT) |
| Style đồng bộ shadcn | Khó | **Dễ** | Khó (tự viết theme) |
| Bundle | 400KB | 14KB | 150KB |
| A11y / mobile | Tốt | Tốt | Kém (chấp nhận được vì requirement loại trừ) |
| DX | Verbose colDefs | Sạch, type-safe | Trung bình |
| Volume lớn (>5k row) | OK | OK | **Tốt nhất** (canvas virtualized) |

## Decision: Hybrid

- **Glide Data Grid** → mọi bảng *nhập liệu* (gồm migrate `nhat-ky` từ AG Grid)
- **HTML table hiện tại** → mọi bảng *báo cáo rollup* (giữ style indigo/slate đã thống nhất)
- **Inline edit hiện tại** → giữ ở `chi-tieu-client` (chỉ vài field trong bảng báo cáo)

## Architecture

### Component layer
```
<DataGrid>  (wrapper duy nhất, props chuẩn hóa)
  ├─ columns, rows, role
  ├─ onCellEdit(rowId, col, value)         → debounce 300ms
  ├─ onBulkPaste(range)                    → 1 server action
  ├─ onAddRow(template)                    → optimistic + temp id
  ├─ onDeleteRows(ids[])                   → soft delete
  └─ validation (Zod schema)
```

### DB layer (KHÔNG đổi)
| UI action | Server function | Pattern |
|---|---|---|
| Edit 1 cell | existing `updateX(id, patch)` | debounce 300ms, optimistic |
| Paste range NxM | mới: `bulkUpsert(rows[])` | 1 transaction |
| Add row | `createX(data)` | optimistic + temp id replace |
| Delete rows | `softDeleteX(ids[])` | set `deletedAt` |

### Defense-in-depth
- **Cell-level Zod** (UX feedback nhanh)
- **Server action Zod** (truth, không tin client)
- **Permission check** ở server action theo role (admin/kế toán)
- **Cell readonly** ở Glide theo role qua `getCellContent` (UX hint)

## Phases (đồng loạt approach)

### Phase 1 — Foundation (~2-3 ngày)
- Cài `@glideapps/glide-data-grid`
- Theme khớp shadcn (light/dark, indigo accent), sync `useTheme()`
- `<DataGrid>` wrapper generic
- `lib/db/bulk.ts` — `bulkUpsert<T>` Prisma transaction helper
- Hook `useGridMutation` — optimistic + rollback + toast

### Phase 2 — Migrate bảng nhập liệu (song song)
- `cong-no-vt/nhap-lieu` + `so-du-ban-dau`
- `cong-no-nc/nhap-lieu` + `so-du-ban-dau`
- `sl-dt/nhap-lieu` (monthly inputs)
- `tai-chinh/nhat-ky` (xóa AG Grid sau khi migrate)
- Master data CRUD (nếu dạng bảng)

### Phase 3 — Polish & cleanup
- Phân quyền cell-level (admin full, kế toán per-column)
- Xóa `ag-grid-react` + `ag-grid-community`
- Dynamic import per-page (Glide ~150KB)
- E2E test: paste range từ Excel thật

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Theme dark mode lệch shadcn | Viết theme object sync với `useTheme()`, test cả 2 mode trước khi áp Phase 2 |
| Optimistic update conflict (2 user edit cùng row) | Server return updated row → reconcile bằng `id` + `updatedAt` |
| Bulk paste row mới chưa có FK valid | `bulkUpsert` validate FK trước, fail toàn bộ transaction |
| Phân quyền bypass | Server action **luôn** check role; UI readonly chỉ là hint |
| Bundle tăng landing | Dynamic import từng page nhập liệu |

## Success Criteria

- ✅ Paste 1 vùng 50×5 từ Excel vào bảng nhập liệu < 500ms
- ✅ Edit 1 cell + Tab sang cell kế < 50ms perceived latency
- ✅ Keyboard nav: Tab/Shift+Tab/Enter/Esc/Arrow đầy đủ
- ✅ Optimistic rollback khi server fail + toast lỗi rõ ràng
- ✅ Tất cả bảng nhập liệu dùng cùng `<DataGrid>` (DRY)
- ✅ Bundle landing không tăng (dynamic import)
- ✅ Xóa hoàn toàn `ag-grid-*` deps

## Out of Scope

- Bảng báo cáo rollup (giữ HTML table)
- `chi-tieu-client` inline edit (giữ nguyên)
- Mobile/tablet UX
- Accessibility / screen reader

## Next Step

`/ck:plan --deep` với context file này để tạo phase files chi tiết.
