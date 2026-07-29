# Codebase Summary

## Project Overview

**ngoquyyen-erp** is an enterprise resource planning (ERP) system built with Next.js 14 (App Router), TypeScript, Prisma ORM, and PostgreSQL. The system manages projects (du-án), supplier debt (cộng nợ), tasks (công việc), coordination forms (phiếu phối hợp), and administrative operations through a granular, role-based access control system.

**Latest Major Change:** 2026-07-29 vat-tu-ncc ledger single-source-of-truth (period close → `lay_hang`, PaymentRound closeRound → `thanh_toan`, derived+signable reconciliation; see §9). Previous: 2026-05-15 Payment round refactor — EntityId FK + cascade UI + 4-category pivot. Previous: 2026-05-10 Plan A — Vận hành module + 2-axis ACL

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
│       ├── vat-tu-ncc/                 # NEW: Supplier material ledger + reconciliation
│       │   └── [supplierId]/
│       │       ├── ngay/               # Daily delivery slips (qty + unitPrice/totalAmount)
│       │       ├── thang/               # Monthly grid
│       │       ├── chot-ky/            # Period close (27→26): bulk price assign → lay_hang ledger
│       │       ├── doi-chieu/          # Derived reconciliation (A/B/C) + sign/unsign
│       │       └── kiem-tra-khop/      # Admin: slip↔ledger consistency check
│       └── ...
├── lib/
│   ├── vat-tu-ncc/                     # NEW: period.ts, period-lock.ts, period-close-service.ts,
│   │                                   #      reconciliation-derive-service.ts, period-recon-check-service.ts
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
│   ├── rbac.ts                         # isAdmin helper (dynamic roles via acl/role-permissions.ts)
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

### 1. State Obligations Tracking (tai-chinh/nghia-vu-nha-nuoc)

**Purpose:** Track Vietnamese tax and social insurance obligations with opening/closing balances and period accruals.

**Key Features:**
- **Catalog (Danh mục):** 8 seeded VN obligation types (GTGT, TNDN, TNCN, Môn bài, BHXH, BHYT, BHTN, KPCĐ) with editable opening balances
- **Ledger (Sổ theo dõi):** Period-by-period accrual (`phai_tra`) and payment (`da_nop`) transactions
- **JournalEntry Sync:** Paid transactions auto-create read-only "chi" entries (refModule="state_obligation") in Nhật ký giao dịch; accrual transactions are ledger-only
- **Period Report:** Aggregated opening/period-increase/period-decrease/closing per obligation type

**Models:** `StateObligationType` (catalog), `StateObligationTxn` (ledger)

**Service Layer:**
- `lib/tai-chinh/state-obligation-service.ts` — CRUD server actions
- `lib/tai-chinh/state-obligation-internal.ts` — JournalEntry sync helpers
- `lib/tai-chinh/state-obligation-report.ts` — SQL aggregation (period reporting)

**Routes:**
- `/tai-chinh/nghia-vu-nha-nuoc/danh-muc` — Obligation type catalog grid (edit opening balances)
- `/tai-chinh/nghia-vu-nha-nuoc/so-theo-doi` — Ledger grid (create/edit/delete transactions)
- `/tai-chinh/nghia-vu-nha-nuoc/bao-cao` — Period report (read-only aggregates)

**ACL:** Admin-only module (`tai-chinh`); all sub-pages inherit parent access gate

**Seed:** `prisma/seed-state-obligations.ts` — Idempotent seeder for 8 standard obligations (run before prod cutover)

### 2. Access Control (lib/acl/)

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
- **Công nợ lũy kế** (Cumulative debt report): 8-column report (Đầu kỳ / Phát sinh / Đã trả / Cuối kỳ for TT & HĐ), grouped by Chủ thể × NCC × Công trình with subtotals; includes `dieu_chinh` transactions; accessed via parent page tab
- Debt matrix by supplier × dept
- Aging calculation and payment terms
- Debt filter by entity type (chu thể)
- Sticky table scroll for large datasets
- Payment planning with 4-category breakdown (vat_tu, nhan_cong, dich_vu, khac)
- Payment round approval workflow with entity cascade

**ACL Axis:** Dept-scoped (`UserDeptAccess`) for debt routes; Project-filtered for payment cascade
- Module keys: `cong-no-vt`, `cong-no-nc` (no third-level submodule keys as of 2026-05-17)

