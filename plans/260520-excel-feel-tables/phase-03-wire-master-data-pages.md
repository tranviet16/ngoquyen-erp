---
phase: 3
title: Wire master-data pages
status: completed
priority: P1
effort: 1d
dependencies:
  - 1
  - 2
---

# Phase 3: Wire master-data pages

## Overview

Kết nối 7 trang master-data với infrastructure mới: server loader đọc URL → `parseTableQuery` → Prisma findMany+count; column metadata khai báo `sortable/filterable/editable/kind/defaultSort`. Trong phase này chưa enable inline-edit (Phase 4 mới wire patch actions) — chỉ sort/filter trước.

## Requirements

- Functional:
  - 7 trang load list theo URL params: search, sort, filter, page, pageSize.
  - Total count để pagination hiển thị đúng.
  - Mỗi cột meaningful đều `sortable: true`. Field text/enum/FK đều `filterable: true`.
  - Default sort giữ như hiện có (thường `createdAt desc` hoặc `name asc`).
- Non-functional:
  - Không break row-click → detail (đang có).
  - Không break action column (Sửa/Xóa button).

## Architecture

Pattern per page:
```
page.tsx (Server Component):
  const sp = await searchParams;
  const spec = ENTITY_SPEC;
  const state = parseTableQuery(sp, spec);
  const args = buildPrismaArgs(state, spec);
  const [rows, total] = await Promise.all([
    prisma.entity.findMany(args),
    prisma.entity.count({ where: args.where }),
  ]);
  return <EntitiesClient initial={rows} total={total} state={state} />;

client.tsx (Client Component):
  <DataTable
    columns={ENTITY_COLUMNS}   // có sortable/filterable
    data={initial}
    total={total}
    page={state.page}
    pageSize={state.pageSize}
    searchValue={state.search}
    resourceSpec={ENTITY_SPEC}
    actionColumn={...}
    onRowClick={...}
  />
```

`ResourceSpec` + `COLUMNS` định nghĩa cùng file để giữ DRY.

## Related Code Files

7 trang cần wire:
- Modify: `app/(app)/master-data/entities/page.tsx` + `entities-client.tsx`
- Modify: `app/(app)/master-data/suppliers/page.tsx` + `suppliers-client.tsx`
- Modify: `app/(app)/master-data/contractors/page.tsx` + `contractors-client.tsx`
- Modify: `app/(app)/master-data/items/page.tsx` + `items-client.tsx`
- Modify: `app/(app)/master-data/projects/page.tsx` + `projects-client.tsx`
- Modify: `app/(app)/du-an/page.tsx` + `du-an-list-client.tsx`
- Modify: `app/(app)/tai-chinh/vay/` (kiểm cấu trúc cụ thể) + `loan-list-client.tsx`

Create per resource:
- `lib/master-data/entities/table-spec.ts` (ResourceSpec + COLUMNS)
- ... tương tự cho suppliers, contractors, items, projects, du-an, vay.

## Implementation Steps

1. Đọc 7 trang để hiểu schema, columns hiện tại, FK options nguồn dữ liệu.

2. Per resource, tạo `lib/master-data/<resource>/table-spec.ts`:
   ```ts
   export const ENTITY_SPEC: ResourceSpec = {
     searchableColumns: ["name", "taxCode"],
     sortable: { name: "string", createdAt: "date", ... },
     filterable: {
       name: { kind: "text" },
       isActive: { kind: "equals" },     // boolean
       ...
     },
     defaultSort: { col: "name", dir: "asc" },
     defaultPageSize: 20,
   };

   export const ENTITY_COLUMNS: ColumnDef<Entity>[] = [
     { key: "name", header: "Tên", kind: "text", sortable: true, filterable: true },
     { key: "taxCode", header: "MST", kind: "text", sortable: true, filterable: true },
     { key: "isActive", header: "Hoạt động", kind: "boolean", filterable: true, render: ... },
     ...
   ];
   ```

3. Per trang `page.tsx`:
   - Đổi signature: `({ searchParams }: { searchParams: Promise<...> })`.
   - Parse + load qua helper.
   - Pass state xuống client.

4. Per `*-client.tsx`:
   - Import `XXX_COLUMNS`, `XXX_SPEC`.
   - Pass `resourceSpec` prop xuống `<DataTable>`.
   - Giữ nguyên `actionColumn`, `onRowClick`.

5. Test mỗi trang manual:
   - Click header → URL update, fetch lại.
   - Filter text/select → URL update.
   - Page next/prev giữ sort+filter.
   - Click row → vẫn navigate detail.

6. `npm run build` để check compile error toàn bộ.

## Success Criteria

- [ ] 7 trang load có sort + filter hoạt động.
- [ ] Pagination respect sort + filter (page 2 cùng filter giữ filter).
- [ ] Row-click → detail vẫn OK.
- [ ] Action column (Sửa/Xóa) vẫn OK.
- [ ] Build success, lint OK.
- [ ] Không có hardcode SQL — tất cả qua Prisma typed query.

## Risk Assessment

- **Schema FK options nặng**: ví dụ suppliers filter theo entityId, nếu có >200 entities → cap 200 và document để Phase tương lai làm searchable dropdown.
- **Trang dùng pattern khác (vay/du-an có structure riêng)**: đọc kỹ trước khi wire, đừng giả định.
- **N+1 query khi count với where phức tạp**: Prisma count với cùng where là OK; nếu chậm → log + index recommendation cho Phase sau.
- **Decimal field filter range**: cast string → Prisma Decimal, test với balance/amount.
