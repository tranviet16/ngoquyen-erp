# Brainstorm: Sort/filter trên MỌI cột của MỌI bảng

**Date:** 2026-05-20
**Status:** Approved, ready for /ck:plan
**Builds on:** plan 260520-excel-feel-tables (vừa commit `ec809ae`)

## Problem statement

User report: "Cần làm cho tôi sort và filter được trên tất cả các cột của tất cả các bảng (giống Excel)".

Sau khi triển khai plan trước (excel-feel-tables), audit cho thấy:
- **15 cột** chưa sortable
- **10 cột** chưa filterable
- **4 FK** chưa sort được theo tên join

Nguyên nhân: ColumnDef và ResourceSpec là **2 nơi** phải đồng bộ. Mỗi cột mới phải khai báo cả ở `column.sortable: true` (presentation) VÀ `spec.sortable[col]` (server whitelist). Burden này khiến nhiều cột "quên enable".

## Audit coverage (per resource)

| Resource | Cột displayed | Sort hiện | Filter hiện | Gap |
|---|---|---|---|---|
| Entity | name, type, note | 1/3 | 2/3 | type sort + note sort/filter |
| Supplier | name, taxCode, phone, address | 1/4 | 2/4 | 3 sort + 2 filter |
| Contractor | name, leader, contact | 1/3 | 2/3 | 2 sort + 1 filter |
| Item | code, name, unit, type, note | 2/5 | 3/5 | 3 sort + 2 filter |
| Project | code, name, ownerInvestor, status, _count | 3/4 (skip virtual) | 3/4 | ownerInvestor sort/filter |
| DuAn | code, name, ownerInvestor, startDate, endDate, status | 5/6 | 3/6 | ownerInvestor sort/filter, dates filter |
| Loan | lenderName, principalVnd, interestRatePct, startDate, endDate, paymentSchedule, _pending, status | 3/7 (skip virtual) | 3/7 | 4 sort + 4 filter |
| Ledger transaction | date, transactionType, entityId, partyId, projectId, itemId, content, amountTt, vatPctTt, totalTt, amountHd, vatPctHd, totalHd, invoiceNo, status, note | ~5/16 | ~10/16 | 11 sort + 6 filter |
| Ledger opening | entityId, partyId, projectId, asOfDate, balanceTt, balanceHd, note | 3/7 | 4/7 | 4 sort + 3 filter |

## Decisions

| # | Quyết định |
|---|---|
| 1 | **Scope**: mọi data column (text/number/date/enum/boolean/FK). Skip computed/virtual columns + action column. |
| 2 | **FK sort**: dropdown filter + sort theo tên join (Prisma nested orderBy `{entity:{name:"asc"}}`). |
| 3 | **Ledger**: cover toàn bộ kèm filter widget mới cho cột thiếu. |
| 4 | **Approach**: refactor sang single source of truth + default-on convention. Không phải chỉ patch coverage. |
| 5 | **KHÔNG** thêm cột mới (createdAt, contractValue, ...). Giữ layout hiện tại. |
| 6 | **Backward compat**: spec hiện có override map vẫn được tôn trọng — không break existing pages. |

## Approaches considered

**A) Refactor single source of truth + default-on** ← **CHỌN**
- Auto-derive ResourceSpec từ ColumnDef array.
- Convention: column có `kind` → mặc định sortable+filterable. Opt-out bằng `false`.
- Extend ColumnDef với `fk: { relation, sortField, options? }` cho FK.
- Extend `buildPrismaArgs` cho nested orderBy.
- Pros: bền vững, thêm cột tương lai chỉ sửa 1 nơi. Effort ~2 ngày.
- Cons: refactor nặng hơn coverage-only.

**B) Coverage expansion only**
- Giữ kiến trúc, chỉ thêm flags vào 9 specs.
- Pros: nhanh hơn (~1.5 ngày).
- Cons: vẫn duplicate 2 nơi; tương lai quên enable cột mới như cũ.

**C) Bao gồm thêm cột mới (createdAt, contractValue, ...)**
- A + thêm cột chưa hiển thị vào bảng.
- Pros: thông tin đầy đủ.
- Cons: ~2.5 ngày, UI đông, scope creep — REJECTED.

## Architecture (final)