**Routes:**
- `/cong-no-vt/` — Supplier debt (Vật Tư Materials dept)
- `/cong-no-nc/` — Supplier debt (Nhân Công Labor dept)
- `/api/cong-no/cascade-projects` — Fetch projects by ledgerType + entityIds (ACL: cong-no-vt, cong-no-nc, thanh-toan.ke-hoach)
- `/api/thanh-toan/cascade-suppliers` — Fetch suppliers by ledgerType + entityId + projectId

**Service Layer:**
- `lib/cong-no-vt/balance-report-service.ts` — Cumulative debt report (FULL OUTER JOIN opening_balances ⋈ transactions)
- `lib/cong-no-nc/balance-report-service.ts` — Delegates to VT service

**NEW (2026-07-29):** `ledger_transactions` is now fed by two write paths for `ledgerType="material"`: (1) NCC period close (`lay_hang`, xem mục 9) và (2) PaymentRound `closeRound` (`thanh_toan`, chỉ `category="vat_tu"`, xem mục 6). `balance-report-service` đọc cùng bảng nên số liệu công nợ lũy kế và bảng đối chiếu NCC (mục 9) luôn khớp nhau — không còn 2 nguồn số song song.

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
- **NEW (2026-07-29):** `closeRound(roundId)` (approved→closed) transactionally calls `syncClosedRoundToLedger` (`lib/payment/payment-ledger-sync.ts`) which writes one `thanh_toan` `LedgerTransaction` per `PaymentRoundItem` where `category="vat_tu"` and `soDuyet > 0`; date = ngày đóng đợt. Idempotent via `ledgerTransaction.paymentRoundItemId` (1 dòng đợt ↔ tối đa 1 event). Blocked by `assertPeriodOpen` if the close date falls inside a signed NCC reconciliation period. `nhan_cong`/`dich_vu`/`khac` chưa sync (out of scope).

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

### 9. Supplier Material Reconciliation (vat-tu-ncc) — NEW 2026-07-29

**Purpose:** Single-source-of-truth flow tying daily material delivery slips → fixed close period → `ledger_transactions` → derived (not manually-entered) supplier reconciliation.

