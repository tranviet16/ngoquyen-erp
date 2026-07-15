# Single Source of Truth for Sort/Filter — Schema Reality Check

**Date:** 2026-05-20 23:30
**Severity:** Medium
**Component:** Data table infrastructure (sort, filter, column metadata)
**Status:** Resolved

## What Happened

Shipped plan `260520-full-column-sort-filter` (commit `8b9760c`): refactored ColumnDef + ResourceSpec into a single derive-spec helper to eliminate duplicate sort/filter configuration. **5 phases, 478 tests passing, tsc clean, zero critical review issues.** But implementation exposed two critical schema assumptions that failed—twice, identically, in two independent phases.

## The Brutal Truth

This stings. The entire FK column design path (`kind: "fk"`, `fk: { relation, sortField, options }`) was built on false assumptions about the schema. Both Phase 2 and Phase 3 implementers independently discovered that columns we'd name as "ownerInvestor", "lender", and all ledger "entityId"/"partyId"/"projectId"/"itemId" aren't Prisma `@relation` fields—they're plain `String`/`Int` columns. Zero FK relations in the schema.

Result: **1.5 hours of infrastructure wasted**, FK option-loading code that never runs, and a type-safe but completely unused config path sitting in production. The real fix was simpler: `kind: "text"` for text FKs, `kind: "select"` for ID→name lookups. We built a Ferrari when a bicycle was needed.

The frustrating part is that **schema-first verification never happened**. Both implementers read `prisma/schema.prisma` and immediately flagged it, but that check should have been done in planning phase, not discovery phase.

## Technical Details

**Phase 2 finding (master-data specs):**
- Plan assumed: `Project.ownerInvestor: Project @relation(...)` → Entity
- Reality: `ownerInvestor: String?` (plain text field)
- Similar for `DuAn.ownerInvestor` and `LoanContract.lenderName`

**Phase 3 finding (ledger grids):**
- Plan assumed: `LedgerTransaction.entity: Entity @relation(...)` 
- Reality: `entityId: Int` (bare FK column, no loaded relation object)
- Same for `partyId`, `projectId`, `itemId` — all bare integers, no relations

Both phases confirmed via manual inspection of `prisma/schema.prisma` lines 619–676.

**Implementation fallback:**
```ts
// Phase 2: handled via kind: "text" (projects, du-an, loans)
{ key: "ownerInvestor", header: "Chủ đầu tư", kind: "text" }  // was "fk"

// Phase 3: select columns resolve names via getCellSortValue()
// Not fk config — ledger rows carry no relation objects anyway
getCellSortValue(row, col): col.kind === "select" 
  ? col.options?.find(o => o.id === row[col.key])?.name 
  : row[col.key]
```

## What We Tried

1. **FK type extension (complete)** — `fk: { relation, sortField, options? }` built as designed, tests pass. Code review: 9.5/10, zero critical issues. **The code is correct; the assumptions were wrong.**

2. **Default-on convention (works)** — `deriveResourceSpec` correctly derives sortable/filterable maps from `kind` field. 7 master-data specs migrated, 2 ledger grids updated. **No issues here.**

3. **Nested orderBy with dot notation (works)** — `buildOrderBy("entity.name:asc")` → `{ entity: { name: "asc" } }` working as specified. **But never needed** because the FK relations don't exist.

## Root Cause Analysis

**Why the FK assumption lived so long:**
1. **Naming confusion.** Columns called "ownerInvestor", "lender", "entityId" screamed "FK" but schema just stores the ID/name directly. We read semantic names, not the actual schema.
2. **No schema audit in brainstorm phase.** Brainstorm validated user requirements, coverage gaps, and approach—but didn't verify that FK relations actually exist. Classic cart-before-horse.
3. **Implementation discovery fixed it too late.** By Phase 2, we had 4 hours of planned work already committed. Schema validation should be gate 1, not gate 5.

## Lessons Learned

1. **Schema-first, always.** Before assuming FK relations exist, grep `prisma/schema.prisma` for `@relation`. The 2-minute check prevents hours of wasted infrastructure.

2. **Implementers shouldn't rediscover assumptions.** Flag schema dependencies in the brainstorm report. When we say "FK column", the planning agent should verify it's a real Prisma relation, not a bare integer column.

3. **Fallback patterns are simpler.** The actual implementations (text sort for plain columns, select option name resolution for ID→name) are cleaner than the FK machinery. Sometimes designing for the happy path obscures the simpler solution.

4. **Type-safety ≠ correctness.** The `fk` config is type-safe and can be validated at build time, but **building the wrong thing safely is still building the wrong thing.** Correctness requires validation against the actual schema, not just the design doc.

## Next Steps

- [x] Accept FK infrastructure as "future-proof"—type-safe and ready if schema changes (low effort to leave as-is)
- [ ] Add schema audit checklist to planning phase: FK relations, computed columns, query shape (who owns?)
- [ ] Document in `/docs/code-standards.md` that `deriveResourceSpec(columns, base, override?)` is the pattern for new data tables, and spec derivation must validate against actual schema
- [ ] Brainstorm template: include "schema dependencies" field, auto-rejected if not verified in git

**Status:** DONE
