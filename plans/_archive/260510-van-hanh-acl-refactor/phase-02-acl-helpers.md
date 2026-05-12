---
phase: 2
title: "ACL Helpers & Effective Resolver"
status: completed
priority: P1
effort: "6h"
dependencies: [1]
---

# Phase 2: ACL Helpers & Effective Resolver

## Overview

Create per-module/per-project access map loaders + unified `canAccess(moduleKey, resource)` resolver. Memoized per request via React `cache()`. Defines fallback behavior when permission rows are missing (suy từ `AppRole`).

## Requirements

**Functional:**
- `getModuleAccessMap(userId)` → `Map<ModuleKey, AccessLevel>` of explicit grants.
- `getProjectAccessMap(userId)` → `{ all: AccessLevel | null, perProject: Map<projectId, AccessLevel> }`.
- `getEffectiveModuleLevel(userId, moduleKey)` → explicit row → fallback per AppRole (returns `AccessLevel | null` — null = no access).
- `canAccess(userId, moduleKey, opts)` → boolean. **Explicit scope required** (D1+secure default):
  ```ts
  type CanAccessOpts =
    | { minLevel: AccessLevel; scope: "module" }   // Trục 1 only (sidebar render)
    | { minLevel: AccessLevel; scope: "any" }      // Trục 1 + module-level OK; caller filters resources elsewhere
    | { minLevel: AccessLevel; scope: { kind: "dept"; deptId: number } }
    | { minLevel: AccessLevel; scope: { kind: "project"; projectId: number } }
    | { minLevel: AccessLevel; scope: { kind: "role"; roleScope?: "self" | "dept" | "all" } };
  ```
  No default for scope — caller must specify. Trục 1 always checks first.
- `assertAccess(...)` → throws on deny.
- `getViewableProjectIds(userId)` → tagged union: `{ kind: "all" } | { kind: "subset"; ids: number[] } | { kind: "none" }`.
- `checkRoleAxis(user, scope)` → boolean per D5 below.
- Helpers reuse existing `getDeptAccessMap` from `lib/dept-access.ts` for dept-axis modules.

**Non-functional:**
- All loaders use `cache()` from `react` for per-request memoization.
- Single Prisma query per loader (no N+1).
- Type-safe: `moduleKey: ModuleKey` (union), `level: AccessLevel`.

## Architecture

### Default level fallback (when no `ModulePermission` row)

Returns `AccessLevel | null`. `null` = no access (no row equivalent).

| AppRole | Default for non-admin module | Default for admin module |
|---|---|---|
| `admin` | (D1: short-circuit, fallback irrelevant) | (D1: short-circuit) |
| `ketoan` | `edit` | `null` |
| `chihuy_ct` | `edit` | `null` |
| `canbo_vt` | `edit` (only `cong-no-vt`, `vat-tu-ncc`, `van-hanh.*`, `dashboard`, `thong-bao`); else `null` | `null` |
| `viewer` | `read` (only `dashboard`, `thong-bao`); else `null` | `null` |

Fallback table lives in `lib/acl/role-defaults.ts`. **Always** prefer explicit `ModulePermission` row over fallback.

### Effective check flow (locked per D1, D3)

```
canAccess(userId, M, opts):
  user = getUser(userId)
  if user.role === "admin": return true              // D1: hard short-circuit
  if !user: return false

  // Trục 1
  moduleLevel = getEffectiveModuleLevel(userId, M)   // explicit row || fallback || null
  if moduleLevel == null: return false
  if rank(moduleLevel) < rank(opts.minLevel): return false

  // Trục 2 per axis
  axis = MODULE_AXIS[M]
  if opts.scope === "module": return true            // sidebar / module-level only
  if opts.scope === "any":
    return axis === "open" || axis === "admin-only"  // these have no Trục 2 anyway
                                                      // caller asserts they filter elsewhere

  switch axis:
    case "open": return true
    case "admin-only": return false                  // already handled by admin short-circuit
    case "dept":
      if opts.scope.kind !== "dept": return false   // type guard at caller
      deptMap = getDeptAccessMap(userId)
      return hasDeptAccess(deptMap, opts.scope.deptId, opts.minLevel)
    case "project":
      if opts.scope.kind !== "project": return false
      projMap = getProjectAccessMap(userId)
      // D3: per-project row OVERRIDES grantAll, even if lower
      perRow = projMap.perProject.get(opts.scope.projectId)
      effectiveProjLevel = perRow ?? projMap.all
      if effectiveProjLevel == null: return false
      return rank(effectiveProjLevel) >= rank(opts.minLevel)
    case "role":
      if opts.scope.kind !== "role": return false
      return checkRoleAxis(user, opts.scope.roleScope ?? "self")
```

