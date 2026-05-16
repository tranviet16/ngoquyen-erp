# Code Standards & Conventions

## Route Guards & Access Control

### Pattern: Module Access Guards

All routes must explicitly declare their module and required access level using the `requireModuleAccess` guard from `lib/acl/guards.ts`.

#### Signature

```typescript
export async function requireModuleAccess(
  moduleKey: string,
  opts: CanAccessOpts
): Promise<{ userId: string; user: User; [scope-fields] }>
```

Where `CanAccessOpts` is a discriminated union requiring explicit scope:

```typescript
type CanAccessOpts = 
  | { scope: "module" }  // Module-level check only
  | { scope: "any" }     // No resource scope (rare)
  | { kind: "dept"; deptId: string }  // Dept-scoped resource
  | { kind: "project"; projectId: number }  // Project-scoped resource
```

#### Usage in layout.tsx (Sidebar & Segment Guards)

Every segment route in `(app)/` directory includes a protected layout.tsx:

```typescript
// app/(app)/van-hanh/cong-viec/layout.tsx
import { requireModuleAccess } from "@/lib/acl/guards";

export default async function VanHanhCongViecLayout({ children }) {
  await requireModuleAccess("van-hanh.cong-viec", { scope: "module" });
  return children;
}
```

**Important:** `CanAccessOpts` requires an **explicit scope**. Do NOT pass `opts = {}` or rely on defaults. Every call must specify one of: `scope: "module"` | `scope: "any"` | resource scope.

#### Usage in Page Components

For data fetching that requires resource scope (e.g., loading a specific project):

```typescript
// app/(app)/du-an/[id]/page.tsx
import { requireModuleAccess } from "@/lib/acl/guards";

export default async function ProjectPage({ params }) {
  const projectId = parseInt(params.id);
  const { userId } = await requireModuleAccess("du-an", {
    kind: "project",
    projectId
  });
  
  // Now safe to load project data
  const project = await db.project.findUnique({ where: { id: projectId } });
}
```

### Fallback to AppRole Defaults

If no `ModulePermission` row exists for a user, the system falls back to `AppRole` defaults defined in `lib/acl/role-defaults.ts`. Do not hardcode role checks; always use `requireModuleAccess` to respect both explicit grants and role defaults.

## Module Keys & Level Constants

### Module Key Registry

Module keys are defined as string constants in `lib/acl/modules.ts`:

```typescript
export const MODULE_KEYS = {
  "du-an": "du-an",
  "van-hanh.cong-viec": "van-hanh.cong-viec",
  "van-hanh.phieu-phoi-hop": "van-hanh.phieu-phoi-hop",
  "cong-no-vt": "cong-no-vt",
  "task": "task",
  // ... etc
} as const;
```

Use the constant, not string literals:

```typescript
// Good
await requireModuleAccess(MODULE_KEYS["du-an"], { kind: "project", projectId });

// Avoid
await requireModuleAccess("du-an", { kind: "project", projectId });
```

### Per-Module Valid Levels

Each module has a set of valid access levels defined in `lib/acl/modules.ts`. Levels are NOT universal; e.g., admin-only modules only support `"admin"`.

```typescript
// In lib/acl/modules.ts
export const MODULE_CONFIG = {
  "du-an": {
    levels: ["read", "comment", "edit"] as const,
    axis: "project",
  },
  "van-hanh.cong-viec": {
    levels: ["read", "comment", "edit"] as const,
    axis: "dept",
  },
  "admin.permissions": {
    levels: ["admin"] as const,
    axis: "admin-only",
  },
};
```

When setting permissions via admin UI or API, only offer dropdowns from the module's valid level set.

## ACL Helper Functions

All access checks route through `lib/acl/effective.ts`, which implements the 2-axis logic:

- `canAccess(userId, moduleKey, opts)` → Returns boolean after 2-axis check
- `getViewableProjectIds(userId)` → Returns `{ kind: "all" | "subset" | "none"; projectIds?: number[] }`
- `getModulePermissionLevel(userId, moduleKey)` → Returns level string or undefined (falls back to AppRole)

