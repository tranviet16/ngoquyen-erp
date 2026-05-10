# Plan A Delivery: ACL Refactor Surprises

**Date**: 2026-05-10 17:30
**Severity**: Medium
**Component**: ACL, Audit Middleware, Migrations
**Status**: Resolved (Plan A shipped; Plans B & C unblocked)

## What Happened

Plan A "Vận hành ACL refactor" (5 phases, 7 commits: b202d12 → 55dbae5) shipped today with all validation passing: 40/40 vitest, 32/32 golden ACL fixtures, 0/83 unprotected routes, next build clean. But the delivery exposed three subtle issues the initial implementation had glossed over—caught during code review and testing, not production.

## The Brutal Truth

The annoying part is that none of these issues caused test failures. They were latent design gaps that only surfaced when we looked at how new tables actually worked with existing patterns. We got lucky the code reviewer caught the semantic drift in `scope:"any"`—that could've silently returned wrong auth decisions in production. The migration ordering problem isn't ours originally, but we inherited it and had to work around it twice.

## Technical Details

### 1. Composite-PK Audit Middleware Gap

**Problem**: Existing Prisma `$extends` audit middleware in `lib/prisma.ts` calls `findUnique({ where: { id } })` to fetch before-state. The new ACL tables (ModulePermission, ProjectPermission, ProjectGrantAll) use composite PKs without a single `id` column. Middleware would silently capture `null`.

**Resolution**: Every server action wraps mutations in `bypassAudit()` and explicitly calls `writeAuditLog()` per change. See `app/(app)/admin/permissions/actions.ts`.

**Lesson**: Any future table with composite PK needs this pattern, OR the middleware needs extending to handle composite PK lookups. Document it in code standards.

### 2. Prisma Shadow DB Ordering Bug (Pre-existing)

**Problem**: Migration `20260507093220_add_task_collab` references `tasks` before `20260507130000_add_tasks_and_notifications` creates it. Breaks `prisma migrate dev` shadow-DB validation.

**Workaround Used**: For new migrations `20260510130000_add_module_and_project_permissions` and `20260510140000_backfill_notification_urls`, wrote migration SQL manually, applied via `prisma db execute`, then marked with `prisma migrate resolve --applied <name>`. Shadow DB stays broken; future migrations need the same approach.

**Lesson**: Root cause (migration ordering) needs a separate fix. Until then, new migrations using this pattern must follow the workaround.

### 3. scope:"any" Semantic Drift (Code Review Catch)

**Problem**: `lib/acl/effective.ts` comment claimed scope:"any" means "Trục 1 + module-level OK; caller filters elsewhere" but implementation returned false for dept/project axes. Tests covered happy path, not the boundary case.

**Fix**: Returned true after Trục 1 passes regardless of axis. Semantics now match the documented intention.

**Lesson**: Ambiguous abstractions bite when test cases cover obvious scenarios but skip the edge the comment promised. Next time, write the edge-case test before merging—or make the semantics explicit in code instead of comments.

## What We Tried

- Initial implementation passed all new ACL tests (composite PKs just worked in the test suite because we weren't calling the middleware)
- Migration workaround applied without rebuilding the shadow DB root cause
- scope:"any" tests passed because they exercised Trục 1 but never checked dept/project axis fallback

## Root Cause Analysis

1. **Audit middleware design** assumes all tables have a single `id` PK—a valid assumption when written, but incompatible with schema evolution toward composite PKs
2. **Migration ordering** was already broken before Plan A; we inherited it and chose the workaround path rather than fixing upstream (reasonable for delivery pressure, but deferred the pain)
3. **Semantic ambiguity**: Comments ≠ tests. The developer knew the intention but didn't codify it in assertions

## Lessons Learned

- Document PK strategy (single vs. composite) in code standards; enforce it at schema review
- Shadow DB ordering bugs block iteration—fix them early, not around them
- Comments describing behavior boundary conditions must have paired tests; if the test doesn't exist, the boundary is a liability
- Composite-PK tables need explicit audit logging; don't rely on generic middleware

## Next Steps

1. **Fix shadow DB ordering** in separate commit—unblock future `prisma migrate dev` workflows (owner: lead; timeline: before Plan B merge)
2. **Extend audit middleware** OR document composite-PK audit pattern in `docs/code-standards.md` (owner: doc owner; timeline: within 1 week)
3. **Add edge-case tests** for scope boundary conditions to prevent semantic drift (owner: test owner; timeline: next test cycle)

---

**Status**: All Plan A deliverables merged to main. Plans B & C unblocked. Audit and migration patterns documented inline; next phase can reference them.
