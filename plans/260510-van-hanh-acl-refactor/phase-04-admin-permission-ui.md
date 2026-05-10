---
phase: 4
title: "Admin Permission UI"
status: completed
priority: P1
effort: "8h"
dependencies: [2, 3]
---

# Phase 4: Admin Permission UI

## Overview

Two new admin pages:
- `/admin/permissions/modules` — matrix editor (D5): users × modules, admin edits all cells then commits batched.
- `/admin/permissions/projects` — per-user project permissions + "Toàn bộ dự án" super-grant.

D6: ≤20 users → no virtualization needed. Sticky header + first col enough.

## Requirements

**Functional:**
- Module page (matrix editor):
  - Rows = users (sticky first col), cols = `MODULE_KEYS` (sticky header).
  - Cell dropdown options derived from `MODULE_LEVELS[moduleKey]` (D4) — admin-only modules show `[Mặc định, Admin]`; dept/project modules show `[Mặc định, Read, Comment, Edit]`; role/open show `[Mặc định, Read]`.
  - "Mặc định" = no row (D2: revoke = delete).
  - Edits accumulate in client state with "dirty cell" highlight; "Lưu thay đổi" button commits all in one server call.
  - Cancel button discards uncommitted edits.
- Project page: pick user → show project list with level dropdown per project + checkbox "Toàn bộ dự án" + level for super-grant.
  - **D3 indicator:** if `ProjectGrantAll` exists, show badge "Có quyền toàn bộ" + "có {N} ngoại lệ" (per-project rows shadowing it).
- Audit row on every grant/revoke (verify Phase 4 step 1 first).
- Confirm dialog when granting `admin` level.

**Non-functional:**
- Matrix editor: max 20 users × 16 modules = 320 cells — fits comfortably in DOM.
- Commit: single server action `bulkApplyModulePermissionChanges(changes[])` wrapped in transaction.
- Toast on success/failure.

## Architecture

### Server actions (`app/(app)/admin/permissions/actions.ts`)

```ts
"use server";

type ModulePermissionChange = {
  userId: string;
  moduleKey: ModuleKey;
  level: AccessLevel | "default";  // D2: "default" = delete row
};

// Single-cell action (kept for project page + edge cases). Module page uses bulk.
export async function setModulePermission(change: ModulePermissionChange): Promise<void>;

// Matrix editor commit (D5). Wrapped in transaction. Validates each level vs MODULE_LEVELS.
export async function bulkApplyModulePermissionChanges(
  changes: ModulePermissionChange[],
): Promise<{ applied: number; rejected: { change: ModulePermissionChange; reason: string }[] }>;

export async function setProjectPermission(
  userId: string,
  projectId: number,
  level: AccessLevel | "default",
): Promise<void>;

export async function setProjectGrantAll(
  userId: string,
  level: AccessLevel | "default",
): Promise<void>;
```

Each action:
1. `requireRole(currentUser.role, "admin")`.
2. **Validate** (`isValidLevelForModule`) — reject if level not in module's domain.
3. Read existing row (if any) for `oldLevel`.
4. If `level === "default"` → delete row; else upsert.
5. **Audit:** Phase 4 step 1 verifies whether Prisma audit middleware already wraps these tables. If yes → no manual AuditLog write. If no → write explicit AuditLog entry per change.
6. Bulk action: chunk into batches of 100 inside `prisma.$transaction([...])`.
7. `revalidatePath("/admin/permissions/...")`.

### Module grid page (`app/(app)/admin/permissions/modules/page.tsx`)

Server component fetches:
- All users with role + dept.
- All `ModulePermission` rows → group by user.
- `MODULE_KEYS` constant.

Render `<ModulePermissionGrid users={...} permissions={...} />` (client component).

Grid:
- TableHeader: blank corner | module labels (Vietnamese display name from a label map).
- TableBody: user rows with role badge | dropdown per module cell.
- Cell select: `<select>` with options `Mặc định | Read | Comment | Edit | Admin (xác nhận)`.

### Project page (`app/(app)/admin/permissions/projects/page.tsx`)

Two-pane:
- Left: user list with search + "có super-grant" filter.
- Right: selected user's project grants — checkbox + level for each project, plus row "Toàn bộ dự án" at top.