### ColumnDef v3
```ts
interface ColumnDef<T> {
  key: string;
  header: string;
  kind?: "text"|"number"|"date"|"select"|"boolean"|"currency"|"fk";
  render?: (row: T) => ReactNode;
  align?: "left"|"right"|"center";
  // Default-on if kind set:
  sortable?: boolean;
  filterable?: boolean;
  // For select/boolean filter widgets:
  filterOptions?: { id: string; name: string }[];
  // For FK columns:
  fk?: {
    relation: string;        // e.g. "entity"
    sortField: string;       // e.g. "name"  → URL "?sort=entity.name:asc"
    options?: { id, name }[]; // dropdown choices
  };
  // Existing:
  editable?: boolean;
  editKind?: "text"|"number"|"boolean"|"select";
  editOptions?: { id, name }[];
  parseEdit?: (raw: string) => unknown;
}
```

### Auto-derive helper
```ts
// lib/table/derive-spec.ts
export function deriveResourceSpec(
  columns: ColumnDef<any>[],
  base: Pick<ResourceSpec, "searchableColumns"|"defaultSort"|"defaultPageSize">,
  override?: Partial<ResourceSpec>,
): ResourceSpec {
  const sortable: Record<string, SortType> = {};
  const filterable: Record<string, FilterableConfig> = {};
  for (const col of columns) {
    const enabled = col.kind != null;
    const sortKey = col.fk ? `${col.fk.relation}.${col.fk.sortField}` : col.key;
    if ((col.sortable ?? enabled) === true) {
      sortable[sortKey] = mapKindToSortType(col.kind!);
    }
    if ((col.filterable ?? enabled) === true) {
      filterable[col.key] = {
        kind: mapKindToFilterKind(col.kind!),
        options: col.fk?.options ?? col.filterOptions,
      };
    }
  }
  return { ...base, sortable, filterable, ...override };
}
```

### buildPrismaArgs nested orderBy
```ts
function buildOrderBy(sort: SortState, spec: ResourceSpec) {
  if (!sort || !spec.sortable[sort.col]) return defaultOrderBy(spec);
  // "entity.name" → { entity: { name: "asc" } }
  const parts = sort.col.split(".");
  return parts.reduceRight<any>(
    (acc, k, i) => i === parts.length - 1 ? { [k]: sort.dir } : { [k]: acc },
    null,
  );
}
```

### DataGrid in-memory FK sort
```ts
function getCellValue(row, col) {
  if (col.fk) return row[col.fk.relation]?.[col.fk.sortField];
  return row[col.key];
}
```

## Phases (5 phases, ~2 ngày)

| # | Phase | Effort | Depends |
|---|---|---|---|
| 1 | Types + derive helper + nested orderBy + tests | 4h | - |
| 2 | Migrate 7 master-data specs to v3 ColumnDef | 6h | 1 |
| 3 | Migrate 2 ledger grids (transaction + opening) | 4h | 1 |
| 4 | Manual test 11 pages + edge cases | 2h | 2, 3 |
| 5 | Cleanup + tsc/lint/vitest + docs | 2h | 4 |

## Risks

- **FK options N+1**: each FK column needs 1 findMany cap 200. Mitigate: parallel Promise.all per page (already pattern).
- **Auto-derive override conflict**: if spec passes both ColumnDef + explicit map, explicit wins. Document precedence.
- **Existing tests on Phase 1 (32 tests)**: nested orderBy adds case — extend, don't replace.
- **In-memory FK sort assumes eager join**: verify ledger queries already include `include: { entity: true, party: true, project: true }`. If not, add.
- **Search box vs filter text**: keep both — search is OR across columns, filter is AND per column. Document.

## Success criteria

- [ ] 7 master-data + 4 ledger pages: mọi data column có sort indicator + filter widget.
- [ ] FK column sort hoạt động (vd Ledger sort theo tên Entity).
- [ ] `?sort=entity.name:desc` URL hoạt động cho master-data.
- [ ] Unit tests Phase 1 + nested orderBy ≥ 40 cases.
- [ ] tsc + lint + vitest xanh.
- [ ] Backward compat: 0 trang vỡ.

## Out of scope

- Thêm cột mới (createdAt, contractValue, deletedAt, ...).
- Bulk edit / multi-row operations.
- Persisted view DB preset (vẫn URL-only).
- Server-side filter cho ledger (vẫn in-memory).