### `checkRoleAxis` contract

```ts
function checkRoleAxis(user, scope: "self" | "dept" | "all"): boolean {
  // self: any authenticated user can view own data
  if (scope === "self") return true;
  // dept: leaders/directors/admin can see dept rollup
  if (scope === "dept") return user.isLeader || user.isDirector;  // (admin already short-circuited)
  // all: directors/admin only
  if (scope === "all") return user.isDirector;
  return false;
}
```

`isLeader`, `isDirector` flags already exist on `User` model (no migration needed). Plan C (performance) will be the first real consumer.

### `getViewableProjectIds(userId)` — for du-an list filtering

```ts
async function getViewableProjectIds(userId): Promise<
  | { kind: "all" }
  | { kind: "subset"; ids: number[] }
  | { kind: "none" }
> {
  const user = await getUser(userId);
  if (user.role === "admin") return { kind: "all" };

  const moduleLevel = await getEffectiveModuleLevel(userId, "du-an");
  if (moduleLevel == null) return { kind: "none" };

  const projMap = await getProjectAccessMap(userId);
  if (projMap.all && projMap.perProject.size === 0) return { kind: "all" };
  // D3: build effective set — perProject rows can shadow grantAll (any level), and grantAll covers the rest
  if (projMap.all) {
    // grantAll covers everything except per-project overrides; caller needs to know "all minus exceptions"
    // For list filtering, return "all" if grantAll level >= minLevel; per-project overrides are checked at row click.
    return { kind: "all" };
  }
  const ids = Array.from(projMap.perProject.keys());
  if (ids.length === 0) return { kind: "none" };
  return { kind: "subset", ids };
}
```

Caller pattern (du-an list):
```ts
const v = await getViewableProjectIds(userId);
if (v.kind === "none") return [];
const projects = await prisma.project.findMany({
  where: v.kind === "subset" ? { id: { in: v.ids } } : {},
});
```

### Files

```
lib/acl/
├── modules.ts              (Phase 1)
├── role-defaults.ts        Default level table per AppRole × moduleKey
├── module-access.ts        getModuleAccessMap, getEffectiveModuleLevel
├── project-access.ts       getProjectAccessMap (perProject + all)
├── effective.ts            canAccess, assertAccess (entry point)
└── index.ts                Re-exports
```

## Related Code Files

- Create: `lib/acl/role-defaults.ts`
- Create: `lib/acl/module-access.ts`
- Create: `lib/acl/project-access.ts`
- Create: `lib/acl/effective.ts`
- Create: `lib/acl/index.ts`
- Read for reference: `lib/dept-access.ts`, `lib/rbac.ts`

## Implementation Steps

1. **`role-defaults.ts`:** Export `getDefaultModuleLevel(role: AppRole, moduleKey: ModuleKey): AccessLevel` per fallback table above.
2. **`module-access.ts`:**
   - `getModuleAccessMap = cache(async (userId) => { ... })` returns `Map<ModuleKey, AccessLevel>`.
   - `getEffectiveModuleLevel(userId, moduleKey)`: load user + map, return explicit row level or fallback default.
3. **`project-access.ts`:**
   - `getProjectAccessMap = cache(async (userId) => { ... })` returns `{ all, perProject }`.
   - Helper `hasProjectAccess(map, projectId, minLevel)`.
4. **`effective.ts`:**
   - `canAccess(userId, moduleKey, opts)` orchestrates Trục 1 + Trục 2 per `MODULE_AXIS[moduleKey]`.
   - `assertAccess(userId, moduleKey, opts, msg?)` throws on false.
   - `getViewableProjectIds(userId): Promise<number[] | "all">` for du-an list filtering.
