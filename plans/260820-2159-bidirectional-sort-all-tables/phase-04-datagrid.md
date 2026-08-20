---
phase: 4
title: "DataGrid"
status: completed
priority: P1
effort: 12h
dependencies: [2]
---

# Phase 4: DataGrid

## Context Links

- [Parent plan](./plan.md)
- [DataGrid inventory](./research/table-inventory.md)
- Existing: `components/data-grid/data-grid.tsx`, `use-grid-view.ts`, `apply-filter-sort.ts`, `types.ts`

## Overview

Migrate 24 production DataGrid instances to explicit, display-aware three-state sort while preserving editing, paste, selection and business source order. Một demo instance chỉ dùng làm manual fixture và không tính production acceptance.

## Key Insights

- Engine đã sort client-side nhưng chỉ cột `sortable` nhận click.
- Select label resolution đã tồn tại; null desc đang sai.
- Some grid order fields (`sortOrder`, schedule/workflow order) là view order, không phải persisted reorder action.
- 25 instances phải có decision explicit; không bật global default mù quáng.

## Requirements

- Phase 1 xác nhận mỗi caller nhận full row set; server-limited caller chuyển strategy trước khi bật.
- Data columns opt-in/opt-out explicit theo manifest.
- Accessor trả displayed semantic value; computed columns có accessor thật.
- Default restore immutable input order.
- Editing/delete/paste/selection tiếp tục bind stable row ID sau sort.

## Architecture

`useGridView` dùng shared state helper; `applySort` dùng semantic comparator/accessor. Glide canvas header giữ renderer riêng nhưng title/icon phản ánh default/asc/desc. Mutation layer tiếp tục lookup row bằng ID, không view index.

## Related Code Files

- Modify: `components/data-grid/{data-grid,use-grid-view,apply-filter-sort,types}.ts*` and focused tests
- Modify 24 production callers enumerated in `research/table-inventory.md`: ledger/ledger-grid, vat-tu-ncc, tai-chinh grids, du-an project grids, sl-dt catalogs/month tabs, expense classification
- Inspect only: `app/(app)/__demo/data-grid/page.tsx` as manual fixture; not production acceptance
- Create/Delete: none unless Phase 2 core file requires a DataGrid adapter module

## Implementation Steps

1. Add failing engine tests for cycle, null-last desc, label sort, computed accessor, stable equal values and default source restore.
2. Add mutation identity tests after sort for edit/delete/selection; include paste if current handler maps view rows.
3. Migrate `useGridView` and `applySort` to shared contract.
4. Audit and annotate every column array; do not persist view sort into `sortOrder`.
5. Verify totals/summary outside grid remain fixed.
6. Manual smoke representative CRUD, read-only, select-heavy and monthly input grids.

## Todo List

- [ ] 24/24 production instances have manifest result; 1 demo recorded separately
- [ ] Full-set assumption proven for each
- [ ] Display accessor exists for select/FK/computed columns
- [ ] Null-last fixed for desc
- [ ] Row identity tests pass
- [ ] Default restores exact source IDs

## Success Criteria

- [ ] All eligible DataGrid headers run three-state cycle
- [ ] Equal values sort stably without mutating props
- [ ] Edit/delete/paste/selection target correct IDs after sort
- [ ] Summary/totals and persisted business order unchanged
- [ ] Focused tests, typecheck and lint pass

## Risk Assessment

Grid callers may silently receive truncated server data. Phase 1 makes this a blocker. Avoid table-level global default-on because schedule/catalog order may encode business semantics.

## Security Considerations

Client sort changes presentation only; do not weaken server action ACL or validation. Never use visible row index as mutation authority.

## Next Steps

Phase 7 consumes the same matrix/row comparator only after flat DataGrid behavior is stable.
