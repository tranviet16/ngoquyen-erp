---
phase: 3
title: "Convert write guards"
status: pending
priority: P1
effort: "5h"
dependencies: [2]
---

# Phase 3: Convert write guards

## Overview
Thay ~110 lời gọi `requireRole` ở ~30 file bằng `requireRoleModuleAccess`. Xóa
`ROLE_HIERARCHY/hasRole/requireRole/AppRole/ALL_ROLES` khỏi `lib/rbac.ts`.

## Quy tắc chuyển đổi (cơ học)
- `requireRole(role, "admin")` → `await requireRoleModuleAccess(role, "<mod>", "admin")`
- `requireRole(role, <bất kỳ khác>)` → `await requireRoleModuleAccess(role, "<mod>", "edit")`
- `<mod>` suy từ thư mục file (bảng dưới). Mọi call site đã nằm trong hàm `async`.
- Đổi import: `import { requireRole } from "@/lib/rbac"` →
  `import { requireRoleModuleAccess } from "@/lib/acl/role-permissions"`.

## Bảng map file → moduleKey
| Thư mục/file | moduleKey |
|---|---|
| `lib/master-data/*-service.ts` | `master-data` |
| `lib/du-an/*-service.ts` (transaction, settings, schedule, change-order, cashflow, estimate, acceptance, contract) | `du-an` |
| `lib/cong-no-nc/labor-ledger-service.ts` | `cong-no-nc` |
| `lib/cong-no-vt/material-ledger-service.ts` | `cong-no-vt` |
| `lib/vat-tu-ncc/{reconciliation,delivery}-service.ts` | `vat-tu-ncc` |
| `lib/tai-chinh/{pr-adjustment,loan,journal,expense-category,cash-account}-service.ts` | `tai-chinh` |
| `app/(app)/admin/import/import-actions.ts` | `admin.import` |
| `app/(app)/admin/phong-ban/actions.ts` + `page.tsx` | `admin.phong-ban` |
| `app/(app)/admin/nguoi-dung/*` | `admin.nguoi-dung` |
| `app/(app)/admin/permissions/actions.ts` | `admin.permissions` |
| `app/(app)/sl-dt/{nhap-thang-moi,chi-tieu}/actions.ts` | `sl-dt` |

## Related Code Files
- Modify: `lib/rbac.ts` — xóa hierarchy API, GIỮ `isAdmin` (payment-service dùng 9×)
- Modify: ~30 file service/actions theo bảng map
- Modify: `app/(app)/admin/phong-ban/page.tsx` — `hasRole(role,"admin")` →
  `await hasRoleModuleAccess(role,"admin.phong-ban","admin")`
- Modify: `lib/admin/user-grants-service.ts` — bỏ `import { ALL_ROLES, AppRole }`,
  thay bằng `string` + `listRoles()` (Phase 4 cung cấp; tạm dùng `string`)

## Implementation Steps
1. Grep toàn bộ `requireRole(` → danh sách chính xác call site.
2. Theo từng file: đổi import + thay từng dòng theo quy tắc. `requireRole` là sync
   → `requireRoleModuleAccess` là async: thêm `await`.
3. `lib/rbac.ts`: xóa `AppRole, ROLE_HIERARCHY, hasRole, requireRole, ALL_ROLES`.
   Giữ lại `isAdmin(role: string | null | undefined)`.
4. Sửa mọi import gãy của `AppRole`/`ALL_ROLES`/`hasRole`/`requireRole`:
   - `module-access.ts`, `role-defaults.ts` đã xử lý ở Phase 2.
   - `user-grants-service.ts`: `AppRole` → `string`.
   - `admin/phong-ban/page.tsx`: dùng `hasRoleModuleAccess`.
5. `tsc --noEmit` đến khi sạch.

## Success Criteria
- [ ] `grep -r "requireRole\b" lib app` chỉ còn 0 kết quả (trừ test/plan cũ)
- [ ] `grep -r "ROLE_HIERARCHY\|AppRole" lib app` = 0
- [ ] `tsc --noEmit` sạch
- [ ] `isAdmin` vẫn export, payment-service không gãy

## Risk Assessment
- Sai moduleKey ở 1 file → guard sai module. Đối chiếu kỹ bảng map.
- Module admin-only (master-data/tai-chinh/sl-dt/admin.*): guard `"edit"` vẫn pass
  cho role có level `admin` (LEVEL_RANK admin≥edit). 14 user thật chỉ admin chạm
  được các module này → hành vi không đổi.
- `requireRole(role,"admin")` trên module dept (vd cong-no-vt) → `"admin"`: không
  role thường nào có `admin` trên dept module → chỉ admin pass (qua short-circuit),
  đúng như cũ.