### Module display labels

`lib/acl/module-labels.ts`:
```ts
export const MODULE_LABELS: Record<ModuleKey, string> = {
  "dashboard": "Bảng điều khiển",
  "master-data": "Dữ liệu nền tảng",
  "du-an": "Dự án xây dựng",
  // ... etc.
};
```

## Related Code Files

- Create: `app/(app)/admin/permissions/layout.tsx` — guard `admin.permissions`.
- Create: `app/(app)/admin/permissions/page.tsx` — landing with two cards.
- Create: `app/(app)/admin/permissions/modules/page.tsx` — server, fetches data.
- Create: `app/(app)/admin/permissions/modules/module-permission-grid.tsx` — client grid.
- Create: `app/(app)/admin/permissions/projects/page.tsx` — server.
- Create: `app/(app)/admin/permissions/projects/project-permission-panel.tsx` — client.
- Create: `app/(app)/admin/permissions/actions.ts` — server actions.
- Create: `lib/acl/module-labels.ts` — display labels.
- Modify: `components/layout/app-sidebar.tsx` — add nav item "Phân quyền" under Quản trị.
- Modify: `lib/acl/modules.ts` — `MODULE_KEYS` already includes `"admin.permissions"`.

## Implementation Steps

1. **Audit middleware verification (BLOCKER for steps 2+).** Before writing any manual AuditLog code:
   - `grep -r "\$extends" lib/ prisma/` to find Prisma client extension.
   - Read `lib/audit/*` (or wherever audit middleware lives) — confirm whether it intercepts `module_permissions`, `project_permissions`, `project_grant_all`.
   - If middleware already covers these tables → server actions write NO manual `AuditLog` row.
   - If not covered → server actions explicitly call `prisma.auditLog.create({...})` per change with `{ entity, entityId, action, oldValue, newValue, userId: currentUser.id }`.
   - Document the decision in a comment at top of `actions.ts`.
2. Create `lib/acl/module-labels.ts`.
3. Implement server actions in `actions.ts`. Pattern: follow existing `app/(app)/admin/nguoi-dung/actions.ts`.
   - `setModulePermission`, `setProjectPermission`, `setProjectGrantAll`: single-row, used by project page.
   - `bulkApplyModulePermissionChanges`: matrix commit. Wrap in `prisma.$transaction([...])`. Chunk to batches of 100 if `changes.length > 100`. Per change: validate via `isValidLevelForModule`, refuse self-demote on `admin.permissions`, then upsert/delete. Return `{ applied, rejected }` — caller toasts rejected list.
4. Build `module-permission-grid.tsx` (D5 — matrix editor, NOT debounced auto-save):
   - Client component receives initial `permissions: Map<userId, Map<moduleKey, level>>` from server.
   - Local state `pendingChanges: Map<\`${userId}:${moduleKey}\`, level | "default">`.
   - Cell `<select>` reads value from `pendingChanges` first, falls back to initial map. On change → write to `pendingChanges`.
   - "Dirty" cells get highlight class (`bg-amber-50`).
   - "Lưu thay đổi" button: `useTransition` → call `bulkApplyModulePermissionChanges(Array.from(pendingChanges))` → on success clear `pendingChanges` + toast applied count + show rejected list if any. On error → keep pending state, toast error.
   - "Hủy" button: clear `pendingChanges`.
   - Confirm dialog (shadcn `AlertDialog`) intercepts when ANY pending change has `level === "admin"` — prompt before submit.
5. Build `project-permission-panel.tsx`:
   - Two-pane: user list (search + filter) + selected user's project grants.
   - Per-row dropdown calls `setProjectPermission` directly via `useTransition` (single-row, no batching needed — list scale ≤ projects count).
   - "Toàn bộ dự án" row at top: checkbox + level dropdown → `setProjectGrantAll`.
   - **D3 indicator:** if `ProjectGrantAll` row exists for selected user, render badge "Có quyền toàn bộ ({grantAllLevel})" + "(N ngoại lệ)" where N = count of `ProjectPermission` rows shadowing it. Tooltip explains: "Dòng theo từng dự án ghi đè quyền toàn bộ kể cả khi cấp thấp hơn."
