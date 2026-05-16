# System Architecture

## Overview

This document describes the high-level architecture of the ngoquyyen-erp system, with emphasis on access control and the Vận hành (Operations) module structure.

## Access Control Architecture (ACL)

The system implements a **2-axis ACL model** layered on top of the existing RBAC foundation (AppRole + UserDeptAccess):

### Axis 1: Module Access (Trục 1 — Module Permissions)

Gating mechanism for per-user visibility and route access at the module level.

- **Table:** `ModulePermission(userId, moduleKey, level)`
- **Composite Key:** `(userId, moduleKey)`
- **Levels:** `"read"`, `"comment"`, `"edit"`, `"admin"` (per-module valid sets; some modules have fewer options)
- **Semantics:** Determines whether a user can see a module on the sidebar and access routes within that module
- **Fallback:** If no `ModulePermission` row exists, system falls back to `AppRole` defaults (`role_defaults.ts`)
- **Admin Short-Circuit (D1):** Users with `role = "admin"` bypass all module-level checks and can always access

### Axis 2: Resource Access (Trục 2 — Per-Module Axis Dispatch)

Once module-level gate passes, per-module dispatch rules apply:

| Module | Axis Type | Table(s) | Behavior |
|--------|-----------|----------|----------|
| `du-an` (Projects) | Project-based | `ProjectPermission` + `ProjectGrantAll` | User-specific per-project grants + optional super-grant covering all projects |
| `cong-no-vt`, `cong-no-nc` (Supplier Debt) | Dept-based | `UserDeptAccess` (existing) | Scoped to user's department(s) |
| `task` (Tasks/Cộng Việc) | Dept-based | `UserDeptAccess` (existing) | Scoped to user's department(s) |
| `coordination` (Phiếu Phối Hợp) | Dept-based | `UserDeptAccess` (existing) | Scoped to user's department(s) |
| `hieu-suat` (Performance) | Role-based | AppRole + `isLeader` + `isDirector` | Role/director flags determine access |
| `sl-dt` (Material) | Admin-only | — | Admin users only |
| `admin/*` | Admin-only | — | Admin users only |
| `master-data` | Admin-only | — | Admin users only |

### Effective Check Logic

```
canAccess(userId, moduleKey, options) = 
  (if user.role === "admin") return true;  // D1 short-circuit
  
  moduleLevel = modulePermission(userId, moduleKey) ?? appRole_default(user.role, moduleKey);
  if moduleLevel < "read": return false;
  
  return axisCheck(userId, moduleKey, resource, options);
```

**Key Decision (D3):** For module `du-an`, `ProjectPermission` rows override `ProjectGrantAll` even when level is lower. Resolver priority:
1. If `ProjectPermission(userId, projectId)` exists → use that level
2. Else if `ProjectGrantAll(userId)` exists → use that level
3. Else → deny access

This enables granular exceptions: e.g., "edit all projects except P5 (read-only)".

## Module Structure: Vận Hành (Operations)

### New Route Hierarchy

Routes reorganized under `/van-hanh` prefix:

```
/van-hanh
  /cong-viec           → Task management (moved from /cong-viec)
  /phieu-phoi-hop      → Coordination forms (moved from /phieu-phoi-hop)
  /hieu-suat           → Performance dashboard (new, placeholder; impl in Plan C)
```

**Migration:** Old routes (`/cong-viec`, `/phieu-phoi-hop`) issue 307 redirects to new paths during cutover window, later flipped to 308 (permanent).

### Sidebar Integration

Sidebar is a server component that filters navigation items per `canAccess` checks. "Vận hành" appears as a single top-level group with 3 sub-items, removing the previous split between "Cộng tác" entries.

## Data Models

### ModulePermission

```prisma
model ModulePermission {
  userId    String
  moduleKey String  // e.g., "du-an", "task", "cong-no-vt"
  level     String  // CHECK constraint: level IN ('read', 'comment', 'edit', ...)
  grantedAt DateTime
  grantedBy String?
  
  @@id([userId, moduleKey])
  @@index([userId])
}
```

**Postgres CHECK Constraint:** Validates that level is a valid string literal per module config.

### ProjectPermission

```prisma
model ProjectPermission {
  userId    String
  projectId Int
  level     String  // CHECK constraint: level IN ('read', 'comment', 'edit')
  grantedAt DateTime
  grantedBy String?
  
  @@id([userId, projectId])
  @@index([userId])
  @@index([projectId])
}
```