### Example: Checking Access Before Query

```typescript
import { canAccess } from "@/lib/acl/effective";

async function fetchProjectData(userId: string, projectId: number) {
  const allowed = await canAccess(userId, "du-an", {
    kind: "project",
    projectId
  });
  
  if (!allowed) {
    throw new Error("Access denied");
  }
  
  return db.project.findUnique({ where: { id: projectId } });
}
```

### Example: Filtering List Results

```typescript
import { getViewableProjectIds } from "@/lib/acl/effective";

async function listProjects(userId: string) {
  const access = await getViewableProjectIds(userId);
  
  if (access.kind === "all") {
    return db.project.findMany(); // No filter needed
  } else if (access.kind === "subset") {
    return db.project.findMany({
      where: { id: { in: access.projectIds } }
    });
  } else {
    return []; // User has no project access
  }
}
```

## Admin-Only Short-Circuit (D1)

Users with `role = "admin"` automatically pass all `canAccess` checks. This eliminates the need for "min 1 admin" logic and prevents admins from locking themselves out. Do not add additional admin role checks downstream of `requireModuleAccess` or `canAccess`.

## Permission Grant/Revoke Pattern (D2)

### Revoke = Delete Row

Revoking a permission deletes the row from `ModulePermission`, `ProjectPermission`, or `ProjectGrantAll`. Do not store a `level = "none"` row.

When implementing revoke actions:

```typescript
// Grant
await db.modulePermission.upsert({
  where: { userId_moduleKey: { userId, moduleKey } },
  update: { level, grantedAt: new Date(), grantedBy: adminId },
  create: { userId, moduleKey, level, grantedBy: adminId },
});

// Revoke (delete, then log)
const deleted = await db.modulePermission.delete({
  where: { userId_moduleKey: { userId, moduleKey } },
});
await writeAuditLog({
  action: "REVOKE_MODULE_PERMISSION",
  userId: adminId,
  details: { userId, moduleKey, level: deleted.level },
});
```

**Audit Middleware Note:** Prisma `$extends` middleware does NOT cover composite-key tables (`ModulePermission`, `ProjectPermission`). Always pair delete/update with explicit `writeAuditLog` calls.

## ProjectPermission Override Logic (D3)

For the `du-an` module, `ProjectPermission` rows take precedence over `ProjectGrantAll`. Example scenario:

- User has `ProjectGrantAll(edit)` → can edit all projects
- Admin grants `ProjectPermission(projectId=5, read)` → explicit row
- User now sees projectId=5 as read-only, all others as edit

Resolver implementation in `lib/acl/project-access.ts`:

```typescript
export async function resolveProjectLevel(userId: string, projectId: number) {
  // D3: Explicit row overrides super-grant
  const explicit = await db.projectPermission.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  
  if (explicit) {
    return explicit.level;
  }
  
  const superGrant = await db.projectGrantAll.findUnique({
    where: { userId },
  });
  
  return superGrant?.level;
}
```

## Sidebar Rendering

The sidebar is a **server component** that queries `canAccess` per nav item and filters client-side rendering. No client-side ACL filtering; all visibility is server-determined.

Location: `components/sidebar.tsx` (server component)

Do not move ACL checks to client components or rely on CSS `display: none` for security.

## Vận hành Module Structure

### Route Organization

```
/van-hanh                    (moduleKey: "van-hanh")
  /cong-viec                 (moduleKey: "van-hanh.cong-viec")
  /phieu-phoi-hop            (moduleKey: "van-hanh.phieu-phoi-hop")
  /hieu-suat                 (moduleKey: "van-hanh.hieu-suat")
```

Old routes (`/cong-viec`, `/phieu-phoi-hop`) issue 307 redirects during cutover, later 308 after stabilization.

### Audit & Breaking Changes

When accessing task or coordination form URLs from notifications, audit comments, or stored links:

