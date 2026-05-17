# Payment Module (Thanh Toán) Delivered with Recurring Pitfalls Exposed

**Date**: 2026-05-14 10:49  
**Severity**: Medium  
**Component**: `thanh-toan` (Payment) module + Prisma migrations  
**Status**: Resolved  
**Commit**: 1fbaea0 — `feat(thanh-toan): payment round module with per-item approve + monthly aggregate export`

## What Happened

Completed full payment module delivery: 5 phases, all green (TypeScript clean, 40/40 ACL tests pass). Implemented schema, service layer with RBAC, two UI views (`ke-hoach` detail approval workflow, `tong-hop` pivot + Excel export), and navigation. Encountered 5 technical surprises that exposed systemic patterns.

## The Brutal Truth

This wasn't a straightforward feature delivery—it exposed tooling debt and undocumented conventions that should have been surfaced earlier. The Prisma shadow-DB failure on *second* occurrence means we're not fixing root cause, just patching around it each time. Session model ignorance cost refactoring time. Framework-specific UI conventions (base-ui vs Radix) keep tripping feature work. The ACL checklist grew to 4 files with zero automation. Every new module needs the same ritual—this is low-hanging refactoring debt, not a one-off tax.

## Technical Details

**Prisma shadow-DB migration ordering failure (2nd occurrence)**  
`prisma migrate dev` failed applying earlier migration `20260507093220_add_task_collab` to shadow DB during payment schema work. Error: constraint/foreign-key ordering issue on the accumulated schema. Workaround: hand-wrote SQL in `prisma/migrations/20260514153000_payment_module/migration.sql`, applied via `npx prisma db execute --file ...` + `npx prisma migrate resolve --applied --rolled-back 20250507093220`. This is **not a fluke**—it happened once before. Pattern: shadow DB is fragile with multi-migration dependencies; once one migration order breaks, downstream migrations cascade.

**`isDirector` missing from better-auth session**  
Plan assumed `isDirector`/`isLeader` flags in `session.user`. Reality: only `role` declared in `additionalFields` in `lib/auth.ts`. Required DB lookups inside:
- `lib/payment/payment-service.ts` `getActor()` function: `const user = await prisma.user.findUnique(..., { select: { isDirector: true } })`
- `app/(app)/thanh-toan/ke-hoach/[id]/page.tsx`: `const actor = await getActor(session.user.id)`

Session model is authoritative for baseline auth but incomplete for business logic. Must document: custom flags require explicit DB fetch.

**base-ui `DialogTrigger` uses `render=` not `asChild`**  
Attempted Radix pattern `asChild` failed. base-ui convention found in `components/master-data/crud-dialog.tsx`:
```tsx
<DialogTrigger render={<Button variant="secondary">Phê duyệt</Button>} />
```
Not `<DialogTrigger asChild><Button>...</Button></DialogTrigger>`. Small thing; cost 15 minutes of trial-and-error.

**ACL fallback set required for menu visibility**  
New `ModuleKey` entries added to `lib/acl/modules.ts` were insufficient. Users with role `canbo_vt` couldn't see menu until keys were added to `CANBO_VT_EDIT_MODULES` set in `lib/acl/role-defaults.ts`. Root cause: sidebar filters on role defaults, not just module existence. The checklist now stands at **4 files per new module**:
1. `lib/acl/modules.ts` — declare `ModuleKey`
2. `lib/acl/module-labels.ts` — add VN label
3. `lib/acl/role-defaults.ts` — add to role `EDIT_MODULES` set
4. `components/layout/app-sidebar.tsx` + `breadcrumb.tsx` — nav item + label

Zero automation. Needed a task checklist from day one.

**Decimal type leakage from Prisma to client**  
Prisma models have `Decimal` fields (e.g., `tongTienDuyet`). Client props expect `string | number`. Solution: defined `Decimalish = string | number | { toString(): string }` on client interfaces; format helper takes `unknown` and coerces via `Number(n as never)`. Works but is fragile. Recurring annoyance suggests this should be handled at service boundary (map Decimals to numbers once, not on every client component).

## What We Tried

- Prisma shadow-DB: ran `prisma migrate reset`, `prisma migrate dev --name`, standard approaches all failed. Manual SQL + migration resolve worked.
- Session flags: checked `session.user` directly (failed), read auth.ts to find `additionalFields` limitation, added DB lookup.
- Dialog: tried `asChild` (failed), searched components/ for DialogTrigger usage, found base-ui convention.
- Module visibility: added keys to modules.ts, tested, nothing appeared; discovered role-defaults pattern via ACL test suite.
- Decimals: tried type assertion, tried JSON serialization, settled on coercion helper.

## Root Cause Analysis

1. **Prisma shadow-DB is fragile with migration ordering**. Appears to be a scaling issue: once you accumulate migrations with complex dependencies, the shadow DB recreates from all migrations in order, and if any intermediate migration is order-sensitive, it breaks. Not a one-off bug—a recurring failure mode that needs either a tooling fix (Prisma) or a process change (flatter migration strategy).

2. **Session model documentation gap**. No written record of what `session.user` contains vs. what requires DB fetch. Team knowledge only. Should be in CLAUDE.md or code comments in `lib/auth.ts`.

3. **base-ui conventions not centralized**. Component library choice (base-ui vs Radix) is implicit. New features guess wrong, waste time. Need a one-pager linking to example usage.

4. **ACL module setup is manual ritual**. No guards, no warnings. Add a key to modules.ts, skip role-defaults.ts, feature is invisible. Should be caught by schema validation or a checklist in task templates.

5. **Decimal coercion at component level is lazy**. Should normalize at service boundary (before sending to client) so client types are clean.

## Lessons Learned

- **Prisma migration ordering is a recurring blocker**: On next occurrence, before manual workarounds, try `prisma migrate status` to see which migration is stuck and `prisma db execute` on the problematic migration in isolation. Consider documenting a playbook in `docs/`.
- **Session and DB authorization are separate concerns**: Document which flags live where. Write a helper that loads user attributes once and returns an `Actor` object with all flags preloaded.
- **New UI framework conventions need a living reference**: Link base-ui examples in comments next to Radix-like patterns so devs don't re-invent wrong solutions.
- **ACL module setup should be validated or templated**: Add a test that checks: if `ModuleKey` exists, it must appear in at least one role's `EDIT_MODULES` set. Or create a checklist in task descriptions for new modules.
- **Normalize Decimal at service layer**: Map Prisma Decimals to numbers in service methods before returning to client. One place to do the coercion, clean types downstream.

## Next Steps

1. **Document session model** in `lib/auth.ts` or CLAUDE.md: what's in `session.user`, what requires DB fetch, example of `getActor()` pattern.
2. **Create ACL module checklist task template** linking to the 4-file pattern; add to project docs.
3. **Validate ACL completeness**: Write test that fails if a `ModuleKey` is unused (not in any role's `EDIT_MODULES`).
4. **Capture Prisma migration playbook**: If shadow-DB fails again, use documented steps instead of trial-and-error.
5. **Consolidate base-ui conventions**: Add a section to CLAUDE.md or code-standards.md with DialogTrigger, Modal, and other base-ui patterns with working examples.

**Owner**: Next feature lead hitting these same patterns should reference this entry and use the checklist/docs updates above. This shouldn't take time on the next payment or reporting module.