**Flow:**
1. Daily slip (`SupplierDeliveryDaily`, per NCC × công trình × ngày) — `unitPrice`/`totalAmount` are nullable until period close (accountant assigns price then, not at daily entry).
2. **Chốt kỳ** (`/vat-tu-ncc/[supplierId]/chot-ky`): fixed period 27 tháng trước → 26 tháng đích (`lib/vat-tu-ncc/period.ts`, `periodRange(year, month)`). Bulk price assignment (with prior-period price suggestion) → `commitPeriodClose` (`lib/vat-tu-ncc/period-close-service.ts`) upserts one `lay_hang` `LedgerTransaction` per slip, keyed by `LedgerTransaction.deliveryId` (idempotent, partial-unique). `entityId` on the event is derived from the slip's `Project.entityId` FK. Slips missing `projectId` are rejected at close time.
3. **Đối chiếu** (`/vat-tu-ncc/[supplierId]/doi-chieu`): `SupplierReconciliation` is a *derived snapshot* — unsigned periods compute A (opening = prior period's closing carry-over), B (Σ `lay_hang`), C (Σ `thanh_toan`) live from the ledger via `lib/vat-tu-ncc/reconciliation-derive-service.ts` (`getReconciliationView`, `listReconciliationsDerived`). Signing (`signReconciliation`) freezes the 4 total columns + a full `signedSnapshotJson` (reprint source) and **locks all writes** dated inside `[periodFrom, periodTo]` for that supplier — enforced by `assertPeriodOpen` (`lib/vat-tu-ncc/period-lock.ts`) in delivery-service, ledger-service, payment-ledger-sync, and admin ledger patch. Differences post-signing must go through a `dieu_chinh` (adjustment) event in the following period. Unsign (`unsignReconciliation`) is admin-only and restricted to the latest signed period per supplier (preserves the carry-over chain). Manual entry of `openingBalance/totalIn/totalPaid` is removed from the UI.
4. **Kiểm tra khớp** (`/vat-tu-ncc/[supplierId]/kiem-tra-khop`, admin-only): `checkPeriodConsistency` (`lib/vat-tu-ncc/period-recon-check-service.ts`) FULL OUTER JOINs slips ↔ ledger events to surface mismatches.

**Models:** `SupplierDeliveryDaily` (+`unitPrice`/`totalAmount`), `SupplierReconciliation` (now nullable totals + `signedSnapshotJson`), `LedgerTransaction` (+`deliveryId`, `paymentRoundItemId`, `qty`, `unitPriceSnapshot`), `Project.entityId` FK (source of Chủ Thể for slips without one directly).

**ACL:** Module key `vat-tu-ncc` (dept-scoped, `UserDeptAccess`); `chot-ky` write actions require `edit` level; `kiem-tra-khop` additionally requires active admin.

**Migrations:** `20260729160000_add_project_entity_and_delivery_pricing`, `20260729161000_link_ledger_to_payment_item`, `20260729162000_reconciliation_derived_snapshot`.

---

## Data Models (Prisma)

### Core Models

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `User` | System users | id, email, role, isLeader, isDirector |
| `AppRole` | Role definitions | id, name, description |
| `UserDeptAccess` | Dept visibility | userId, deptId |
| **ModulePermission** | **Module access** | userId, moduleKey, level |
| **ProjectPermission** | **Project override** | userId, projectId, level |
| **ProjectGrantAll** | **All-projects grant** | userId, level |
| Project | Projects | id, name, status, startDate, endDate, entityId? (FK → Entity, chủ thể; NEW source for vat-tu-ncc slip entity) |
| Task | Tasks | id, projectId, title, status, assigneeId |
| CoordinationForm | Approval forms | id, projectId, status, createdBy |
| PaymentRound | Payment planning rounds | id, month, sequence, status, createdBy, approvedBy |
| **PaymentRoundItem** | **Payment line items** | id, roundId, entityId, supplierId, projectId, category, congNo, luyKe, soDeNghi, soDuyet, approvedBy |
| **StateObligationType** | **NEW: Obligation catalog** | id, name, code, category (thue\|bao_hiem\|khac), openingBalance, openingDate, sortOrder, deletedAt |
| **StateObligationTxn** | **NEW: Obligation ledger** | id, typeId (FK), date, kind (phai_tra\|da_nop), amount, cashAccountId?, journalEntryId?, refNo, description, note, deletedAt |
| AuditLog | Change tracking | id, action, userId, details, timestamp |
| **SupplierDeliveryDaily** | **NEW: Daily material slip** | id, supplierId, projectId?, date, itemId, qty, unit, unitPrice?, totalAmount?, deletedAt |
| **SupplierReconciliation** | **NEW: Derived reconciliation snapshot** | id, supplierId, periodFrom, periodTo, openingBalance?/totalIn?/totalPaid?/closingBalance? (null until signed), signedBySupplier, signedDate?, signedSnapshotJson? |
| **LedgerTransaction** | **NEW fields: ledger event** | id, ledgerType, date, transactionType (lay_hang\|thanh_toan\|dieu_chinh), entityId, partyId, projectId?, itemId?, amountTt/vatTt/totalTt, deliveryId? (FK, unique), paymentRoundItemId? (FK, unique), qty?, unitPriceSnapshot? |

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

### Finance Routes (tai-chinh/*)

```
/tai-chinh
  /nghia-vu-nha-nuoc           Module: tai-chinh (admin-only)
    /danh-muc                 Obligation type catalog
    /so-theo-doi              Obligation ledger
    /bao-cao                  Period report
  /[other finance sub-routes]
```

### Other Protected Routes

```
/du-an                    Module: du-an (project-scoped)
/cong-no-vt               Module: cong-no-vt (dept-scoped)
/cong-no-nc               Module: cong-no-nc (dept-scoped)
/vat-tu-ncc               Module: vat-tu-ncc (dept-scoped) — NEW 2026-07-29
  /[supplierId]/ngay          Daily delivery slips
  /[supplierId]/thang         Monthly grid
  /[supplierId]/chot-ky       Period close (27→26), requires edit level
  /[supplierId]/doi-chieu     Derived reconciliation, sign/unsign
  /[supplierId]/kiem-tra-khop Slip↔ledger consistency check, admin-only
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

### Test Infrastructure (Phase 1)

**Vitest Config (`vitest.config.mts`)** — Three projects:
- `unit` — Fast unit tests in `lib/**/*.test.ts`, `test/unit/**/*.test.ts` (no DB)
- `integration` — Real DB integration tests in `test/integration/**`, `test/security/**`, `test/performance/**` (serial, forks pool)
- `load` — On-demand load suite in `test/performance/load/**` (not part of CI; manual only via `npm run test:load`)

**Playwright Config (`playwright.config.ts`)** — E2E tests in `e2e/`, testDir mode, port 3333

**Test Database Helpers (`test/helpers/`):**
- `test-db.ts` — `truncateAll()` for test DB cleanup (guards on `*_test` DB names)
- `prisma-mock.ts`, `session-mock.ts`, `fixtures.ts` — Shared test utilities

**Environment:** `.env.test` for dedicated `ngoquyyen_erp_test` PostgreSQL database

### Unit + Integration Tests (Phases 2–3)

- **339 unit tests** covering ~30 named `lib/` services (payment, ACL, import, ledger)
- **Hotspots covered:** Payment round, ACL resolver, import engine, balance-service, dept-access
- **Line coverage (lib/):** 30.93% achieved (1303/4212 lines) — 60% project threshold is a known shortfall (out-of-scope services documented)
  - **State Obligations Service (NEW):** 14 unit tests covering CRUD operations, JournalEntry sync, period aggregation (mocked Prisma + $queryRaw)
- **Test status:** All 339 tests PASS

### E2E Tests (Phase 4)

**6 Playwright specs** for Server-Action flows:
- `login.spec.ts` — Authentication workflow
- `import-export.spec.ts` — Bulk import + export cycle
- `kanban-task.spec.ts` — Task swimlane interactions
- `payment-round.spec.ts` — Payment round approval + entity cascade
- `sl-dt-cell-edit.spec.ts` — Inline cell editing on báo cáo SL/DT
- `e2e/security/` — 4 specs for authz matrix, auth-bypass, IDOR, SSE stream validation

### Security Tests (Phase 5)

- **Authorization Matrix (`e2e/security/authz-matrix.spec.ts`)** — Syntactic checks for 2-axis ACL per role
- **Auth Bypass (`e2e/security/auth-bypass.spec.ts`)** — Attempt unauthenticated route access
- **IDOR (`e2e/security/idor.spec.ts`)** — Cross-user resource access attempts
- **SSE Stream (`e2e/security/notifications-stream.spec.ts`)** — Real-time notification stream isolation
- **ACL Enforcement Unit (`test/security/acl-enforcement.test.ts`)** — 50+ programmatic ACL checks
- **Manual Checklist:** `plans/260516-comprehensive-test-suite/SECURITY-MANUAL-REVIEW.md` for config + crypto audits

### Performance Tests (Phase 6)

**N+1 Query Count Suite (`test/performance/`):**
- `query-count.helper.ts` — pg.Pool wrapper counting real queries through extended Prisma client
- `n-plus-one.test.ts` — Tests: dashboard (8 queries), ledgerSummary (1), aggregateMonth (2), taskBoard (9)
- Result: **No N+1 patterns found** — all counts constant w.r.t. row volume
- `seed-perf-data.ts` — Seeded perf test data; `baseline.json` stores p95 thresholds

**Load Suite (`test/performance/load/`):**
- `endpoints.load.test.ts` — Autocannon-based load tests for critical paths
- `autocannon-runner.ts` — Test runner with customizable concurrency/duration
- **On-demand only** — run via `npm run test:load` (requires live server); not part of PR pipeline

### CI Pipeline (Phase 7)

**GitHub Actions (`.github/workflows/test.yml`)**

3 jobs:

1. **Unit + Integration Job**
   - Runs `npm run test` (unit blocking)
   - Runs `npm run test:integration` (integration blocking)
   - Runs `npm run test:coverage` (informational; continues on error — 60% threshold not yet met)
   - PostgreSQL 16 service container
   - Uploads coverage artifacts

2. **E2E + Security Job**
   - Starts Next.js dev server on port 3333
   - Runs `npx playwright test` (E2E blocking)
   - Runs security tests (included in e2e run)
   - Caches Playwright browsers by resolved version
   - Uploads test report + failure videos

3. **Perf Job (Non-Blocking)**
   - Informational; reports query counts
   - Does NOT run load suite (deferred to nightly manual runs)

### npm Scripts

| Script | Description |
|--------|-------------|
| `npm run test` | Unit tests (Vitest unit project, ~3s) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:coverage` | Unit tests + coverage report (generates `coverage/` HTML) |
| `npm run test:integration` | Integration + security + perf unit tests (requires test DB) |
| `npm run test:perf` | Alias for `npm run test:integration test/performance` |
| `npm run test:load` | On-demand load suite (requires `RUN_LOAD=1` + live server on :3333) |
| `npm run test:e2e` | Playwright E2E tests (requires `next dev` or built app on :3333) |

### Build Validation

- `next build` — PASS
- `tsc --noEmit` — PASS (clean, no type errors)
- `npm run test` — 339 tests PASS
- `npm run test:integration` — All integration + security + perf tests PASS

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

**Last Updated:** 2026-07-29 (added vat-tu-ncc ledger single-source-of-truth flow; see §9)
**Next Update Trigger:** Plan B or C completion, or major payment/ledger changes