- Check `lib/task/*` and `lib/coordination-form/*` for hard-coded URL strings
- Replace with new `/van-hanh/` prefix
- Add migration script if DB contains legacy URLs in text columns

## Bulk Update Pattern (Permissions Matrix)

When bulk-editing multiple permissions (e.g., in `/admin/permissions/modules` matrix):

```typescript
await db.$transaction(
  permissionUpdates
    .reduce((acc, batch) => [
      ...acc,
      ...batch.slice(0, 100).map(update => 
        update.revoke 
          ? db.modulePermission.delete({ where: { ... } })
          : db.modulePermission.upsert({ ... })
      ),
    ], []),
  { maxWait: 5000, timeout: 30000 }
);
```

Chunk operations in batches of 100 to prevent timeout. Wrap entire batch in a single transaction for atomicity.

## Build & Validation

### Pre-Commit Checks

- **Type Checking:** `npx tsc --noEmit` must pass before commit. Module keys and level enums are type-safe.
- **Linting:** Standard ESLint config; focus on no syntax errors, meaningful variable names, no unused imports.
- **Build:** `next build` must complete without errors
- **Unit Tests:** `npm run test` must pass (339 tests covering lib/ services)

### Automated Test Suite

**Running Tests:**

```bash
# Fast unit tests (no DB required) — ~3s
npm run test

# Integration + security + perf tests (requires test DB) — ~30s
npm run test:integration

# Coverage report (unit tests only)
npm run test:coverage

# E2E tests (requires `next dev` on :3333)
npm run test:e2e

# Load tests (on-demand; requires live server on :3333)
npm run test:load
```

**Test Structure:**
- `lib/**/*.test.ts` — Unit tests for individual services (payment, ACL, import, etc.)
- `test/integration/**/*.test.ts` — Integration tests with real DB
- `test/security/*.test.ts` — Security-focused integration tests (ACL enforcement)
- `test/performance/*.test.ts` — Performance tests (N+1 query counting; load is on-demand)
- `e2e/**/*.spec.ts` — Playwright E2E tests for Server-Action flows
- `e2e/security/**/*.spec.ts` — Security-specific E2E tests (auth bypass, IDOR, SSE)

**Key Test Guidelines:**
- Unit tests must NOT hit the database (use mocks from `test/helpers/`)
- Integration tests use `truncateAll()` from `test/helpers/test-db.ts` to clean test DB after each suite
- ACL tests verify both explicit grants and AppRole fallback paths
- New ACL helper tests in `lib/acl/__tests__/` must maintain 100% pass rate (40+ resolver + 32+ fixture cases)
- Security tests validate authorization matrix + auth bypass + IDOR + SSE isolation
- All service layer changes should add corresponding integration test coverage

## Common Pitfalls

1. **Hardcoding role checks** → Use `requireModuleAccess` instead; it respects both explicit grants and AppRole defaults
2. **Forgetting scope in CanAccessOpts** → Always specify one of the 4 scope variants; do not pass `{}`
3. **Client-side ACL filtering** → All visibility decisions are server-side. CSS `display: none` is not access control
4. **Storing `level = "none"`** → Always delete rows to revoke; fallback to AppRole defaults is automatic
5. **Module key typos** → Use constants from `MODULE_KEYS` instead of string literals
6. **Missing audit logs on permission delete** → Pair every delete with `writeAuditLog` call
7. **Assuming admin has permission** → D1 short-circuit handles it automatically; don't add extra checks

## References

- `lib/acl/guards.ts` — Route guard function `requireModuleAccess`
- `lib/acl/effective.ts` — Access check resolver + helper queries
- `lib/acl/modules.ts` — Module key registry + per-module config
- `lib/acl/module-access.ts` — Module-level axis logic
- `lib/acl/project-access.ts` — Project-level axis logic (du-an)
- `lib/acl/role-defaults.ts` — AppRole fallback defaults
- `system-architecture.md` — Conceptual overview of 2-axis model
