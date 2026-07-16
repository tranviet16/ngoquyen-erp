# Phase 01 — Persistence và rollout resolver

## Trạng thái

✅ Complete — `ModuleAvailability` là trạng thái toàn cục; migration backfill đủ 18 module về `ready`, bảo vệ `dashboard`/`admin.permissions`, tách entitlement khỏi rollout và áp dụng fail-closed cho page, project visibility, API và server action.

## Context

- `lib/acl/modules.ts`: catalog 18 module và availability hard-code.
- `lib/acl/effective.ts`: `canAccess` hiện gộp rollout với entitlement.
- `lib/acl/guards.ts`: hiện redirect development trước ACL.
- `lib/acl/role-permissions.ts`: write guards chỉ kiểm tra role, chưa kiểm tra rollout.
- `components/layout/app-sidebar.tsx`: development item hiện bỏ qua entitlement.

## Requirements và architecture

1. Thêm model `ModuleAvailability(moduleKey @id, status, updatedAt)` và migration tạo CHECK `ready|development`, insert đủ 18 module `ready` để giữ behavior production.
2. Giữ `MODULE_KEYS`, labels, axis và levels là compile-time contract; bỏ map availability mutable tĩnh.
3. Tạo request-cached bulk loader đọc một query. Missing row, status invalid hoặc DB error phải log lỗi không chứa dữ liệu nhạy cảm và trả development/fail closed.
4. Tách raw entitlement khỏi rollout: `canAccessEntitlement` chỉ giải ACL; `canAccess` kiểm tra released rồi gọi entitlement. Guard phải authenticate → entitlement/Forbidden → rollout/Development.
5. `requireRoleModuleAccess` và `getViewableProjectIds` phải kiểm tra rollout để chặn các caller dùng shared guard và project listing. Admin không bypass rollout.
6. Sidebar chỉ hiện module development cho user vốn có entitlement; status/label dùng resolver DB. Search/API tiếp tục dùng `canAccess`, nên development không trả dữ liệu.
7. Thêm child layouts cho `thanh-toan.ke-hoach` và `thanh-toan.tong-hop` để direct URL cũng có guard.
8. Audit toàn bộ entrypoint không dùng shared guard và thêm `assertModuleReleased(moduleKey)` trước query/mutation. Server-action files bắt buộc: `thanh-toan/actions.ts`, `admin/import/import-actions.ts`, `admin/permissions/actions.ts`, `admin/permissions/roles/actions.ts`, `admin/nguoi-dung/actions.ts`, `tai-chinh/phai-thu-tra/actions.ts`, bốn task action files, `admin/phong-ban/actions.ts`, `thong-bao/actions.ts`, năm SL-DT action files và `van-hanh/phieu-phoi-hop/actions.ts`. `ho-so/actions.ts` nằm ngoài catalog 18 module nên giữ nguyên. API bespoke bắt buộc: notifications route + stream và task attachment route; bốn API đã dùng `canAccess` giữ contract 403. Thêm contract test map action/API file → module để không bỏ sót entrypoint mới.

## Files

- Modify: `prisma/schema.prisma`, `lib/acl/modules.ts`, `lib/acl/index.ts`, `lib/acl/effective.ts`, `lib/acl/guards.ts`, `lib/acl/role-permissions.ts`, `components/layout/app-sidebar.tsx`, các action/API entrypoints đã liệt kê.
- Add: migration, `lib/acl/module-availability.ts`, hai payment child layouts.
- Modify/add focused ACL tests; enumerate callers before signature changes.

## Success / risks

- No N+1: sidebar dùng một availability map/query mỗi request.
- Không leak module existence cho user không quyền qua sidebar/guard ordering.
- Không render dữ liệu rồi mới blur; route module bị redirect trước page query.
- Risk: centralized write guard có blast radius lớn; full unit/integration/security required.

## Kết quả

- Hoàn tất persistence, resolver, guard ordering và contract coverage cho các entrypoint bespoke.
- Missing/invalid/DB error được xử lý fail closed thành development.
- Focused và full local verification liên quan đã pass; xem Phase 03 để biết gate tổng hợp.
