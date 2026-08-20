---
phase: 6
title: "Grouped và tree tables"
status: completed
priority: P1
effort: 12h
dependencies: [2, 5]
---

# Phase 6: Grouped và tree tables

## Context Links

- [Parent plan](./plan.md)
- [Approved grouped semantics](./reports/brainstorm-summary.md)
- Representative: `app/(app)/du-an/[id]/du-toan/du-toan-client.tsx`
- Representative: `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx`

## Overview

Sort leaf rows trong từng group/tree node, giữ group order, collapse state, subtotal, grand total và footer. Không flatten cấu trúc để sort toàn cục.

## Key Insights

- Dự toán có hierarchy HM → section → rows cùng subtotal và `tfoot`.
- Cân đối vật tư có nhiều table occurrences, expandable groups và popup dùng `slice(0,50)`.
- Báo cáo ledger/SL-DT/state obligations có group/category subtotal riêng.

## Requirements

- Approved semantics: sort leaf siblings only; group/parent/subtotal/footer remain fixed.
- Default restore exact leaf order within every group.
- Collapse/expand keys and selection/edit identity unaffected.
- Sort source before any display slice; không sort riêng `slice(0,50)`.
- Computed leaf columns sort numeric/date semantic raw values.

## Architecture

Group adapter nhận immutable tree/group model và leaf accessor, trả structure mới chỉ thay leaf arrays. Không đưa synthetic group/subtotal rows vào comparator. Mỗi hierarchy shape có adapter nhỏ tại domain boundary thay vì generic recursive engine quá rộng.

## Related Code Files

- Modify confirmed grouped occurrences from manifest, including:
  - `app/(app)/du-an/[id]/{du-toan,du-toan-dieu-chinh,dinh-muc}/**-client.tsx`
  - `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx`
  - `components/ledger/{monthly-report,detail-report-table}.tsx`
  - `components/tai-chinh/obligation-report-table.tsx`
  - `app/(app)/sl-dt/{bao-cao-sl,bao-cao-dt,chi-tieu}/**/*.tsx` paths normalized by manifest
- Create domain-local group sort adapters only where shapes differ materially
- Modify tests colocated with domain helpers/components
- Delete: none

## Implementation Steps

1. Add characterization fixtures capturing group IDs, leaf IDs, collapse keys, subtotals and grand totals.
2. Write failing tests for asc/desc/default within group and unchanged aggregate structure.
3. Implement smallest adapter per verified hierarchy shape.
4. Wire shared header only to leaf data columns; group header remains non-sortable.
5. For sliced nested detail, sort complete source then slice.
6. Verify edit/reassign/cache invalidation behavior on sorted views.
7. Update manifest PASS per occurrence.

## Todo List

- [ ] Group order invariant tested
- [ ] Leaf order cycle tested in every hierarchy shape
- [ ] Subtotal/grand total invariant tested
- [x] Collapse/expand state preserved
- [x] Slice occurs after sort
- [x] All grouped occurrences reconciled

## Success Criteria

- [ ] Group count, IDs and aggregate values unchanged across three states
- [x] Default leaf-ID sequences match original source per group
- [x] No subtotal/footer enters comparator
- [x] User interactions remain bound to stable IDs
- [ ] Focused unit/component/UI tests pass

## Risk Assessment

One generic recursive adapter may hide domain differences. Prefer explicit adapters and invariant fixtures. Large client groups remain existing data volume; no new load/benchmark tests.

## Security Considerations

Sorting must not move rows across ACL/resource groups or load hidden group members. Preserve server-filtered input boundaries.

## Next Steps

Phase 7 handles matrix axes and nested dynamic headers after group invariants are stable.
