# Codebase Summary

## Project Overview

**ngoquyyen-erp** is an enterprise resource planning (ERP) system built with Next.js 14 (App Router), TypeScript, Prisma ORM, and PostgreSQL. The system manages projects (du-án), supplier debt (cộng nợ), tasks (công việc), coordination forms (phiếu phối hợp), and administrative operations through a granular, role-based access control system.

**Latest Major Change:** 2026-05-15 Payment round refactor — EntityId FK + cascade UI + 4-category pivot. Previous: 2026-05-10 Plan A — Vận hành module + 2-axis ACL

---

## Directory Structure

```
ngoquyyen-erp/
├── app/
│   └── (app)/                          # Authenticated app routes
│       ├── admin/
│       │   ├── import/                 # Data import tools
│       │   ├── permissions/            # NEW: Module & project permission admin UI
│       │   │   ├── modules/            # Module permission matrix editor
│       │   │   └── projects/           # Project permission + super-grant manager
│       │   └── ...
│       ├── van-hanh/                   # NEW: Operations module (Vận Hành)
│       │   ├── cong-viec/              # Tasks (moved from /cong-viec)
│       │   ├── phieu-phoi-hop/         # Coordination forms (moved from /phieu-phoi-hop)
│       │   └── hieu-suat/              # Performance dashboard (placeholder; Plan C)
│       ├── du-an/                      # Projects
│       │   └── [id]/
│       │       ├── cong-no/            # Supplier debt per project
│       │       └── ...
│       ├── cong-no-vt/                 # Supplier debt (Vật Tư dept)
│       ├── cong-no-nc/                 # Supplier debt (Nhân Công dept)
│       └── ...
├── lib/
│   ├── acl/                            # NEW: 2-axis access control system
│   │   ├── modules.ts                  # Module registry + per-module config
│   │   ├── effective.ts                # Access resolver (canAccess, getViewable*)
│   │   ├── guards.ts                   # Route guard: requireModuleAccess
│   │   ├── module-access.ts            # Axis 1: Module permissions
│   │   ├── project-access.ts           # Axis 2: Project permissions (du-an)
│   │   ├── role-defaults.ts            # AppRole fallback defaults
│   │   ├── module-labels.ts            # UI labels for modules/levels
│   │   ├── _user.ts                    # User context utilities
│   │   └── __tests__/                  # 40+ resolver tests + 32+ golden fixtures
│   ├── dept-access.ts                  # UserDeptAccess checks (existing)
│   ├── rbac.ts                         # AppRole + user role logic (existing)
│   ├── du-an/                          # Project-related queries
│   ├── task/                           # Task-related queries
│   ├── coordination-form/              # Coordination form queries
│   ├── import/                         # Data import adapters
│   │   └── adapters/                   # per-tab SOP adapters
│   └── auth.ts                         # NextAuth config
├── prisma/
│   ├── schema.prisma                   # Data models + migrations
│   │   ├── ModulePermission            # NEW: Per-user per-module access
│   │   ├── ProjectPermission           # NEW: Per-user per-project overrides
│   │   ├── ProjectGrantAll             # NEW: Super-grant per user
│   │   └── [existing models...]
│   └── migrations/                     # DB migration files
├── components/
│   ├── sidebar.tsx                     # Server component; ACL-filtered nav
│   ├── ...
├── docs/                               # NEW: Documentation directory
│   ├── system-architecture.md          # 2-axis ACL model + dependencies
│   ├── code-standards.md               # Route guard patterns + ACL usage
│   ├── codebase-summary.md             # This file
│   ├── project-changelog.md            # All changes + Plan A delivery notes
│   └── development-roadmap.md          # Phases + parallel execution plan
└── ...
```

---

## Core Systems

### 1. Access Control (lib/acl/)

**Purpose:** Enforce granular per-module and per-resource access rules.

**2-Axis Model:**
- **Axis 1 (Module):** `ModulePermission(userId, moduleKey, level)` gates sidebar visibility and route access
- **Axis 2 (Resource):** Per-module dispatch:
  - `du-an` → `ProjectPermission` + `ProjectGrantAll` (project-scoped)
  - `cong-no-*`, `task`, `coordination` → `UserDeptAccess` (dept-scoped)
  - `hieu-suat` → Role-based (`AppRole` + flags)
  - `admin/*`, `sl-dt`, `master-data` → Admin-only