Used only for `du-an` module. One row per unique (user, project) pair with explicit level override.

### ProjectGrantAll

```prisma
model ProjectGrantAll {
  userId    String  @id
  level     String  // CHECK constraint: level IN ('read', 'comment', 'edit')
  grantedAt DateTime
  grantedBy String?
}
```

Super-grant for a user across all projects within `du-an` module. One row per user max. Overridden by explicit `ProjectPermission` row if it exists (D3).

## Admin UI

### /admin/permissions/modules

Matrix editor for granting/revoking module access.

- **UI:** Excel-like grid with columns for each module, rows for each user
- **Interaction:** Select cells and bulk-edit level in batched transaction (per D5)
- **Validation:** Dropdown per cell shows valid levels for that module only
- **Scale:** No pagination/virtualization; assumes ≤20 users (D6)

### /admin/permissions/projects

Per-project and super-grant manager for `du-an` module.

- **Left Panel:** List all projects; click to edit
- **Right Panel (Per-Project):** Explicit `ProjectPermission` rows for selected project
- **Right Panel (Super-Grant):** Single row for `ProjectGrantAll`; visual indicator if user has both = exception case
- **D3 Clarity:** UI shows "Override" badge when explicit project row overrides super-grant

## Audit & Logging

**Decision (D2 — Revoke = Delete):** Revoking a permission deletes the row rather than storing `level = "none"`. Audit logs capture all grant/revoke events via explicit `writeAuditLog` calls (not auto-middleware, per verification that Prisma middleware doesn't cover composite-key tables).

Related audit tables: `AuditLog` (existing) captures writes to `ModulePermission`, `ProjectPermission`, `ProjectGrantAll` via manual logging in permission action handlers.

## Dependencies & Constraints

- **Extends:** `lib/dept-access.ts` (existing UserDeptAccess), `lib/rbac.ts` (existing AppRole)
- **Non-Interfering:** ACL helpers are additive; no replacement of existing systems
- **Route Guards:** All 28 segment routes in `(app)` directory protected via `requireModuleAccess(moduleKey, opts)` from `lib/acl/guards.ts`
- **Type Safety:** Module keys and valid level sets are constants in `lib/acl/modules.ts`; invalid (moduleKey, level) pairs rejected at type-check time

## Performance Considerations

- **Sidebar Query Count:** Server component uses per-request `cache()` to deduplicate access checks; target ≤3 Prisma queries per page load
- **Route Guard Overhead:** Minimal; checks are synchronous after loader fills user/project context
- **Bulk Operations:** Chunked in 100-row batches within transactions to prevent timeout
- **Matrix Editor Debounce:** Client-side request queue per cell to prevent race conditions (max 1 in-flight request per `(userId, moduleKey)`)

## Testing & Validation

### Automated Test Suite (Comprehensive)

**Coverage:** 339 unit/integration tests + 6 E2E specs + security matrix + performance queries + load tests

**Test Layers:**
- **Unit Tests (lib/):** 40+ ACL resolver cases, 32+ golden fixtures (3 roles × 3 axes), payment service, import engine, balance-service
- **Integration Tests:** Real DB with `truncateAll()` cleanup per `*_test` guard
- **E2E Tests (Playwright):** 6 Server-Action workflows + 4 security specs (authz matrix, auth bypass, IDOR, SSE stream)
- **Security Tests:** ACL enforcement matrix + manual checklist (`SECURITY-MANUAL-REVIEW.md`)
- **Performance Tests:** N+1 query counter (0 N+1 found; baseline: dashboard 8, ledgerSummary 1, aggregateMonth 2, taskBoard 9) + load suite (on-demand)
- **CI Pipeline:** GitHub Actions with 3 jobs (unit/integration blocking, e2e blocking, perf informational)

**Key Metrics:**
- **Line Coverage (lib/):** 30.93% (1303/4212 lines) — 60% project threshold deferred (out-of-scope services documented)
- **ACL Test Coverage:** 40/40 resolver + 32/32 golden fixtures PASS
- **Route Guard Audit:** 28/28 segments protected ✓
- **Build & Type Check:** `next build` green, `tsc --noEmit` clean

## Next Steps (Unblocked Plans)

- **Plan B (Task Swimlane):** Builds on `canAccess("van-hanh.cong-viec", task)` + new route structure
- **Plan C (Performance MVP):** Uses `canAccess("van-hanh.hieu-suat", scope)` + role-based axis
- Both can run in parallel after this plan merges; no code conflicts