5. **`index.ts`:** Re-export public API.
6. Add unit tests for `canAccess` covering each axis × each level combination — see Test Plan.
7. `npx tsc --noEmit` + run tests.

### Test Plan

Create `lib/acl/__tests__/effective.test.ts`:
- ✓ `admin` role: canAccess every module/level always returns true (D1 short-circuit).
- ✓ `ModulePermission(u1, "du-an", "edit")` + `ProjectPermission(u1, P1, "edit")` → canAccess("du-an", `{ minLevel: "edit", scope: { kind: "project", projectId: P1 } }`) = true.
- ✓ Same user + projectId P2 (no row) → false.
- ✓ `ProjectGrantAll(u, "read")` + no perProject row → canAccess project P at read = true; at edit = false.
- ✓ **D3 override:** `ProjectGrantAll(u, "edit")` + `ProjectPermission(u, P5, "read")` → canAccess(P5, edit) = false (perRow `read` overrides grantAll `edit`).
- ✓ **D3 override:** Same user → canAccess(P5, read) = true; canAccess(P6, edit) = true (no override on P6, grantAll wins).
- ✓ Dept-axis: `UserDeptAccess(D1, comment)` → canAccess("cong-no-vt", `{ minLevel: "comment", scope: { kind: "dept", deptId: D1 } }`) = true; minLevel: "edit" = false.
- ✓ Fallback: viewer without explicit row → canAccess("dashboard", `{ minLevel: "read", scope: "module" }`) = true; canAccess("admin.nguoi-dung", ...) = false.
- ✓ Scope guard: `canAccess(viewer, "du-an", { minLevel: "read", scope: "module" })` returns boolean based on Trục 1 only — does not silently authorize project-level operations.
- ✓ Role-axis: `viewer` user with `isLeader=true` → checkRoleAxis(scope="dept") = true; non-leader = false.
- ✓ Role-axis: `viewer` user with `isDirector=true` → checkRoleAxis(scope="all") = true; isLeader-only = false.
- ✓ getViewableProjectIds: admin → `{ kind: "all" }`; user with ProjectGrantAll → `{ kind: "all" }`; user with only perProject rows → `{ kind: "subset", ids: [...] }`; user with no module access → `{ kind: "none" }`.
- ✓ CHECK constraint: attempt to insert `ModulePermission(level: "editt")` rejects at DB level (integration test).

## Success Criteria

- [x] All test cases pass (36/36).
- [x] `canAccess` returns deterministic boolean for every `(userId, moduleKey, opts)` combo.
- [x] No N+1: single Prisma query per loader (getModuleAccessMap + getProjectAccessMap each do 1 query).
- [x] React `cache()` wraps all loaders for per-request memoization.
- [x] `npx tsc --noEmit` passes (zero errors).

## Risk Assessment

- **Risk:** D1 admin short-circuit means admin cannot be restricted per-module.
  **Mitigation:** Accepted by design. If someday need "admin chuyên trách" → tách thêm role mới (vd `admin_finance`), không dùng `ModulePermission` để restrict admin.
- **Risk:** `cache()` only memoizes per RSC render, not across server actions.
  **Mitigation:** Server actions short-lived; for bulk ops in Phase 4, build explicit batch loader (`getModuleAccessMaps(userIds[])`).
- **Risk:** Default fallback table drift from real intent.
  **Mitigation:** Document table in `role-defaults.ts` with comment per row. Phase 5 seed materializes explicit rows so fallback only fires for new users.
- **Risk:** D3 (perProject overrides grantAll) is counter-intuitive — admin grants `grantAll=edit` then someone shadows specific project to `read`.
  **Mitigation:** Phase 4 admin UI must show "có override" badge next to project entries when grantAll exists. Tooltip explain D3 semantics.
- **Risk:** Role-axis `checkRoleAxis(scope="self")` always returns true — could leak own-data on modules where "self" makes no sense (e.g. cong-no).
  **Mitigation:** Role-axis only applies to `MODULE_AXIS = "role"` modules (currently just `van-hanh.hieu-suat`). Type guard prevents misuse.
