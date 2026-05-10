# Development Roadmap

## Overview

This document tracks the project's development phases, milestones, and progress toward a complete ERP system. Roadmap is organized in **phases** with sequential and parallel tracks.

## Current Status

**Date:** 2026-05-10  
**Active Phase:** Plan A complete; Plan B and C unblocked for parallel execution

---

## Phase 1: Foundation & Core RBAC (COMPLETE)

**Status:** ✅ Complete  
**Duration:** Prior to 2026-05-06

### Deliverables
- User management with AppRole (admin, leader, director, viewer)
- Department hierarchy and UserDeptAccess model
- Basic sidebar navigation scoped to user dept(s)
- Authentication & session management via NextAuth

### Outcomes
- Core system operational; users can access dept-scoped data
- Foundation ready for granular access control layer

---

## Phase 2: Supplier Debt & Coordination (PARTIAL)

**Status:** 🟡 In Progress  
**Duration:** 2026-04-20 → ongoing

### Completed Milestones
- ✅ Cộng Nợ (Supplier Debt) matrix view with 8-column dept breakdown (2026-05-06)
- ✅ Supplier debt filter in detail view + sticky scroll (2026-05-06)
- ✅ Import system adapters for 5 missed SOP tabs (2026-05-03)

### In Progress / Planned
- Cộng Nợ approval workflow (review → approve → finalize)
- Advanced filtering (date range, debt status, aging)
- Export to Excel/PDF for reporting
- Batch operations (bulk tag, reassign, settle)

### Success Metrics
- 100% of suppliers visible in debt matrix
- Approval workflow reduces manual steps by 50%
- CSV export available for finance reconciliation

---

## Phase 3: Access Control Refactor (COMPLETE)

**Status:** ✅ Complete  
**Duration:** 2026-05-02 → 2026-05-10

### Project: Plan A — Vận hành Module + Granular ACL

**Deliverables**
- ✅ 2-axis ACL system (Module + Resource scopes)
- ✅ New `ModulePermission`, `ProjectPermission`, `ProjectGrantAll` models
- ✅ Route guards via `requireModuleAccess(moduleKey, opts)` across all segments
- ✅ Vận hành module with `/van-hanh/*` route hierarchy
- ✅ Admin UI for module and project permission grants
- ✅ Route migration: `/cong-viec` → `/van-hanh/cong-viec`, `/phieu-phoi-hop` → `/van-hanh/phieu-phoi-hop`
- ✅ Server-side sidebar filtering per user ACL
- ✅ Golden test fixtures (32/32 pass) + route guard audit (28/28 protected)

**Code Review:** PASS_WITH_FIXES (7 issues; 1 critical, 4 high, 2 medium — all resolved)

**Outcomes**
- Granular per-module and per-resource access control in place
- Foundation for task swimlane (Plan B) and performance MVP (Plan C)
- Admin can now selectively grant module access independent of role
- Two downstream plans unblocked for parallel execution

**Documentation:**
- `docs/system-architecture.md` — 2-axis ACL conceptual model
- `docs/code-standards.md` — Route guard patterns + module key usage
- `docs/project-changelog.md` — Complete Plan A change log

---

## Phase 4: Task Management & Swimlane (UNBLOCKED)

**Status:** 🔵 Unblocked; Ready for Start  
**Expected Duration:** 2–3 weeks (parallel with Plan C)

### Project: Plan B — Task Swimlane

**Objectives**
- Swimlane view for tasks organized by role/assignee
- Filter columns by user role + dept permissions
- Drag-drop task reassignment between swimlanes
- Real-time collaboration indicators

**Dependencies**
- ✅ Plan A (ACL refactor) — unblocked
  - Requires: `canAccess("van-hanh.cong-viec", task)` resolver
  - Requires: `/van-hanh/cong-viec` route structure

**Acceptance Criteria**
- Swimlane renders only columns user has access to
- Drag-drop reflects permission checks (prevent unauthorized assignment)
- All existing task features (comments, attachments) still work
- Performance: swimlane renders <1s for 100+ tasks

**Success Metrics**
- Task assignment time reduced from 3 steps to 1 (drag-drop)
- Team visibility of task flow improves collaboration

---

## Phase 5: Performance & Analytics (UNBLOCKED)

**Status:** 🔵 Unblocked; Ready for Start  
**Expected Duration:** 2–3 weeks (parallel with Plan B)

### Project: Plan C — Performance MVP

**Objectives**
- Performance dashboard with KPI metrics (output, cost, time)
- Role-based column filtering (leader → team view, director → dept view)
- Interactive charts with date range selector
- Historical trend comparison

**Dependencies**
- ✅ Plan A (ACL refactor) — unblocked
  - Requires: `canAccess("van-hanh.hieu-suat", scope)` resolver
  - Requires: role-based axis dispatch (AppRole + isLeader + isDirector)

