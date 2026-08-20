---
phase: 7
title: "Matrix và nested tables"
status: completed
priority: P1
effort: 10h
dependencies: [2, 4, 6]
---

# Phase 7: Matrix và nested tables

## Context Links

- [Parent plan](./plan.md)
- [Approved matrix semantics](./reports/brainstorm-summary.md)
- Representative: `components/ledger/debt-matrix.tsx`
- Representative: `components/tai-chinh/obligation-period-matrix-client.tsx`
- Nested inventory: `research/table-inventory.md`

## Overview

Thêm row sort theo leaf metric cho matrix/pivot và xử lý từng nested table occurrence độc lập. Không reorder dynamic entity/project column groups.

## Key Insights

- Debt matrix có header ba tầng, entity columns động và totals footer.
- Obligation period matrix là Glide grid nhưng có semantics opening/increase/decrease/closing.
- `can-doi-vat-tu-client.tsx`, permission/admin screens và consistency checks có nhiều table occurrences trong cùng file.

## Requirements

- Chỉ leaf metric header có sort affordance.
- Click leaf metric sort row entities/items theo displayed semantic value.
- Dynamic column group order, `colSpan`, header alignment và footer totals bất biến.
- Default restore exact source row IDs.
- Nested tables giữ state độc lập; click một bảng không sort bảng khác.

## Architecture

Matrix adapter xác định row dimension, leaf column accessor và immutable source order. Column axis là cấu trúc presentation, không tham gia sort. Nested tables có state scoped theo occurrence/key, không dùng singleton/global state.

## Related Code Files

- Modify: `components/ledger/debt-matrix.tsx`
- Modify: `components/tai-chinh/obligation-period-matrix-client.tsx`
- Modify confirmed matrix/pivot occurrences: payment summary, permission matrices, SLA stats, liquidity report, project debt and vat-tu-ncc reconciliation/snapshot tables as classified by manifest
- Modify each nested occurrence in `can-doi-vat-tu-client.tsx`, `kiem-tra-khop-client.tsx`, `department-client.tsx` independently
- Create: focused matrix row adapter(s) only when shared row semantics match
- Delete: none

## Implementation Steps

1. Characterize header tree, row IDs, column group order, totals and colSpan before behavior changes.
2. Write failing row-sort tests for numeric, text label, null and equal leaf metrics.
3. Implement matrix row adapter using shared comparator/state.
4. Add leaf-only header controls without changing group header DOM/canvas structure.
5. Scope nested table state independently and test cross-table isolation.
6. Verify default restores row IDs byte-for-byte and headers remain aligned.
7. Update manifest per occurrence.

## Todo List

- [ ] Leaf headers identified explicitly
- [ ] Dynamic column order invariant tested
- [ ] Footer totals fixed
- [ ] Nested states isolated
- [ ] Default row IDs restored exactly
- [ ] ColSpan/header alignment verified

## Success Criteria

- [ ] Matrix rows sort by selected leaf metric only
- [ ] Group headers do not advertise sort
- [ ] Dynamic entity/project columns never reorder
- [ ] Multiple nested tables sort independently
- [ ] Unit/component/Playwright representative tests pass

## Risk Assessment

Matrix DOM/canvas headers can become misaligned if controls change width/colSpan. Use existing layout primitives and snapshot structural attributes, not brittle full visual snapshots.

## Security Considerations

Sort only rows already authorized and loaded. Signed snapshots retain original legal/document order unless Phase 1 explicitly classifies a derived view as sortable; do not mutate persisted snapshot JSON.

## Next Steps

Phase 8 runs fresh inventory and closes every manifest row.
