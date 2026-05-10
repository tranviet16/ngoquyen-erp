---
title: Vận hành module + granular ACL refactor (Plan A)
description: >-
  Add ModulePermission (per-user per-module) + ProjectPermission (per-user per-project)
  layers on top of existing UserDeptAccess. Refactor sidebar, route guards, and admin UI.
  Foundation for task swimlane (Plan B) and performance MVP (Plan C).
status: completed
priority: P1
created: 2026-05-10T00:00:00.000Z
completed: 2026-05-10T23:59:59.000Z
blocks: [project:260510-task-swimlane, project:260510-performance-mvp]
---

# Vận hành module + granular ACL refactor

## Overview

Thêm 2 trục ACL độc lập trên hệ thống RBAC hiện tại (AppRole + UserDeptAccess):

- **Trục 1 — Module access:** `ModulePermission(userId, moduleKey, level)` — cổng cấp 1, quyết định user thấy module nào trên sidebar và route được phép vào.
- **Trục 2 — Resource access:** axis check theo per-module config:
  - `du-an` → `ProjectPermission(userId, projectId, level)` + `ProjectGrantAll(userId, level)` super-grant.
  - `cong-no-vt`, `cong-no-nc`, `task`, `coordination` → `UserDeptAccess` (đã có).
  - `hieu-suat` → role-based (`AppRole` + `isLeader` + `isDirector`).
  - `sl-dt`, `admin/*`, `master-data` → admin-only.

Effective check: `canAccess(M, R) = modulePermission(user, M) >= "read" AND axisCheck(user, R, config[M])`.

Đồng thời tạo sidebar entry **"Vận hành"** chứa 3 sub-pages (`/van-hanh/cong-viec`, `/van-hanh/phieu-phoi-hop`, `/van-hanh/hieu-suat`) — cong-viec/phieu-phoi-hop chuyển từ entry rời ở "Cộng tác" sang.

Brainstorm summary: [brainstorm-summary.md](./brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema & Migration](./phase-01-schema-migration.md) | Completed |
| 2 | [ACL Helpers & Effective Resolver](./phase-02-acl-helpers.md) | Completed |
| 3 | [Sidebar & Route Guards](./phase-03-sidebar-route-guards.md) | Completed |
| 4 | [Admin Permission UI](./phase-04-admin-permission-ui.md) | Completed |
| 5 | [Data Seed & Cutover](./phase-05-data-seed-cutover.md) | Completed |

## Key Decisions

Locked via brainstorm + validation interview (2026-05-10):

- **D1 — Admin role short-circuits `canAccess`:** `if (user.role === "admin") return true` at top. Admin không thể bị restrict per-module. (Đơn giản, không footgun "min 1 admin").
- **D2 — Revoke = delete row:** không lưu `level="none"` row. Missing row → fallback theo `AppRole` table. Audit log giữ lịch sử grant/revoke.
- **D3 — `ProjectPermission` row override `ProjectGrantAll`** kể cả khi level thấp hơn. Resolver: `if perProjectRow exists → dùng row đó; else dùng grantAll`. Cho phép case "edit all except P5 read".
- **D4 — Per-module valid level set:** Mỗi module có dropdown options riêng theo axis. Admin-only modules: `{ admin }`. Dept/project: `{ read, comment, edit }`. Role/open: `{ read }`. Bỏ `"none"` khỏi ACCESS_LEVELS.
- **D5 — Bulk = matrix editor:** Chế độ edit Excel-like trên grid, commit batched. Không phải "same-level for selected".
- **D6 — Scale assumption:** ≤20 users trong 1-2 năm tới → không cần virtualization/pagination.

Schema & code-level decisions:

- **`ModulePermission` per-user, không suy từ dept** — same-dept users có thể có sidebar khác nhau.
- **`ProjectPermission` per-user-per-project + `ProjectGrantAll` super-grant** — module du-an không dùng UserDeptAccess.
- **Module key constants + per-module level domain** trong `lib/acl/modules.ts` — type-safe.
- **`canAccess` requires explicit scope** — không default-true khi `deptId/projectId == null`. Signature: `canAccess(userId, moduleKey, { minLevel, scope: "module" | "any" | { kind: "dept", deptId } | { kind: "project", projectId } })`.
- **`getViewableProjectIds` returns tagged union** `{ kind: "all" | "subset" | "none" }`, không sentinel string.
- **Audit log:** Verify Prisma audit middleware đã wrap `module_permissions` / `project_permissions` trước khi viết manual AuditLog (Phase 4 có verification step).
- **Sidebar render:** server component, query `canAccess` per nav item, no client-side filter.
- **"Vận hành" group:** rename "Cộng tác" → "Vận hành"; move `/cong-viec` → `/van-hanh/cong-viec`, `/phieu-phoi-hop` → `/van-hanh/phieu-phoi-hop`; add new `/van-hanh/hieu-suat` (placeholder, real impl in Plan C).
- **Redirects:** dùng `permanent: false` (307) trong cutover window đầu, flip thành `true` (308) sau khi ổn định.

## Dependencies

- **Blocks:** Plan B (task-swimlane), Plan C (performance-mvp) — both expect `canAccess` resolver + new `/van-hanh/*` route prefix.
- **Internal:** Extends `lib/dept-access.ts` (existing), `lib/rbac.ts` (existing). No replacement — additive.

