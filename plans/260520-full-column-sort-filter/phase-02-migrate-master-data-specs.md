---
phase: 2
title: Migrate master-data specs
status: completed
priority: P1
effort: 6h
dependencies:
  - 1
---

# Phase 2: Migrate master-data specs

## Overview

Migrate 7 master-data resources sang ColumnDef v3 + `deriveResourceSpec`. Drop redundant `SPEC.sortable/filterable` maps. Load FK options trong page.tsx (cap 200, Promise.all parallel).

## Requirements

- Functional:
  - 7 resources: entities, suppliers, contractors, items, projects, du-an, loans.
  - Mọi data column có `kind` set → sort + filter default-on.
  - FK columns dùng `fk: { relation, sortField, options }` — sort theo tên join, filter dropdown.
  - Skip computed/virtual columns (`_count`, `_pending`, action column).
- Non-functional:
  - 0 trang vỡ — manual smoke per page (basic load + sort/filter test trong phase 4).
  - FK option loading: Promise.all per page, cap 200 per FK.

## Architecture

### Pattern per resource (ví dụ entities)

```ts
// lib/master-data/entities/table-spec.ts
import { deriveResourceSpec } from "@/lib/table/derive-spec";
import type { ColumnDef } from "@/components/data-table/types";

export const ENTITY_COLUMNS: ColumnDef<Entity>[] = [
  { key: "name", header: "Tên đơn vị", kind: "text", editable: true },
  { key: "type", header: "Loại", kind: "select", filterOptions: ENTITY_TYPES, editable: true, editKind: "select", editOptions: ENTITY_TYPES },
  { key: "note", header: "Ghi chú", kind: "text", editable: true },
];

export const ENTITY_SPEC: ResourceSpec = deriveResourceSpec(ENTITY_COLUMNS, {
  searchableColumns: ["name", "note"],
  defaultSort: { col: "name", dir: "asc" },
  defaultPageSize: 50,
});
```

### FK ví dụ (Project page)

```ts
// page.tsx
const [projects, entities] = await Promise.all([
  prisma.project.findMany({ include: { ownerInvestor: true }, take: 200 }),
  prisma.entity.findMany({ select: { id: true, name: true }, take: 200 }),
]);

const PROJECT_COLUMNS: ColumnDef<Project>[] = [
  { key: "code", header: "Mã", kind: "text", editable: true },
  { key: "name", header: "Tên", kind: "text", editable: true },
  { key: "ownerInvestorId", header: "Chủ đầu tư", kind: "fk",
    fk: { relation: "ownerInvestor", sortField: "name",
          options: entities.map(e => ({ id: String(e.id), name: e.name })) },
    render: (r) => r.ownerInvestor?.name ?? "-" },
  { key: "status", header: "Trạng thái", kind: "select", filterOptions: PROJECT_STATUSES },
];
```

## Audit gap per resource (theo brainstorm)

| Resource | FK cần config | Sort thiếu | Filter thiếu |
|---|---|---|---|
| Entity | - | type, note | note |
| Supplier | - | taxCode, phone, address | taxCode, address |
| Contractor | - | leader, contact | contact |
| Item | - | unit, type, note | type, note |
| Project | ownerInvestor → entity | ownerInvestor | ownerInvestor |
| DuAn | ownerInvestor → entity | ownerInvestor, startDate, endDate | ownerInvestor, dates |
| Loan | lender → entity | principalVnd, interestRatePct, dates | lender, dates |

## Related Code Files

- Modify (7 spec files):
  - `lib/master-data/entities/table-spec.ts`
  - `lib/master-data/suppliers/table-spec.ts`
  - `lib/master-data/contractors/table-spec.ts`
  - `lib/master-data/items/table-spec.ts`
  - `lib/master-data/projects/table-spec.ts`
  - `lib/master-data/du-an/table-spec.ts`
  - `lib/tai-chinh/loans/table-spec.ts`
- Modify (page.tsx) cho resource có FK: projects, du-an, loans — thêm Promise.all load FK options.
- Modify (server actions list) nếu cần: verify `include: { <fk>: true }` để FK render hoạt động (master-data thường đã có).

## Implementation Steps

1. Resource đơn giản trước (không FK): entities, suppliers, contractors, items.
   - Refactor `table-spec.ts`: ColumnDef v3 với `kind`, drop SPEC.sortable/filterable maps, gọi `deriveResourceSpec`.
   - Verify build + 1 smoke test (load page list).
2. Resource có FK: projects, du-an, loans.
   - Page.tsx: thêm `prisma.entity.findMany({ select: { id, name }, take: 200 })` song song với findMany chính.
   - Pass options vào COLUMNS qua `fk.options`.
   - Verify list query đã include FK relation (`include: { ownerInvestor: true }` etc.).
3. Verify URL round-trip: `?sort=ownerInvestor.name:asc` hoạt động (list query buildOrderBy nested).
4. `npx tsc --noEmit && npm run lint`.
5. Commit per resource hoặc gộp 1 commit "feat(table): migrate 7 master-data specs to ColumnDef v3".

## Success Criteria

- [ ] 7 spec files migrate sang `deriveResourceSpec`.
- [ ] FK columns (4 cột) sort theo tên join hoạt động.
- [ ] 7 trang load không lỗi.
- [ ] tsc + lint xanh.
- [ ] URL `?sort=entity.name:asc` round-trip OK trên trang có FK.

## Risk Assessment

- **Schema FK relation name mismatch**: brainstorm giả định tên (`ownerInvestor`, `lender`) — verify với Prisma schema trước khi config.
- **FK options >200**: cap 200 trong findMany. Document limitation.
- **Tên cột trùng giữa render và sortKey**: ví dụ render dùng `ownerInvestor.name` nhưng filter key vẫn là `ownerInvestorId`. Spec sort key = `entity.name`, filter key = `ownerInvestorId`. Kiểm tra apply-filter logic không nhầm.
- **Action column / _count column**: bỏ `kind` → auto skip cả sort+filter. Verify.
