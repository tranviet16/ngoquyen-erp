# Excel-Feel Tables — Hybrid Evolution Complete

**Date**: 2026-05-20 23:59
**Severity**: Medium
**Component**: DataTable + DataGrid systems, table infrastructure
**Status**: Resolved (committed as `ec809ae`)

## What Happened

Delivered 5-phase table infrastructure upgrade in a single session. Both table systems (shadcn DataTable for master-data, glide-data-grid for ledger) now support column sort, filter, and inline edit. 55 files modified, 80 unit tests passing. No breaking changes to existing APIs.

## The Brutal Truth

This was textbook: scope met, code-review-caught bugs prevented a messy follow-up sprint, and the hybrid approach (two systems, shared infrastructure) proved to be the right bet. We didn't unify the libraries because we didn't need to. The pay-off: reused `lib/table/types.ts` FilterValue types everywhere with zero duplication.

The thing that stung was discovering, mid-Phase-3, that the plan's field-list assumptions were wrong. Supplier entity has no `email`, `note`, or `isActive`. Entity has only `name` and `note`. The spec was aspirational, not reality-checked against schema. Implementer caught it early and adapted. Could have avoided that if plan had opened Prisma schema first.

## Technical Details

### Key Non-Obvious Decisions

1. **Whitelist gate before Zod** — All 7 PATCH actions validate like this:
   ```
   if (!ALLOWED_FIELDS.includes(field)) return error
   schema.parse(row)  // then validate known fields
   ```
   Defense in depth. Reject unknowns immediately, then Zod validates the rest. Code reviewer flagged it as correct; prevents future drift if Zod schema and whitelist diverge.

2. **Filtered view vs full rows separation** — Edits/adds/deletes operate on `rows` (by `row.id`), only display uses derived `view`. Avoids the trap of editing-by-index in filtered/sorted data. State machine is clean.

3. **data-grid.tsx hit 229 lines** (limit: 200). No clean split possible without artificial component extraction. Documented as accepted trade-off. Future refactor: if it grows >300, extract sort/filter logic into hooks.

4. **Spec `.ts` files rejected JSX** — Turbopack refused JSX in `.ts` extensions. Solution: keep specs pure config in `.ts`, push JSX render into `*-client.tsx`. Accidental DRY win.

### Code Review Bugs (Caught Post-Implementation)

1. **EditableCell missing try/catch** — Silent edit failures with no toast. User would hit Enter and see no feedback.
2. **Enter + blur double-commit race** — Could send two PATCH requests for one edit.
3. **String sort lexicographic** — `"100"` < `"20"` (branch order bug in compareValues). Would break numeric string sorts.

All three fixed in <30 min post-review. None would have shipped without mandatory code-review step.

## What We Tried

1. Unified table library (DataTable + glide-data-grid → single lib) — rejected early as overkill.
2. Storing view state in DB (sort/filter presets) — rejected; persisted via URL query params only (simpler, stateless).
3. Bulk edit operations — scoped out to keep Phase scope manageable.

## Root Cause Analysis

**Why plan field-lists diverged from reality:** Spec was written from feature perspective, not implementation perspective. The person writing the plan didn't cross-check against `schema.prisma`. Implementer caught it because they actually read the models.

**Why code review caught 3 bugs:** Mandatory review of "working" code (pre-merge) caught logic edge cases. No shortcut taken to "it works locally, ship it."

## Lessons Learned

1. **Hybrid Evolution over unification** — Two systems + shared types cheaper than forcing one. Real-world legacy systems often require this trade-off.

2. **Schema-first plans** — Always open Prisma/database schema BEFORE writing field-lists in the spec. Saves plan-to-code mismatch.

3. **Whitelist + Zod** — Pattern works well for API safety. Keep both: reject unknowns fast, then validate structure.

4. **Filtered state ops are tricky** — Editing by index in a filtered dataset is a footgun. State should always track by ID, display uses filtered view.

5. **Code review is non-negotiable** — Three bugs shipped without it. None were "obvious" during dev, all were visible under review eyes.

## Next Steps

1. Monitor for edge cases in production (date/decimal range filters, bulk edit demand).
2. If data-grid.tsx grows >300 lines, refactor sort/filter into custom hooks.
3. Consider adding sort/filter presets in Settings (low priority, not in this scope).
4. Update Prisma schema docs to include field metadata (which fields are inline-editable, which require forms).

**Owns**: Product team (backlog), Engineering (monitoring).
**Timeline**: Immediate for monitoring; refactor TBD.