**Key Functions:**
- `requireModuleAccess(moduleKey, opts)` — Route guard for segment protection
- `canAccess(userId, moduleKey, opts)` — Access check with 2-axis resolution
- `getViewableProjectIds(userId)` — Filtered project list per user access

**Key Decisions:**
- **D1:** Admin role short-circuits all checks (prevents lockout)
- **D2:** Revoke = delete row (no `level="none"`); explicit audit logging
- **D3:** `ProjectPermission` overrides `ProjectGrantAll` per user/project
- **D4:** Per-module valid level sets (not all levels for all modules)
- **D5:** Bulk edits use matrix editor (batched transaction, not bulk-apply-level)
- **D6:** ≤20 users assumed; no pagination/virtualization in admin UI

### 2. Projects (du-an)

**Models:** Project, ProjectTask, ProjectMember, ProjectGrantAll, ProjectPermission

**Key Features:**
- Project creation, assignment, status tracking
- Cost tracking and supplier debt matrix (8-column dept breakdown)
- Coordination forms per project
- Debt visualization with filter by entity (chu thể)

**ACL Axis:** Project-based (`ProjectPermission` + `ProjectGrantAll`)

### 3. Supplier Debt (cộng-nợ-*) & Payment Planning (kế-hoạch-thanh-toán)

**Models:** SupplierDebt, SupplierDebtDetail (per dept), PaymentRound, PaymentRoundItem (Entity-Supplier-Project-Category matrix)

**Key Features:**
- Debt matrix by supplier × dept
- Aging calculation and payment terms
- Debt filter by entity type (chu thể)
- Sticky table scroll for large datasets
- Payment planning with 4-category breakdown (vat_tu, nhan_cong, dich_vu, khac)
- Payment round approval workflow with entity cascade

**ACL Axis:** Dept-scoped (`UserDeptAccess`) for debt routes; Project-filtered for payment cascade

**Routes:**
- `/cong-no-vt/` — Supplier debt (Vật Tư Materials dept)
- `/cong-no-nc/` — Supplier debt (Nhân Công Labor dept)
- `/api/cong-no/cascade-projects` — Fetch projects by ledgerType + entityIds (widened ACL: accepts 3 modules)
- `/api/thanh-toan/cascade-suppliers` — Fetch suppliers by ledgerType + entityId + projectId

### 4. Tasks (van-hanh/cong-viec)

**Models:** Task, TaskAssignment, TaskComment, Attachment

**Key Features:**
- Task creation, assignment, tracking
- Comments and attachments
- Status workflow (to-do → in-progress → done)
- Filter by assignee and status

**ACL Axis:** Dept-scoped (`UserDeptAccess`)

**Route Change:** `/cong-viec` → `/van-hanh/cong-viec` (2026-05-10; 307 redirect)

### 5. Coordination Forms (van-hanh/phieu-phoi-hop)

**Models:** CoordinationForm, CoordinationItem, CoordinationApprover

**Key Features:**
- Multi-approval workflow
- Item tracking per approval stage
- Attachment management
- Signed approval records

**ACL Axis:** Dept-scoped (`UserDeptAccess`)

**Route Change:** `/phieu-phoi-hop` → `/van-hanh/phieu-phoi-hop` (2026-05-10; 307 redirect)

### 6. Payment Planning (kế-hoạch-thanh-toán)

**Models:** PaymentRound, PaymentRoundItem

**Key Features:**
- Payment round creation per month with sequential versioning
- Item-level approval workflow (draft → submitted → approved/rejected → closed)
- Entity-Supplier-Project-Category (4×N) matrix for granular balance tracking
- Auto-fill congNo + luyKe from balance-service per ledgerType (material/labor)
- Service: `lib/payment/payment-service.ts` with entityId threading to balance-service (prevents cross-entity bleed)

**Schema (PaymentRoundItem):**
- `entityId: Int FK` — Project entity (chu thể); replaced `projectScope` enum (2026-05-15)
- `supplierId: Int FK` — Supplier or contractor
- `projectId: Int? FK` — Optional project scope
- `category: String` — Payment category (vat_tu | nhan_cong | dich_vu | khac)
- `congNo, luyKe, soDeNghi, soDuyet` — Balance fields

**Cascade UI:** Entity → Project (filtered by available in ledger_transactions) → Supplier (filtered by ledgerType + entity + project)

### 7. Authentication & Authorization

**Auth Mechanism:** NextAuth.js (session-based)

