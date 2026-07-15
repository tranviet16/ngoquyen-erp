---
phase: 5
title: Cleanup
status: completed
priority: P2
effort: 2h
dependencies:
  - 4
---

# Phase 5: Cleanup

## Overview

Final verification + docs update. Remove dead code (unused `mapKindToX` exports nếu có), tsc + lint + vitest clean, update journal nếu có gì surprising.

## Requirements

- Functional:
  - 0 unused imports / dead code liên quan refactor.
  - Update `docs/codebase-summary.md` nếu architecture change đáng kể (single source of truth pattern).
  - Update `docs/journals/` với 1 entry tóm tắt: gì surprising, decisions taken.
- Non-functional:
  - `npx tsc --noEmit && npm run lint && npx vitest run` xanh.
  - 0 console warning về duplicate spec hoặc missing FK include.

## Implementation Steps

1. Grep find dead code:
   - `grep -rn "SPEC.sortable\s*=" lib/` — verify 7 master-data đều dùng `deriveResourceSpec` thay vì assign tay.
   - `grep -rn "filterable: {" lib/master-data` — verify không còn hardcoded.
2. `npx tsc --noEmit`. Fix errors nếu có.
3. `npm run lint`. Fix warnings nếu có.
4. `npx vitest run`. Verify ≥40 cases Phase 1 + tests cũ Phase 2 (excel-feel-tables) pass.
5. Update `docs/codebase-summary.md` section "Table architecture":
   - Single source: ColumnDef → deriveResourceSpec → ResourceSpec.
   - FK convention: `fk: { relation, sortField, options }`.
   - Default-on: kind set → sort+filter auto.
6. Write journal `docs/journals/<date>-full-column-sort-filter.md`:
   - Surprises (vd: FK relation name mismatches, eager-join missing, dropdown UX limits).
   - Decisions taken (vd: cap 200 options, in-memory FK only cho ledger).
7. Commit + (optional) `/ck:journal` invoke.

## Success Criteria

- [ ] tsc clean.
- [ ] lint clean.
- [ ] vitest run clean.
- [ ] 0 dead code / unused exports.
- [ ] docs/codebase-summary.md cập nhật.
- [ ] Journal entry committed.

## Risk Assessment

- **Dead code grep miss**: legacy SPEC config có thể còn ở nơi không tìm được. Code review pass cuối.
- **Tests Phase 2 (excel-feel-tables) regression**: nếu `buildOrderBy` thay đổi signature, 32 tests cũ break. Phase 1 đã handle backward compat — verify lại.
- **Journal scope creep**: giữ ≤200 dòng, focus surprises + decisions, không liệt kê implementation chi tiết.
