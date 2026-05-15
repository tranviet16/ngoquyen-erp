# Project Changelog

All notable changes to ngoquyyen-erp are documented below. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Planned
- Plan B: Task Swimlane — swimlane view for tasks with role-based column filtering
- Plan C: Performance MVP — performance dashboard with role/director-based access

---

## [2026-05-15] — Payment Round Refactor: EntityId FK + Cascade UI + 4-Category Pivot

### Added

**Schema Changes**
- `PaymentRoundItem.entityId: Int FK` — References Entity (chu thể) instead of enum projectScope
- Foreign key constraint ensures entity validity; indexes on (roundId, entityId) for query performance

**API Cascade Endpoints**
- `GET /api/thanh-toan/cascade-suppliers` — Query: ledgerType + entityId + optional projectId → returns distinct suppliers from ledger_transactions
  - Handles all ledger types (material, labor); labor short-circuits to `[]` (uses Contractor, not Supplier)
  - Falls back to all active suppliers when ledgerType=all
- Modified `GET /api/cong-no/cascade-projects` — Now widened ACL to accept any of 3 modules: cong-no-vt.chi-tiet, cong-no-nc.chi-tiet, **thanh-toan.ke-hoach**
  - Filters projects by entityIds (optional, multi-select) + ledgerType

**Cascade UI**
- Form flow: Select Entity (chu thể) → Projects (filtered by ledgerType + entity) → Suppliers (filtered by ledgerType + entity + project)
- Payment summary now pivots on 4 categories × N entities (was 4 × 2 projectScope enum)

### Changed

**Service Layer**
- `lib/payment/payment-service.ts` — `autoFillBalances()` now requires entityId parameter
  - Threads entityId to balance-service calls: `getOutstandingDebt()` and `getCumulativePaid()`
  - Prevents cross-entity balance bleed (latent bug fix)
- Category mapping unchanged: vat_tu/nhan_cong have ledger backing; dich_vu/khac default to 0

**Data Model**
- `PaymentRoundItem` columns stable; only backing FK changed (projectScope enum → entityId Int)
- Existing payment rounds unaffected; data migration handles old records

### Fixed

- **Cross-Entity Bleed:** autoFillBalances now explicitly filters by entityId when querying ledger tables
- **ACL Granularity:** cascade-projects endpoint now respects payment module access independently from debt modules

### Migration

- No breaking schema change to client-facing APIs
- Existing payment rounds with project-scoped logic continue to work
- New cascade endpoints support entity-filtered supplier selection

---

## [2026-05-10] — Plan A: Vận hành Module + ACL Refactor

### Added

**Core ACL System**
- New `lib/acl/` module with granular access control:
  - `modules.ts` — Module key registry and per-module config (level sets, axis types)
  - `effective.ts` — 2-axis access resolver (`canAccess`, `getViewableProjectIds`)
  - `guards.ts` — Route guard function `requireModuleAccess` for segment protection
  - `module-access.ts` — Module-level (Trục 1) axis logic
  - `project-access.ts` — Project-level (Trục 2) axis logic for `du-an` module
  - `role-defaults.ts` — AppRole fallback defaults when explicit permission row missing
  - `module-labels.ts` — Display labels for modules and levels
  - `_user.ts` — User context extraction utilities

**Data Models**
- `ModulePermission(userId, moduleKey, level)` — Per-user per-module access grants with Postgres CHECK constraint
- `ProjectPermission(userId, projectId, level)` — Per-user per-project explicit overrides for `du-an` axis
- `ProjectGrantAll(userId, level)` — Super-grant for user across all projects; overridable by ProjectPermission rows (D3)

**Vận hành Module (Operations)**
- New route hierarchy under `/van-hanh`:
  - `/van-hanh/cong-viec` — Task management (moved from `/cong-viec`)
  - `/van-hanh/phieu-phoi-hop` — Coordination forms (moved from `/phieu-phoi-hop`)
  - `/van-hanh/hieu-suat` — Performance dashboard (placeholder; real impl in Plan C)
- Sidebar refactored as server component with ACL filtering per nav item
- 19 new layout.tsx guards protecting module routes across `(app)` segment hierarchy

**Admin Interface**
- `/admin/permissions/modules` — Excel-like matrix editor for granting/revoking module access per user
  - Bulk-editable grid with per-module level dropdowns
  - Batched transaction support for atomic updates
- `/admin/permissions/projects` — Dual-panel interface for `du-an` module permissions:
  - Per-project explicit grants (ProjectPermission)
  - Super-grant (ProjectGrantAll) with override visual indicators

**Testing & Validation**
- 40/40 vitest cases for ACL effective resolver
- 32/32 golden ACL fixture tests (3 roles × 3 axes × level boundaries)
- Route guard audit: all 28 segments verified protected
- Postgres CHECK constraints on module/project permission levels

### Changed

**Route Migration**
- `/cong-viec` → `/van-hanh/cong-viec` (307 redirect during cutover)
- `/phieu-phoi-hop` → `/van-hanh/phieu-phoi-hop` (307 redirect during cutover)
- Redirects will be upgraded to 308 (permanent) after stabilization

**Sidebar Structure**
- "Cộng tác" renamed to "Vận hành" with 3 sub-items under new group
- Navigation items filtered server-side per `canAccess` checks
- No client-side ACL filtering; all visibility server-determined

