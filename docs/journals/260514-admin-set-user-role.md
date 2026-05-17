# Admin Set-User-Role Inline Editing

**Date**: 2026-05-14 09:45
**Severity**: Low
**Component**: Admin Panel, User Management
**Status**: Resolved

## What Happened

Shipped inline edit feature for user roles, flags, and department assignments. Commit `96c0c9f` touches 3 files: new `updateUserAttributes` service method, thin action wrapper, and client-side editor with optimistic resync logic.

## Technical Wins

- **Single service method**: `updateUserAttributes(userId, patch)` handles role, flags, and department in one shot — no repeated `setGrant`/`removeGrant` calls for multi-field edits.
- **Action wrapper**: Stays thin (`try/catch`, delegate to service) — mirrors existing pattern in `setGrant`.
- **Dirty tracking**: Separate from resync baseline. Row tracks local edits with live prop comparison; prevents false "dirty" on server refreshes.

## The Brutal Truth

Found two subtle bugs during review that expose gap in how our audit middleware works:

1. **bypassAudit doesn't suppress `update` hook**: Initial code followed `setGrant` pattern — `bypassAudit(() => prisma.user.update(...))` + manual `writeAuditLog`. Reviewer caught that lib/prisma.ts `update` hook (lines 174-193) does NOT check `isAuditBypassed()`. Only `*Many` and `upsert` do. Result: two audit rows per save — one auto (tableName: "User"), one manual (tableName: "user") — casing broke system consistency. Fix: drop both wraps; let middleware handle it. Lesson: the bypass pattern doesn't generalize. **Action item**: add `isAuditBypassed()` guards to create/update/delete hooks in lib/prisma.ts during next cleanup cycle.

2. **useEffect resync clobbers in-progress edits**: Naive effect syncing local state to props on prop change caused silent reverts: admin tweaks role on row A (unsaved), clicks "Thêm quyền" on row B → revalidatePath → parent re-renders → row A's effect fires → edit silently lost. Fix: `useRef(lastServerSnapshot)` — only resync if `localValue === lastServerRef.current[field]` (pristine). Note: dirty flag compares to live prop; resync compares to last-rendered snapshot. Different baselines intentional and correct, but worth documenting in future refactors.

## What We Learned

- Audit middleware is inconsistent. Bypass works for `upsert` but not `update`. Generalizing patterns across hooks breaks when hook implementations diverge.
- Effect-driven state sync in optimistic UIs needs "pristine baseline" logic, not just "has prop changed." Otherwise refresh operations (very common in admin UIs) revert local edits.

## Next Steps

- Add `isAuditBypassed()` check to create/update/delete hooks in lib/prisma.ts (low priority, non-critical today).
- Document the pristine-baseline resync pattern in components/patterns.md for future inline editors.