6. Wire pages + layouts:
   - `app/(app)/admin/permissions/layout.tsx`: server component, calls `requireModuleAccess("admin.permissions", { minLevel: "admin", scope: "module" })`.
   - `app/(app)/admin/permissions/page.tsx`: landing with two cards (Modules / Projects).
   - `app/(app)/admin/permissions/modules/page.tsx`: server fetch users + permissions map → render `<ModulePermissionGrid />`.
   - `app/(app)/admin/permissions/projects/page.tsx`: server fetch users + projects + permissions → render `<ProjectPermissionPanel />`.
7. Add sidebar entry "Phân quyền" → `/admin/permissions`, moduleKey `admin.permissions` (Phase 3 sidebar registry).
8. Test grants end-to-end:
   - Grant `viewer1` `du-an=edit` + `ProjectPermission(P1, edit)` → log in as viewer1 → see du-an in sidebar, can open P1, cannot open P2.
   - Grant `viewer2` `ProjectGrantAll(edit)` + `ProjectPermission(P5, read)` → can edit P1-P4, can only read P5 (D3).
   - Revoke `viewer1.du-an` → reload → du-an disappears from sidebar.
   - Try to grant self `admin.permissions=read` as logged-in admin → server rejects (self-lockout guard).
9. `npx tsc --noEmit` + manual smoke + `npx next build`.

## Success Criteria

- [x] Audit middleware coverage decision documented at top of `actions.ts` (covered → no manual write; uncovered → manual `auditLog.create` per change).
- [x] Admin can edit cells in matrix grid; "Lưu thay đổi" commits batched in single transaction; rejected list surfaces in toast.
- [x] "Hủy" discards pending edits without server call.
- [x] Per-module dropdown options match `MODULE_LEVELS[moduleKey]` — admin-only modules show only `[Mặc định, Admin]`; dept/project modules show `[Mặc định, Read, Comment, Edit]`.
- [x] Project page shows "Có quyền toàn bộ + N ngoại lệ" badge when `ProjectGrantAll` row + at least one `ProjectPermission` row exist for the same user.
- [x] Granting `admin` level shows confirm dialog; cancel does not commit.
- [x] Self-lockout guard: server refuses to demote `currentUser.id` from `admin` level on `admin.permissions`.
- [x] AuditLog has entry per change (verified path) with old + new level.
- [x] Non-admin user accessing `/admin/permissions` redirected to `/forbidden` (Phase 3 guard).
- [x] Bulk update works for 5+ users × 3+ modules in one commit (transactional — partial failure rolls back).
- [x] `npx tsc --noEmit` + `npx next build` pass.

## Risk Assessment

- **Risk:** Audit double-write if middleware already covers new tables AND server action also calls `auditLog.create`.
  **Mitigation:** Step 1 verification is BLOCKER. Decision documented in code comment.
- **Risk:** Module grid wide (16 cols) on small screens → unusable.
  **Mitigation:** Sticky first col + horizontal scroll + `min-w` per col. Tested at 1366×768.
- **Risk:** Bulk transaction times out on Postgres if `changes.length` is huge (e.g. 20 users × 16 modules = 320 rows).
  **Mitigation:** Chunk to 100/batch wrapped in `prisma.$transaction([...])`. 320 rows fits comfortably; chunking is defense for future growth.
- **Risk:** Pending edits lost if admin navigates away mid-edit.
  **Mitigation:** `beforeunload` listener warns when `pendingChanges.size > 0`. Out of scope: server-side draft persistence.
- **Risk:** Granting wrong level locks admin out of own account (especially on `admin.permissions`).
  **Mitigation:** Server action refuses to demote `currentUser.id` from `admin` level on `admin.permissions`. D1 admin role short-circuit prevents lockout via AppRole-level check; this is an extra rail for the explicit-row path.
- **Risk:** Matrix highlights stale if another admin commits concurrently between page load and "Lưu thay đổi".
  **Mitigation:** Last-write-wins on commit (server upsert is idempotent). Accept divergence; admin can refresh to see latest. Optimistic concurrency check is out of scope (D6: ≤20 users, ≤2 admins).
- **Risk:** AuditLog table grows unbounded.
  **Mitigation:** Existing audit log already used elsewhere; defer retention policy.
