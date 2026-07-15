---
phase: 1
title: Types + derive helper
status: completed
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Types + derive helper

## Overview

Foundation phase: extend ColumnDef với `fk` field + default-on convention, viết `deriveResourceSpec()` helper, extend `buildPrismaArgs` cho nested orderBy. Backward compat: spec override map (nếu truyền) wins.

## Requirements

- Functional:
  - ColumnDef v3 có optional `fk: { relation, sortField, options? }`.
  - `kind` set → `sortable` + `filterable` default `true`. Opt-out bằng `false` explicit.
  - `deriveResourceSpec(columns, base, override?)` → ResourceSpec hoàn chỉnh. Explicit override field wins.
  - `buildPrismaArgs` parse `?sort=entity.name:asc` → nested `{ entity: { name: "asc" } }`.
- Non-functional:
  - 100% backward compat: spec hiện có truyền `sortable`/`filterable` map vẫn hoạt động — không sửa 7 trang master-data ở phase này.
  - Unit tests >= 40 cases (32 existing + ≥8 mới cho nested orderBy + derive logic).

## Architecture

```
components/data-table/types.ts:
  interface ColumnDef<T> {
    key: string;
    header: string;
    kind?: "text"|"number"|"date"|"select"|"boolean"|"currency"|"fk";
    sortable?: boolean;       // default: kind != null
    filterable?: boolean;     // default: kind != null
    filterOptions?: { id; name }[];
    fk?: { relation: string; sortField: string; options?: { id; name }[] };
    // existing: render, align, editable, editKind, editOptions, parseEdit
  }

lib/table/derive-spec.ts:
  export function deriveResourceSpec(columns, base, override?) {
    const sortable = {}, filterable = {};
    for (const col of columns) {
      const on = col.kind != null;
      const sortKey = col.fk ? `${col.fk.relation}.${col.fk.sortField}` : col.key;
      if ((col.sortable ?? on) === true) sortable[sortKey] = mapKindToSortType(col.kind);
      if ((col.filterable ?? on) === true) {
        filterable[col.key] = {
          kind: mapKindToFilterKind(col.kind),
          options: col.fk?.options ?? col.filterOptions,
        };
      }
    }
    return { ...base, sortable, filterable, ...override };
  }

lib/table/query-params.ts buildOrderBy:
  // "entity.name" → { entity: { name: "asc" } }
  const parts = sort.col.split(".");
  return parts.reduceRight<any>((acc, k, i) =>
    i === parts.length - 1 ? { [k]: sort.dir } : { [k]: acc }, null);
```

## Related Code Files

- Modify: `components/data-table/types.ts` — add `fk` field.
- Modify: `lib/table/types.ts` — extend `ResourceSpec` nếu cần (FilterableConfig.options?).
- Create: `lib/table/derive-spec.ts` — `deriveResourceSpec` + `mapKindToSortType` + `mapKindToFilterKind`.
- Modify: `lib/table/query-params.ts` — `buildOrderBy` parse dot-notation, allow nested.
- Modify: `lib/table/__tests__/query-params.test.ts` — thêm ≥8 cases nested orderBy.
- Create: `lib/table/__tests__/derive-spec.test.ts` — ≥10 cases: default-on, opt-out, FK, override wins.

## Implementation Steps

1. Extend `ColumnDef` type với `fk?: {...}`. Mark `sortable`/`filterable` rõ là optional.
2. Tạo `lib/table/derive-spec.ts`:
   - `mapKindToSortType(kind) → "text"|"number"|"date"`.
   - `mapKindToFilterKind(kind) → FilterKind from lib/table/types.ts`.
   - `deriveResourceSpec(columns, base, override?)`.
   - Edge: column không có `kind` → skip cả sort+filter.
   - Edge: `fk` set nhưng `kind !== "fk"` → cho phép (FK string col vẫn có thể render text).
3. Extend `buildOrderBy` trong `query-params.ts`:
   - Split `sort.col` theo `.` → reduceRight thành nested object.
   - Whitelist check: chỉ accept nếu `spec.sortable[sort.col]` tồn tại.
4. Tests derive-spec: default-on, opt-out (`sortable: false`), FK sortKey = `relation.sortField`, override wins, kind-less col bị skip.
5. Tests buildOrderBy nested: `entity.name:asc` → `{entity:{name:"asc"}}`, `a.b.c:desc` → 3 nested, plain col vẫn 1-level, invalid col fallback default.
6. `npx tsc --noEmit && npx vitest run lib/table`.

## Success Criteria

- [ ] `deriveResourceSpec` exported + tested.
- [ ] `buildOrderBy` handle nested dot-notation.
- [ ] ≥40 test cases pass.
- [ ] tsc xanh.
- [ ] 7 trang master-data hiện có VẪN hoạt động (chưa migrate — backward compat verify).

## Risk Assessment

- **Nested orderBy whitelist**: `spec.sortable["entity.name"]` phải có entry → tests cover.
- **mapKindToFilterKind cho `fk`**: trả về `"equals"` (single-select dropdown). Cẩn thận khi kind=`"fk"` mà column không có `fk` field — throw hoặc fallback text.
- **Override precedence**: `{...base, sortable, filterable, ...override}` → override field-level wins toàn bộ map. Document rõ trong JSDoc.
