---
phase: 3
title: "DataTable server và legacy"
status: completed
priority: P1
effort: 10h
dependencies: [2]
---

# Phase 3: DataTable server và legacy

## Context Links

- [Parent plan](./plan.md)
- [Manifest](./phase-01-coverage-manifest-blocker.md)
- Existing contracts: `components/data-table.tsx`, `components/data-table/**`, `lib/table/**`

## Overview

Migrate 7 enhanced server-paginated DataTables và 1 legacy full-list table. Giữ URL/bookmark behavior, page reset và server-wide ordering.

## Key Insights

- UI/spec default-on đang lệch: `deriveResourceSpec` dùng `kind`, `TableShell` đòi `sortable: true`.
- URL thiếu sort vẫn áp dụng `defaultSort`; header phải hiển thị effective default.
- Prisma builder hiện thiếu secondary stable order.
- Display labels có thể không cùng thứ tự raw code/ID.

## Requirements

- Chu kỳ ba trạng thái; default state restore `ResourceSpec.defaultSort`.
- Enhanced tables sort toàn dataset, reset page 1, reload URL giữ state.
- Stable tie-breaker đã whitelist, thường là `id` sau primary order.
- `kind` default-on và explicit `sortable:false` thống nhất UI/server.
- Server display sorts dùng verified field/relation/rank/query; không fallback raw ID/code.
- Legacy project categories dùng local full-list adapter, không nhét client sort vào generic server shell.
- Default header dùng neutral icon/`aria-sort="none"` theo quyết định UX, dù `ResourceSpec.defaultSort` có direction; tooltip giải thích “Thứ tự mặc định”.

## Architecture

`ResourceSpec` giữ allowlist và default. Common direct/nested `orderBy` đi qua builder; rank/computed/display-only sort dùng resource-owned, parameterized query adapter được Phase 1 xác minh. Không suy diễn relation từ field name.

## Related Code Files

- Modify: `components/data-table.tsx`, `components/data-table/table-shell.tsx`, `components/data-table/sort-header.tsx`, `components/data-table/use-table-state.ts`, `components/data-table/types.ts`
- Modify: `lib/table/types.ts`, `lib/table/derive-spec.ts`, `lib/table/query-params.ts`, focused tests
- Modify callers/specs: `components/tai-chinh/loan-list-client.tsx`; `app/(app)/du-an/du-an-list-client.tsx`; master-data contractor/entity/supplier/item/project clients; `project-detail-client.tsx`
- Modify upstream pages/loaders enumerated in Phase 1 for the seven enhanced callers
- Create/Delete: only if Phase 1 manifest identifies a real resource adapter boundary

## Implementation Steps

1. Add failing query round-trip and multi-page order tests for default/asc/desc.
2. Add stable duplicate-value fixture and verify secondary order.
3. Align effective sortable predicate and active/default indicator.
4. Migrate URL state to shared cycle without breaking existing query links.
5. Audit each displayed select/status/FK/computed column; implement explicit mapping or query.
6. Wire eight callers and verify every manifest row.
7. Run focused unit/integration tests and one Playwright representative.

## Todo List

- [ ] 7/7 enhanced callers verified
- [ ] 1/1 legacy caller verified
- [ ] No current-page sort
- [ ] Default indicator matches server order
- [ ] Stable tie-breaker present
- [ ] Display label ordering proven

## Success Criteria

- [ ] URL reload/bookmark round-trips all three states
- [ ] Sort change resets page 1
- [ ] Duplicate values do not drift across pages
- [ ] Explicit `sortable:false` remains non-clickable
- [ ] Tests, typecheck and lint pass for touched scope

## Risk Assessment

Custom server label sort can tempt raw SQL proliferation. Prefer verified Prisma relation/field; when impossible, isolate parameterized query per resource and test count/pagination parity. Any schema change is a separate approval gate.

## Security Considerations

Reject unallowlisted sort columns/directions. Parameterize values, hardcode/allowlist identifiers, preserve existing ACL predicates and count/find transaction scope.

## Next Steps

Phase 5 may reuse the server adapter pattern only after this phase passes multi-page tests.
