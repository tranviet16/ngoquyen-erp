---
title: "Dynamic RBAC — vai trò động theo module"
status: completed
created: 2026-05-21
---

# Dynamic RBAC — Vai trò động theo module

## Mục tiêu
Cho admin tạo/sửa/xóa vai trò qua UI. Mỗi vai trò có ma trận quyền theo 18 module
(read/comment/edit/admin). Bỏ hệ phân cấp số cứng (`ROLE_HIERARCHY`), thay bằng
bảng DB. Hành vi của 14 user hiện tại KHÔNG đổi sau migration.

## Quyết định kiến trúc (chốt)
- 2 bảng mới: `Role` (slug id, name), `RolePermission` (`[roleId, moduleKey]` → level).
- `User.role` giữ kiểu `String` (soft-ref tới `Role.id`), không FK cứng.
- Write-guard ở service vẫn **role-based** (không cần `userId`) — chỉ đổi nguồn:
  `requireRole(role, X)` → `await requireRoleModuleAccess(role, moduleKey, minLevel)`,
  đọc từ `RolePermission` (cache per-request). Quy tắc map: `"admin"`→`"admin"`,
  còn lại (`ketoan/canbo_vt/chihuy_ct/viewer`)→`"edit"`. `moduleKey` suy ra từ thư mục.
- Vai trò `admin` vẫn là role đặc biệt: D1 short-circuit `role === "admin"` giữ nguyên
  (fail-safe). Ma trận của admin chỉ mang tính hiển thị.
- `getDefaultModuleLevel` chuyển sang async, đọc DB thay vì bảng hardcode.

## Phases

| # | Phase | Effort | Status |
|---|-------|--------|--------|
| 1 | [Schema + migration + seed](phase-01-schema-migration-seed.md) | 3h | completed |
| 2 | [Data-driven ACL core](phase-02-acl-core.md) | 3h | completed |
| 3 | [Convert write guards](phase-03-convert-guards.md) | 5h | completed |
| 4 | [Admin role-management UI](phase-04-admin-ui.md) | 6h | completed |
| 5 | [Test + verify](phase-05-test-verify.md) | 3h | completed |

## Phụ thuộc
1 → 2 → 3 → 4 → 5 (tuần tự; phase 4 chỉ cần 1+2, nhưng để sau 3 cho an toàn).

## Out of scope
- Per-user module override (đã có sẵn `ModulePermission` — không đụng).
- Đổi `User.role` thành FK cứng.
- Phân quyền dự án/phòng ban (Trục 2 — giữ nguyên).
- Đổi nghĩa của vai trò `admin` (vẫn toàn quyền qua short-circuit).
