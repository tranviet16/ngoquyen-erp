---
phase: 1
title: Query-params helper
status: completed
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Query-params helper

## Overview

Shared module dịch URL params ↔ Prisma `{orderBy, where, skip, take}`. Whitelist columns per resource để chống SQL injection. Là foundation cho Phase 2-3.

## Requirements

- Functional:
  - Parse URL: `?search=&sort=col:dir&filter.col=val&page=N&pageSize=M` → typed state.
  - Build URL: state → URL string (strip defaults).
  - Build Prisma query: state + whitelist → `{orderBy, where, skip, take}`.
  - FilterValue types: `text` (contains, case-insensitive), `range` (gte/lte cho number/Decimal), `dateRange` (from/to), `equals` (text/enum/FK).
- Non-functional:
  - Pure functions, không phụ thuộc React/Next.
  - Type-safe (TS generics theo Prisma model).
  - Reject column ngoài whitelist (silent skip + log warning).

## Architecture

```
URL → parseTableQuery(searchParams) → TableQueryState
TableQueryState + ResourceSpec → buildPrismaArgs() → {orderBy, where, skip, take}
TableQueryState → buildQueryString() → string (for URL push)
```

`ResourceSpec` per resource:
```ts
{
  searchableColumns: ["name", "code"],   // search box → OR contains
  sortable: { name: "string", createdAt: "date", ... },
  filterable: {
    name: { kind: "text" },
    status: { kind: "equals", options: ["active", "inactive"] },
    balance: { kind: "range" },
    createdAt: { kind: "dateRange" },
    entityId: { kind: "equals" },        // FK
  },
  defaultSort: { col: "createdAt", dir: "desc" },
  defaultPageSize: 20,
}
```

## Related Code Files

- Create: `lib/table/query-params.ts` — main module.
- Create: `lib/table/types.ts` — TableQueryState, FilterValue, ResourceSpec types.
- Create: `lib/table/__tests__/query-params.test.ts` — unit tests.

## Implementation Steps

1. Định nghĩa types tại `lib/table/types.ts`:
   - `FilterValue = TextFilter | RangeFilter | DateRangeFilter | EqualsFilter`.
   - `TableQueryState = { search?, sort?, filters, page, pageSize }`.
   - `ResourceSpec` như trên.

2. `parseTableQuery(searchParams: URLSearchParams, spec: ResourceSpec): TableQueryState`:
   - Đọc `search`, `page`, `pageSize` (fallback default).
   - Đọc `sort=col:dir` — chỉ accept nếu col ∈ `spec.sortable`.
   - Đọc mọi `filter.X` keys — match với `spec.filterable[X]`, parse theo kind.
   - Range: `filter.balance.gte`, `filter.balance.lte` (2 keys riêng).
   - DateRange: `filter.createdAt.from`, `filter.createdAt.to`.
   - Bỏ qua column không có trong spec.

3. `buildPrismaArgs(state, spec)`:
   - `where`: combine search (OR contains trên `searchableColumns`) + filters (AND).
     - text → `{ contains: val, mode: "insensitive" }`.
     - range → `{ gte?, lte? }`.
     - dateRange → `{ gte: new Date(from)?, lte: new Date(to)? }`.
     - equals → `{ equals: val }` (cast type theo Prisma column).
   - `orderBy`: `[{ [sort.col]: sort.dir }]` hoặc `[{ [defaultSort.col]: defaultSort.dir }]`.
   - `skip = (page - 1) * pageSize`, `take = pageSize`.

4. `buildQueryString(state, spec)`:
   - Output URL string, strip values bằng default (defaultSort, page=1, default pageSize).
   - Namespace: `sort=col:dir`, `filter.X=val`, `filter.X.gte=N`.

5. Unit tests:
   - parse: empty URL → default state; full URL → đúng state; column ngoài whitelist → bỏ qua.
   - buildPrismaArgs: mỗi kind filter → đúng Prisma shape; sort fallback → default; pagination math.
   - buildQueryString: round-trip với parse.

6. `npm run lint && npx vitest run lib/table`.

## Success Criteria

- [ ] 3 file mới với types đầy đủ.
- [ ] Parser reject column ngoài whitelist (kiểm bằng test).
- [ ] Round-trip URL → state → URL không mất info.
- [ ] Prisma args output có thể truyền thẳng vào `prisma.X.findMany()` (compile check).
- [ ] `vitest run lib/table` xanh ≥ 15 cases.

## Risk Assessment

- **SQL injection qua filter param**: whitelist trong `ResourceSpec` chặn ở parser; Prisma typed query chặn thêm 1 layer. KHÔNG bao giờ dùng raw SQL ở module này.
- **Date timezone**: parse `dateRange.from/to` là ISO string → `new Date()` dùng UTC. Document trong types.
- **Decimal precision**: range filter dùng `string | number` đầu vào, để Prisma tự cast.
