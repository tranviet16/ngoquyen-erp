# Brainstorm Summary — Trang Hồ sơ cá nhân

**Date:** 2026-05-11
**Status:** Approved, ready for /ck:plan

## Problem
Chưa có trang để user tự xem/sửa thông tin cá nhân (tên, avatar) và đổi mật khẩu. Hiện chỉ có `/admin/nguoi-dung` cho admin sửa user khác.

## Approved Scope
- Xem readonly: email, role, phòng ban
- Sửa: name, avatar (upload qua existing `@/lib/storage`)
- Đổi mật khẩu qua better-auth `auth.api.changePassword`
- **Out:** sessions list, 2FA, notification prefs, theme/language

## Route
`/ho-so` — `app/(app)/ho-so/page.tsx` + `ho-so-client.tsx`. Thêm link trong navbar user dropdown.

## Architecture

### Server actions (`app/(app)/ho-so/actions.ts`)
| Action | Mục đích | Audit |
|--------|----------|-------|
| `updateProfileAction({ name })` | Update `user.name` | `User.profile_update` |
| `uploadAvatarAction(FormData)` | Lưu file vào `storage/avatars/{userId}/{cuid}.{ext}`, update `user.image` | `User.profile_update` |
| `removeAvatarAction()` | Xóa file + set `image=null` | `User.profile_update` |
| `changePasswordAction({ current, next })` | Gọi better-auth | `User.password_change` (KHÔNG log hash) |

### Avatar serving
- Lưu: relative path `avatars/{userId}/{cuid}.{ext}` qua `store.putFile`
- Serve: cần verify endpoint hiện tại của attachment. Nếu chưa public, thêm `app/api/avatars/[...path]/route.ts` đọc qua `store.readFile` (auth-required hoặc public — quyết định trong phase implementation).

### Validation
- Name: 2–80 chars, trim
- Password: min 8 chars (better-auth default)
- Avatar: `image/png|jpeg|webp`, ≤2MB, dimensions không kiểm tra (resize client-side optional)

## Risks
- **Better-auth changePassword signature** — cần verify lib version trước implement
- **Avatar route auth** — quyết định public hay session-required (default: session-required cho ERP nội bộ)
- **File cleanup khi remove avatar** — cần delete old file để tránh rác disk

## UX Decisions
- Single page, không tabs
- Name save dùng button rõ ràng (không auto-save vì single field)
- Password form riêng với 3 input + 1 button
- Avatar: click ảnh để mở file picker, hover hiện overlay "Đổi ảnh"
- Success toast cho mỗi action

## Success Criteria
- [ ] User đăng nhập vào được `/ho-so`, thấy đúng info của mình
- [ ] Sửa tên → lưu thành công, header reflect ngay
- [ ] Upload avatar → hiển thị ngay, persist sau refresh
- [ ] Đổi password → logout/login lại bằng password mới hoạt động
- [ ] Audit log có entry cho mỗi action
- [ ] Validation chặn invalid input rõ ràng

## Next Step
Run `/ck:plan` để tạo phased implementation plan.