**Role System:**
- `admin` — Full system access; bypasses all ACL checks (D1)
- `leader` — Dept head; can view team + performance metrics
- `director` — Org director; can view all depts + strategic metrics
- `viewer` — Read-only access per dept

**Context:**
- `UserDeptAccess` — Maps user to viewable depts
- `AppRole` — Maps user to role + optional flags (isLeader, isDirector)
- `ModulePermission` — NEW: Per-user per-module grants (can override AppRole defaults)

### 8. Import System (lib/import/)

**Purpose:** Bulk data import from SOP Excel file.

**Adapters:** Tab-specific parsers for:
- du-an-xay-dung (projects)
- ho-tro-van-hanh (task templates)
- phieu-phoi-hop (coordination forms)
- [5 more in 2026-05-03 expansion]

**Features:**
- Dry-run validation before commit
- Auto-create serial lots during apply
- Column mapping per tab
- Error logging and rollback on failure

---

## Data Models (Prisma)

### Core Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `User` | System users | id, email, role, isLeader, isDirector |
| `AppRole` | Role definitions | id, name, description |
| `UserDeptAccess` | Dept visibility | userId, deptId |
| **ModulePermission** | **NEW: Module access** | userId, moduleKey, level |
| **ProjectPermission** | **NEW: Project override** | userId, projectId, level |
| **ProjectGrantAll** | **NEW: All-projects grant** | userId, level |
| Project | Projects | id, name, status, startDate, endDate |
| Task | Tasks | id, projectId, title, status, assigneeId |
| CoordinationForm | Approval forms | id, projectId, status, createdBy |
| PaymentRound | Payment planning rounds | id, month, sequence, status, createdBy, approvedBy |
| **PaymentRoundItem** | **Payment line items** | id, roundId, entityId, supplierId, projectId, category, congNo, luyKe, soDeNghi, soDuyet, approvedBy |
| AuditLog | Change tracking | id, action, userId, details, timestamp |

### Postgres Constraints

**NEW: CHECK constraints on permission levels (2026-05-10):**
- `module_permissions.level` IN ('read', 'comment', 'edit', 'admin')
- `project_permissions.level` IN ('read', 'comment', 'edit')
- `project_grant_all.level` IN ('read', 'comment', 'edit')

Constraints prevent invalid values at DB layer (eliminates silent denials from typos).

---

## Route Structure

### Pre-2026-05-10 (Legacy)

```
/cong-viec          → Redirects to /van-hanh/cong-viec (307)
/phieu-phoi-hop     → Redirects to /van-hanh/phieu-phoi-hop (307)
```

### Post-2026-05-10 (New Vận Hành Module)

```
/van-hanh
  /cong-viec              Module: van-hanh.cong-viec
  /phieu-phoi-hop         Module: van-hanh.phieu-phoi-hop
  /hieu-suat              Module: van-hanh.hieu-suat (placeholder)
```

### Admin Routes

```
/admin/permissions
  /modules                Module permission matrix editor
  /projects               Project permission + super-grant manager
  /import                 Data import tools
```

### Other Protected Routes

```
/du-an                    Module: du-an (project-scoped)
/cong-no-vt               Module: cong-no-vt (dept-scoped)
/cong-no-nc               Module: cong-no-nc (dept-scoped)
```

---

## Code Standards & Patterns

### Route Guards

All routes protected via `requireModuleAccess(moduleKey, opts)` in segment layout.tsx:

```typescript
// app/(app)/van-hanh/cong-viec/layout.tsx
await requireModuleAccess("van-hanh.cong-viec", { scope: "module" });
```

**CanAccessOpts requires explicit scope (no defaults):**
- `{ scope: "module" }` — Module-level only (sidebar visibility)
- `{ scope: "any" }` — No resource scope (rare)
- `{ kind: "dept", deptId }` — Dept-scoped resource
- `{ kind: "project", projectId }` — Project-scoped resource

### Module Keys

From `lib/acl/modules.ts`:

```typescript
export const MODULE_KEYS = {
  "du-an": "du-an",
  "van-hanh.cong-viec": "van-hanh.cong-viec",
  "van-hanh.phieu-phoi-hop": "van-hanh.phieu-phoi-hop",
  // ... etc
} as const;
```

Use constants, not string literals, for type safety.

### Bulk Permission Updates

Matrix editor uses transaction with 100-row batching:

