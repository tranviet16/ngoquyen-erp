# Quản lý trạng thái phát hành module

## Mục tiêu

Cho phép admin active đặt từng module ở trạng thái `Phát hành` hoặc `Đang phát triển`. Module phát hành tiếp tục dùng ACL hiện hữu; module đang phát triển chỉ hiện cho người vốn có quyền, nhưng mọi page/API/action đều bị chặn và click dẫn tới màn hình shell mờ không tải dữ liệu nghiệp vụ.

## Trạng thái

Phase 1 và Phase 2 đã hoàn tất. Phase 3 đang thực hiện: toàn bộ local gates và independent review đã xanh; PR, required checks, merge, deployment và production smoke còn pending. `dashboard` và `admin.permissions` luôn được bảo vệ ở trạng thái phát hành để tránh self-lockout.

## Phase

1. ✅ [Persistence và rollout resolver](phase-01-persistence-and-access.md) — Complete
2. ✅ [Admin UI và development screen](phase-02-admin-ui-and-development-screen.md) — Complete
3. 🚧 [Verification, docs và deploy](phase-03-verification-and-deploy.md) — In progress

## Dependencies

- Phase 2 chỉ bắt đầu sau Phase 1 compile và focused tests xanh.
- Phase 3 chỉ bắt đầu sau Phase 2 UI/typecheck xanh.
- Không thay đổi `ModulePermission`, `RolePermission`, access levels hoặc business data.

## Điều kiện hoàn tất

- Admin active có thể lưu status toàn cục cho 16 module có thể thay đổi; hai core module không thể bị khóa qua client hoặc server action.
- User không có entitlement không thấy module và nhận Forbidden khi vào URL; user có entitlement thấy badge development và nhận màn hình blur/synthetic khi click hoặc vào URL trực tiếp.
- Module development fail closed cho page, API, server action và project list; module released giữ nguyên toàn bộ ACL hiện tại.
- Migration backfill 18 module ở trạng thái ready không gây gián đoạn; missing/invalid/DB error resolve thành development.
- Audit, unit/integration/E2E, risk manifest, lint/type/build, PR checks và production smoke đều xanh.

## Verification hiện tại

- Unit: `676/676` pass.
- Integration: `35/35` pass.
- E2E: `16/16` pass.
- TypeScript, lint, Prisma validation/generation, risk-manifest verification, production build và independent security review: pass.
- PR checks, merge, deployment và production smoke: pending.
