# Phase 02 — Admin UI và development screen

## Trạng thái

✅ Complete — admin UI quản lý trạng thái đã triển khai tại `/admin/permissions/modules`; hai core module bị khóa ở `ready`, mutation ghi availability và audit atomically, sidebar tôn trọng entitlement trước rollout, và `/dang-phat-trien` dùng shell synthetic mờ không chứa dữ liệu thật.

## Context

- `/admin/permissions/modules` đã là nơi chỉnh quyền module.
- `module-permission-grid.tsx` là ma trận rộng; status toàn cục không được lặp theo user.
- `/dang-phat-trien` hiện chỉ là empty state.

## Implementation

1. Query availability map tại module permissions page và render card “Trạng thái phát hành” phía trên matrix.
2. Card mở controlled dialog: danh sách module, native semantic switch ON=`Phát hành`, OFF=`Đang phát triển`, text status không phụ thuộc màu, dirty count, cancel/save, pending và inline `aria-live`/`role=alert`.
3. Mutation bulk riêng chỉ nhận allowlisted module/status; gọi `requireActiveAdmin`; từ chối `dashboard`/`admin.permissions`. Dùng interactive transaction: đọc before rows, update availability và `tx.auditLog.create` before/after trong cùng transaction; không dựa vào audit middleware (PK không có `id`) hoặc global `writeAuditLog`. Revalidate chỉ sau commit.
4. Khi hạ module về development, dialog confirm và liệt kê module bị chặn. Mobile dialog full-screen `h-dvh`, safe areas, overscroll, controls ≥44px.
5. Sidebar đổi badge thành “Đang phát triển”, tooltip rõ, item touch ≥44px.
6. `/dang-phat-trien` render synthetic skeleton `aria-hidden`/`inert` phía sau scrim `backdrop-blur`; notice card nêu module chưa sẵn sàng. Không import/fetch/render destination component hoặc business data.

## Files

- Modify: module permissions page/grid as needed, sidebar client, development page.
- Add focused status panel/dialog component và `availability-actions.ts`.
- Modify risk manifest để action mới fail closed ở P0.

## Success / security

- Client state không phải security boundary; action validate lại mọi input và admin active.
- Core modules hiển thị locked/released và không thể toggle.
- Development screen accessible, responsive và không chứa dữ liệu thật trong DOM.

## Kết quả

- Hoàn tất dialog trạng thái phát hành, validation fail-closed, core lock và audit trong cùng transaction.
- Hoàn tất badge “Đang phát triển” và màn hình `inert`/`aria-hidden` với `backdrop-blur`.
- UI contract, risk manifest và production build đã pass.