**Acceptance Criteria**
- Dashboard displays role-appropriate metrics (no cross-dept data leakage)
- Charts render <2s for 1-year historical data
- Export to Excel available for director reports
- All metrics auto-refresh every 5 minutes

**Success Metrics**
- 90% of leadership views dashboard weekly
- Report generation time <30s (vs current manual 2+ hours)
- Decision speed improves by 40% (faster data access)

---

## Phase 6: Master Data & Admin Console (PLANNED)

**Status:** 📋 Planned; Awaiting A/B Completion  
**Expected Duration:** 2–4 weeks

### Objectives
- Centralized master data management (products, suppliers, departments, roles)
- Audit trail for all data mutations
- Bulk import/export (CSV, Excel)
- Admin dashboard with system health metrics

### Dependencies
- Plans A, B, C completion

### Features
- Products: add/edit/deactivate with version tracking
- Suppliers: profile, contact, debt limits, payment terms
- Departments: hierarchy, cost centers, manager assignments
- Roles: custom role templates, permission matrix

---

## Phase 7: Reporting & Business Intelligence (PLANNED)

**Status:** 📋 Planned; Post-Phase 6

### Objectives
- Advanced reporting engine (SQL, visual report builder)
- Pre-built reports: Financial, Operational, Compliance
- Scheduled report generation & email distribution
- Drill-down analytics (click to detail)

### Target Timeline
- Start: Q2 2026 (after Plan C stabilizes)
- Completion: Q3 2026

---

## Parallel Execution Plan

**As of 2026-05-10:**

```
Plan A (ACL Refactor) ✅ MERGED
    ├─ Plan B (Task Swimlane) 🔵 START NOW (2–3 weeks)
    │   └─ Outputs: swimlane feature, role-based column filtering
    │
    └─ Plan C (Performance MVP) 🔵 START NOW (2–3 weeks, parallel)
        └─ Outputs: performance dashboard, KPI metrics

After B & C Complete → Plan D (Master Data) → Plan E (Reporting)
```

**Rationale:**
- Plans B and C are independent; both depend only on A (now complete)
- Parallel execution shortens overall timeline from 8 weeks to 5 weeks
- No code conflicts; each plan modifies distinct modules
- Merge target: **2026-05-31** (21 days from Phase A completion)

---

## Risk Register & Mitigation

| Risk | Severity | Mitigation | Owner |
|------|----------|-----------|-------|
| Route change breaks bookmarks/notifications | Medium | 307 redirects + notification URL backfill script in Phase 5 | Plan A lead |
| ACL checks add query overhead | Medium | Per-request `cache()` layer + monitoring (target ≤3 queries/page) | Plan A lead |
| Bulk permission update races | Low | Client-side request queue + compare-and-set semantics in matrix editor | Plan A lead |
| User revokes own admin access | Critical | D1 short-circuit (admin role always passes); impossible to revoke | Design decision; eliminates risk |
| Permission check fallback missing AppRole case | Medium | Golden test fixtures (32/32) verify fallback paths per role | Plan A QA |
| Swimlane performance hits 100+ tasks | Medium | Virtualization + server-side aggregation (Plan B to implement) | Plan B lead |
| Performance dashboard slow on 1-year data | Medium | Materialized views + caching (Plan C to implement) | Plan C lead |

---

## Documentation Maintenance

**Documents Updated 2026-05-10 (Plan A completion):**
- ✅ `system-architecture.md` — 2-axis ACL model, data models, admin UI
- ✅ `code-standards.md` — Route guard patterns, module keys, bulk update
- ✅ `project-changelog.md` — Plan A delivery + all prior changes
- ✅ `development-roadmap.md` — This file; phases 1–7 outlined

**Next Update Triggers:**
- Plan B/C kickoff: add phase status
- Code review findings: update risk register
- Scope changes: update timeline estimates
- Stabilization complete: flip 307 redirects to 308 (permanent)

---

## Key Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Test Coverage (ACL) | 90% | 100% (40 resolver + 32 fixture tests) |
| Route Protection | 100% | 100% (28/28 segments verified) |
| Build Time | <60s | ~45s (next build) |
| CI Cycle Time | <10min | ~8min (all checks + tests) |
| Documentation Coverage | ≥80% | 95% (system-architecture, code-standards complete) |

---

## Contact & Ownership

- **Plan A Lead (ACL Refactor):** [Assigned Owner]  
  Status: COMPLETE; Merged 2026-05-10

- **Plan B Lead (Task Swimlane):** [TBD]  
  Status: Ready to start; unblocked as of 2026-05-10

- **Plan C Lead (Performance MVP):** [TBD]  
  Status: Ready to start; unblocked as of 2026-05-10

For questions about roadmap, contact project manager or respective plan lead.