## Risks

| Risk | Mitigation |
|------|------------|
| Seed `ModulePermission` sai → user mất quyền | Dry-run script + golden test cases (admin/viewer/canbo_vt fixtures) trong Phase 5. Fallback resolver dùng AppRole defaults nếu row missing. |
| Route prefix change phá bookmark/notification link | next.config.ts redirects (`permanent: false` đầu) + Phase 5 backfill notification URLs trong DB + audit `lib/task/*`, `lib/coordination-form/*` cho hard-coded URL strings. |
| Per-route ACL check thêm query → latency | React `cache()` per loader. Phase 3 có verification step: render sidebar → đếm Prisma queries (target ≤3 cho user thường). |
| Bad `level` value (typo, manual SQL) → silent denial | Postgres CHECK constraint trên `module_permissions.level` + `project_permissions.level` + `project_grant_all.level`. |
| Admin tự khoá / lockout | D1 (admin role short-circuit) loại risk này hoàn toàn. Không cần "min 1 admin" check. |
| Audit middleware double-write | Phase 4 step 1 verify middleware coverage trước khi viết manual AuditLog. Nếu middleware đã ghi → drop manual writes. |
| Bulk update partial failure | `prisma.$transaction` chunked 100 rows/batch trong Phase 4. |
| Debounce race trong matrix editor | Client-side request queue per `(userId, moduleKey)` cell — chỉ 1 request in-flight, latest pending dùng compare-and-set. |
| Rolling deploy 30s gap (old pod 404 trên `/cong-viec`) | Phase 5 step 3: stage rollout — deploy NEW route trước (cong-viec vẫn live), redirect ở pod thứ 2, gỡ old route ở deploy thứ 3. |
| `verify-acl-parity` self-referential (so chính canAccess vs fallback) | Phase 5 thay bằng golden test fixtures (3-4 user role × 8-10 routes), hand-curated expected outcomes. |

## Success Criteria

- [x] 2 user cùng phòng có `ModulePermission` khác → sidebar khác nhau.
- [x] User có `ProjectPermission(P1, edit)` + không có `ProjectGrantAll` → thấy P1, không thấy P2.
- [x] User có `ProjectGrantAll(edit)` → thấy mọi project.
- [x] `/van-hanh/cong-viec` reachable; old `/cong-viec` redirect đúng.
- [x] `/admin/permissions/modules` và `/admin/permissions/projects` chỉ admin vào được.
- [x] Migration chạy trên DB hiện tại không drop quyền của user nào (verified via dry-run diff).
- [x] `npx tsc --noEmit` pass + build pass + existing dept-access tests still pass.
- [x] Audit log có row cho mọi grant/revoke trong UI.

## Build Order Reminder

After this plan completes:
- Plan B `260510-task-swimlane` → uses `canAccess("van-hanh.cong-viec", task)` + new route.
- Plan C `260510-performance-mvp` → uses `canAccess("van-hanh.hieu-suat", scope)` + role-based axis.

Run B and C parallel after A is merged.

## Implementation Notes

**Delivery Date:** 2026-05-10

**Code Review Verdict:** PASS_WITH_FIXES  
Fixed 7 issues (1 critical, 4 high, 2 medium):
- Critical: Composite PK audit bypass → resolved via explicit `bypassAudit + writeAuditLog` per D2 revoke pattern.
- High (4): Missing default fallback cases, role-axis scope guard weaknesses, ProjectGrantAll override semantic ambiguity, type narrowing gaps in `canAccess` opts.
- Medium (2): Sidebar query count (added per-request `cache()` layer), golden-fixture test coverage (expanded from 15 → 32 fixtures).

**Schema Migration Issues Worked Around:**
- Prisma auto-generated migration for composite PK `(userId, moduleKey)` fails on apply due to internal ordering bug in shadow DB preparation → manual SQL `prisma migrate resolve` invoked + raw migration reapplied.
- Workaround applies to **Phase 1 migration** (schema add) + **Phase 5 notification backfill** migration.
- Not a blocker; resolved per Prisma docs with `prisma migrate resolve --rolled-back`.

**Audit Middleware Coverage:**
Per Phase 4 verification, Prisma `$extends` client covers existing `AuditLog` tables but **NOT composite PK tables** (`module_permissions`, `project_permissions`). Decision: **manual `bypassAudit + writeAuditLog` calls** added to `setModulePermission`, `setProjectPermission`, `setProjectGrantAll` actions per D2 spec (revoke = explicit delete row logged).

**Route Guard Audit Results:**
- 40/40 vitest pass (ACL effective resolver + helpers).
- 32/32 golden ACL fixtures pass (3 role × 3 axes × 3+ level boundaries).
- 0 unprotected routes (audit-route-guards.ts verified all 28 `(app)` segments).
- `next build` green, `tsc --noEmit` clean.

**Dependency Unblock:**
- Plan B (`260510-task-swimlane`): unblocked; ready for parallel start.
- Plan C (`260510-performance-mvp`): unblocked; ready for parallel start.
- No code conflicts. ACL helpers (`lib/acl/*`) and new module structure are foundational + non-interfering with task feature work or performance optimizations.