```typescript
await db.$transaction(
  permissionUpdates.reduce((acc, batch) => [
    ...acc,
    ...batch.slice(0, 100).map(update => /* upsert or delete */),
  ], []),
  { maxWait: 5000, timeout: 30000 }
);
```

### Audit Logging (D2 Pattern)

Revoke permissions with explicit audit log (Prisma middleware doesn't cover composite keys):

```typescript
const deleted = await db.modulePermission.delete({
  where: { userId_moduleKey: { userId, moduleKey } },
});
await writeAuditLog({
  action: "REVOKE_MODULE_PERMISSION",
  userId: adminId,
  details: { userId, moduleKey, level: deleted.level },
});
```

---

## Testing

### Unit Tests (lib/acl/__tests__/)

- **40/40 ACL Resolver Tests:** Effective access checks per role × axis × level boundary
- **32/32 Golden Fixtures:** Role-based scenarios (admin, leader, viewer × module/dept/project axes)
- All existing dept-access tests still pass (backward compatible)

### Build Validation

- `next build` — PASS
- `tsc --noEmit` — PASS (clean, no type errors)
- `npm run test` — All tests PASS

---

## Performance Considerations

- **Sidebar Queries:** Per-request `cache()` layer limits to ≤3 Prisma queries (measured)
- **Matrix Editor:** Client-side request queue (max 1 in-flight per cell)
- **Bulk Imports:** Chunked in 100-row batches within transactions
- **Materialized Views:** NEW (Phase 5 Plan C) for performance dashboard aggregates

---

## Documentation Files

| File | Purpose | Last Updated |
|------|---------|--------------|
| `system-architecture.md` | 2-axis ACL model, data models, admin UI | 2026-05-10 |
| `code-standards.md` | Route guard patterns, module keys, ACL usage | 2026-05-10 |
| `codebase-summary.md` | This file; directory structure, core systems | 2026-05-10 |
| `project-changelog.md` | All changes; Plan A delivery notes | 2026-05-10 |
| `development-roadmap.md` | Phases 1–7, parallel execution plan, milestones | 2026-05-10 |

---

## Key Dependencies

```
Next.js 14           - App Router, Server Components
TypeScript           - Type-safe development
Prisma 5.x           - ORM + migrations
PostgreSQL 15+       - Database + CHECK constraints
NextAuth.js          - Authentication
TailwindCSS          - Styling
shadcn/ui            - Component library
React Hook Form      - Form handling
Zod                  - Schema validation
Vitest               - Unit testing
```

---

## Deployment & Migration

**Schema Migrations:**
- New models (ModulePermission, ProjectPermission, ProjectGrantAll) + CHECK constraints added 2026-05-10
- Prisma migration workaround: composite PK issue resolved via `prisma migrate resolve --rolled-back`
- Run `prisma migrate deploy` to apply

**Route Changes:**
- Old routes issue 307 (temporary) redirects; will flip to 308 (permanent) after stabilization
- No breaking changes to existing APIs; ACL is additive layer

**Seed Script:**
- Phase 5 includes script to populate default `ModulePermission` rows per AppRole defaults
- Run before prod cutover to avoid users losing visibility

---

## Unblocked Downstream Plans

**Plan B (Task Swimlane):** 🔵 Ready to start  
- Depends on: ACL resolver + `/van-hanh/cong-viec` route (both complete)
- Swimlane view with role-based column filtering

**Plan C (Performance MVP):** 🔵 Ready to start  
- Depends on: ACL resolver + `/van-hanh/hieu-suat` route (both complete)
- Performance dashboard with KPI metrics + role-based filtering

Both can execute in parallel; no code conflicts.

---

## Quick References

**Need to:**
- **Check if user can access module?** → `requireModuleAccess(moduleKey, opts)` in layout.tsx
- **Filter data by project access?** → `getViewableProjectIds(userId)` returns `{ kind: "all" | "subset" | "none"; projectIds? }`
- **Grant module permission?** → Admin UI: `/admin/permissions/modules` (matrix editor)
- **Grant project permission?** → Admin UI: `/admin/permissions/projects` (per-project or super-grant)
- **Understand the 2-axis model?** → `system-architecture.md` → Access Control Architecture
- **Implement a new route?** → `code-standards.md` → Route Guards & Access Control
- **Add a new module?** → Add key to `lib/acl/modules.ts` + update route guards + add tests

---

**Last Updated:** 2026-05-15  
**Next Update Trigger:** Plan B or C completion, or major payment/ledger changes