**Prisma Schema**
- Added 3 new models: `ModulePermission`, `ProjectPermission`, `ProjectGrantAll`
- Migration includes Postgres CHECK constraints for level validation
- Composite PK constraints on `(userId, moduleKey)` and `(userId, projectId)` with shadow DB handling workaround

### Fixed

- **Code Review:** 7 issues resolved (1 critical, 4 high, 2 medium):
  - Critical: Composite PK audit bypass → explicit `bypassAudit + writeAuditLog` pattern per D2
  - High: Missing default fallback cases (added AppRole fallback path in all axes)
  - High: Role-axis scope guard weaknesses (strengthened type-level scope validation)
  - High: ProjectGrantAll override semantics (clarified D3 resolver with explicit priority)
  - High: Type narrowing gaps in `canAccess` options (discriminated union with exhaustiveness check)
  - Medium: Sidebar query count → added per-request `cache()` layer (target ≤3 queries)
  - Medium: Golden fixture coverage (expanded from 15 → 32 test cases)

### Deprecated

- Direct role checks for module visibility (use `requireModuleAccess` instead)
- Client-side permission filtering in components (all visibility server-determined)

### Removed

- `"none"` level from ACCESS_LEVELS enum (revoke = delete row, not level="none")

### Security

- Admin role (`user.role === "admin"`) short-circuits all ACL checks (D1), preventing admin lockout
- Postgres CHECK constraints enforce valid level values at DB layer
- Audit logging via explicit `writeAuditLog` (Prisma middleware doesn't cover composite-key tables per decision D2)
- Route guards (`requireModuleAccess`) mandatory on all module entry points
- Per-request `cache()` in loaders prevents permission check leakage across requests

### Technical Details

**Key Decisions:**
- **D1 — Admin Short-Circuit:** Users with `role = "admin"` bypass all module checks automatically
- **D2 — Revoke = Delete:** No `level = "none"` rows; revoke = delete with explicit audit log
- **D3 — Explicit Override:** `ProjectPermission` rows override `ProjectGrantAll` even when level is lower
- **D4 — Per-Module Level Set:** Module-specific valid level dropdown options (admin-only → `{admin}`; project-based → `{read, comment, edit}`)
- **D5 — Bulk = Matrix:** Admin UI uses Excel-like matrix for bulk updates, not "apply same level to selection"
- **D6 — Scale Assumption:** ≤20 users assumed over 1–2 years; no pagination/virtualization

**Schema Migration Workaround:**
- Prisma migration for composite PK `(userId, moduleKey)` hit internal shadow DB ordering bug
- Resolved via `prisma migrate resolve --rolled-back` + manual SQL reapply (per Prisma docs)
- Affects Phase 1 schema add + Phase 5 notification backfill migration

**Audit Middleware Limitation:**
- Prisma `$extends` client covers existing tables but NOT composite-key tables
- Decision: Manual `bypassAudit + writeAuditLog` calls in permission action handlers

### Dependencies Unblocked

- **Plan B (Task Swimlane):** Now unblocked; ready for parallel execution
  - Depends on `canAccess("van-hanh.cong-viec", task)` resolver + new route structure
  - No code conflicts; ACL helpers are foundational + non-interfering
- **Plan C (Performance MVP):** Now unblocked; ready for parallel execution
  - Depends on `canAccess("van-hanh.hieu-suat", scope)` + role-based axis
  - No code conflicts; leverages existing AppRole role/director flags

### Build Status

- `next build` — PASS
- `tsc --noEmit` — PASS (clean)
- `npm run test` — 40/40 ACL resolver tests + 32/32 golden fixtures PASS
- All existing dept-access tests still PASS
- No breaking changes to public APIs (ACL is additive layer)

### Migration Notes

**For Upgrading:**
1. Run `prisma migrate deploy` (includes ModulePermission, ProjectPermission, ProjectGrantAll schema + CHECK constraints)
2. Run seed script to populate default `ModulePermission` rows per AppRole defaults (Phase 5 scripts)
3. Old routes (`/cong-viec`, `/phieu-phoi-hop`) will auto-redirect; test in staging before prod
4. Audit DB for hard-coded URLs in task/coordination form text columns; backfill if needed
5. Verify sidebar visibility per user matches expected module grants

**For Development:**
- All module access now requires explicit `requireModuleAccess(moduleKey, opts)` guard
- Route guard call signature requires explicit scope (no defaults)
- Refer to `docs/code-standards.md` for route guard pattern + examples

---

## [2026-05-06] — Supplier Debt (Cộng Nợ) Enhancement

### Added
- Multi-axis debt breakdown: 8-column matrix per supplier showing dept-level debt split
- Supplier filter in debt detail view
- Server-side data aggregation for performance

### Changed
- Debt detail view now filters by selected entity (chu thể)
- Sticky table header on vertical scroll

---

## [2026-05-03] — Import System Refactor

### Added
- Expanded import adapters across 5 missed tabs in SOP file
- Auto-create serial lot records (`serial_lien_tuc`) during import apply
- New views for materialized import data (`du_an_xay_dung_view`, etc.)

### Fixed
- Composite PK handling in du-an-xay-dung adapter
- Missing column mappings in coordination form adapter

---

## Earlier Releases

See git history for releases prior to 2026-05-03.
