# Brainstorm Summary — Vận hành Module + Granular ACL

**Date:** 2026-05-10
**Scope:** 3 features
1. ACL refactor — per-module + per-project granular RBAC
2. Task swimlane — quick "who's working on what" view on Bảng công việc
3. Performance module — track dept/individual hiệu suất

---

## Problem Statement

- RBAC hiện tại chỉ có 2 trục: `AppRole` (admin/ketoan/canbo_vt/chihuy_ct/viewer) + `UserDeptAccess` (per-dept read/comment/edit). Không grant được tới cấp module hay cấp dự án.
- "Cùng phòng nhưng quyền module khác nhau" → không expressible với schema hiện tại.
- Module Quản lý dự án cần grant per-user-per-project, không liên quan dept.
- Bảng công việc thiếu view "ai đang làm gì" — phải click từng row.
- Chưa có module theo dõi hiệu suất phòng ban / cá nhân.

---

## Final Design — 2 trục ACL độc lập

### Trục 1 — Module access (cổng cấp 1)
```prisma
model ModulePermission {
  userId    String
  moduleKey String  // "cong-no" | "du-an" | "van-hanh" | "hieu-suat" | ...
  level     String  // "none" | "read" | "edit" | "admin"
  @@id([userId, moduleKey])
}
```
- Per-user, không suy từ dept → 2 user cùng phòng có thể khác hoàn toàn.
- Sidebar render dựa trên `ModulePermission` của user.

### Trục 2 — Resource access (cổng cấp 2, per-module config)

| Module | Axis | Bảng |
|---|---|---|
| `cong-no`, `task`, `kpi` | dept-based | `UserDeptAccess` (đã có) |
| `du-an` | project-based | `ProjectPermission { userId, projectId, level }` + `ProjectGrantAll { userId, level }` (super-grant) |
| `hieu-suat` | role-based | `AppRole` + `isLeader` / `isDirector` flag |
| `sl-dt`, `import` | admin-only | check `AppRole = admin` |

**Effective check:**
```ts
canAccess(M, R) =
  modulePermission(user, M) >= "read"        // cổng 1
  AND axisCheck(user, R, config[M])          // cổng 2 theo module
```

### Module "Vận hành" (sidebar entry mới)
Chứa 3 sub-pages:
- `/van-hanh/cong-viec` — Bảng công việc hiện tại + swimlane
- `/van-hanh/phieu-phoi-hop` — phiếu phối hợp giữa phòng
- `/van-hanh/hieu-suat` — dashboard hiệu suất

---

## Three Plans

### Plan A — `260510-van-hanh-acl-refactor` (foundation, P1)
- New tables: `ModulePermission`, `ProjectPermission`, `ProjectGrantAll`
- New helpers: `lib/acl/module-access.ts`, `lib/acl/project-access.ts`, `lib/acl/effective.ts`
- Refactor sidebar render → query `ModulePermission`
- Refactor route guards → `canAccess(M, R)` everywhere
- Migration: seed `ModulePermission` cho user hiện tại từ `AppRole` (admin = all-edit, viewer = all-read, etc.)
- Admin UI: `/admin/permissions/modules`, `/admin/permissions/projects`
- **Effort:** ~3d
- **Build order:** FIRST — B & C depend on this

### Plan B — `260510-task-swimlane` (P2)
- Add view toggle on `/van-hanh/cong-viec` (đổi từ `/cong-viec` cũ)
- Swimlane: rows = users in viewable depts, cols = status (Todo/Doing/Review/Done)
- Filter: by dept (multi-select), by date range
- Card hiển thị: title, priority dot, deadline badge (red if overdue)
- **Effort:** ~1.5d
- **Depends on:** Plan A (ACL)

### Plan C — `260510-performance-mvp` (P2)
- New page `/van-hanh/hieu-suat`
- Metrics: tasks completed (count + on-time %), avg time-to-close, overdue count
- Scope: dept summary + drill-down to individual
- Filter: month/quarter/year
- ACL: role-based (leader sees own dept, director sees all, member sees own only)
- **Effort:** ~2.5d
- **Depends on:** Plan A (ACL)

---

## Build Order

1. **A** (ACL refactor) — FIRST, blocks B & C
2. **B + C** parallel sau khi A merged

---

## Risks

- **Migration rủi ro:** seed `ModulePermission` sai → user mất quyền. Mitigation: dry-run script + admin override + fallback to AppRole hierarchy nếu row missing.
- **ACL check perf:** mỗi route call → 2 queries (module + axis). Mitigation: cache trong session/middleware, batch load on layout.
- **Swimlane scale:** nếu phòng có 50+ user → wide. Mitigation: collapse empty rows, virtual scroll.

---

## Success Criteria

- Admin có thể grant/revoke per-module per-user qua UI.
- Admin grant per-project per-user cho `du-an`.
- 2 user cùng phòng có thể có sidebar khác nhau.
- Bảng công việc có toggle swimlane, hiển thị đúng task của user.
- Dashboard hiệu suất show metrics đúng theo dept user thấy được.
