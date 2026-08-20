---
phase: 5
title: "Raw flat tables"
status: completed
priority: P1
effort: 10h
dependencies: [2, 3]
---

# Phase 5: Raw flat tables

## Context Links

- [Parent plan](./plan.md)
- [Coverage manifest phase](./phase-01-coverage-manifest-blocker.md)
- [Inventory raw tables](./research/table-inventory.md)
- [DataTable server pattern](./phase-03-datatable-server-v-legacy.md)

## Overview

Áp dụng shared header/state cho các bảng HTML phẳng. Full-list sort client; server-paginated sort qua loader/query. Không migrate renderer nếu không cần.

## Key Insights

- Raw inventory gồm cả full-list, report và server pagination; phase này chỉ nhận các bảng được manifest phân loại flat.
- `ExpenseFilterClient` và coordination-form list có pagination, không được sort page slice.
- Nhiều totals/cards nằm ngoài `<tbody>` và phải giữ cố định.

## Requirements

- Mỗi table occurrence dùng đúng strategy đã xác minh.
- Full-list default restore source order; display accessor explicit.
- Server list dùng allowlisted URL sort, reset page 1, stable tie-breaker và count parity.
- Action/STT/selection/footer không có sort affordance.
- Table mobile wrapper và layout hiện tại không bị thay đổi.

## Architecture

HTML flat client dùng hook mỏng quanh shared state + immutable stable sort và shared header button. HTML flat server dùng cùng query semantics DataTable nhưng adapter ở page/service hiện hữu; không bắt buộc chuyển component sang DataTable.

## Related Code Files

- Modify full-list candidates after Phase 1 confirmation: `components/ledger/opening-balance-client.tsx`; `components/tai-chinh/{cash-account-client,pr-client,loan-due-list-card}.tsx`; `components/van-hanh/member-table.tsx`; payment round lists/details; flat vat-tu-ncc/admin tables
- Modify server candidates: `components/tai-chinh/expense-filter-client.tsx`; `app/(app)/van-hanh/phieu-phoi-hop/list-client.tsx`; exact upstream page/service paths from manifest
- Modify shared HTML hook/header created in Phase 2
- Create/Delete: no renderer migrations; helper file only if Phase 2 API cannot remain focused

## Implementation Steps

1. Add failing local-hook tests for default restore, display values, null-last and stable equal rows.
2. Add server multi-page tests for expense and coordination lists before handler changes.
3. Implement client flat adapter and wire confirmed full-list occurrences.
4. Implement parameter-whitelisted server adapters and propagate query state through page/service.
5. Verify totals/footer/action columns and mobile overflow wrappers.
6. Mark each manifest occurrence PASS only after UI and data-source assertion.

## Todo List

- [ ] Every flat raw occurrence assigned client/server
- [ ] No page-slice sort
- [ ] Display sort accessors verified
- [ ] Totals/footer fixed
- [ ] Mobile table wrapping preserved
- [ ] Manifest updated per occurrence

## Success Criteria

- [ ] Full-list tables restore exact source row IDs at default
- [ ] Paginated tables order consistently across at least two pages
- [ ] URL reload and page reset work for server tables
- [ ] Non-data headers remain non-clickable
- [ ] Focused unit/integration/UI tests pass

## Risk Assessment

Raw tables may include hidden grouping or signed document order. Reclassify to Phase 6/7 or explicit exclusion when discovered; do not force flat adapter.

## Security Considerations

Server sort keys/directions stay allowlisted and ACL filters remain in the same query scope. Do not expose hidden fields through query parameters or error messages.

## Next Steps

Phase 6 uses the same header/core but owns group-preserving reorder logic.
