# Phase 01 — Tạo tài khoản người dùng

## Context

- `app/(app)/admin/nguoi-dung/actions.ts`: action wrappers hiện có chỉ gọi service rồi `revalidatePath`.
- `lib/admin/user-grants-service.ts`: caller duy nhất của các actions hiện tại; `assertAdmin`, `updateUserAttributes`, `writeAuditLog`, `bypassAudit` là pattern cần giữ.
- `app/(app)/admin/nguoi-dung/user-grants-client.tsx`: client duy nhất của `setGrantAction`/`updateUserAttributesAction`; thêm dialog ở đây, không sửa row flow hiện hữu.
- `lib/auth.ts`, `prisma/schema.prisma`: Better Auth email/password + `username()`; User có unique `email`, unique nullable `username`, role và department.

## Thiết kế

### Service và server action

1. Trích guard hiện hữu thành helper admin-active dùng chung và giới hạn `page.tsx` về role literal `admin`; mọi service mutation tiếp tục fail closed ở server.
2. Validate server-side trước create: trim name/email/username; name không rỗng; email hợp lệ; password string dài >= 12; role phải tồn tại trong `prisma.role`; department (nếu có) phải tồn tại và active. Để Better Auth username plugin là nguồn chuẩn cho format/normalization, nhưng preflight username/email chỉ nhằm lỗi duplicate rõ ràng; vẫn catch unique/auth duplicate race.
3. Refactor `lib/auth.ts` qua factory nội bộ. Giữ `isTestRun = CI || E2E` chỉ cho rate limit, thêm `isE2ERun = process.env.E2E === "true"` riêng. Trong `emailAndPassword`, primary auth đặt `disableSignUp: !isE2ERun`; provisioning auth riêng đặt `disableSignUp:false`, `autoSignIn:false` và không được mount tại route HTTP.
4. Gọi provisioning `signUpEmail` với `name`, normalized email, username và password; assert kết quả không có token/session. Không log input, object trả về, raw error hay password.
5. Sau khi có `createdUser.id`, cập nhật `role`, `departmentId`, `isActive:true`, leader/director false bằng Prisma. Nếu bước này/audit interceptor thất bại, chỉ xóa đúng ID vừa tạo; Account cascade. Audit create/update/delete của User do interceptor hiện hữu ghi và được giữ lại, không thêm audit explicit.
6. Thêm `createUserAccountAction(input)` trong `actions.ts`, gọi service và chỉ revalidate khi thành công. Giữ guard/validation trong service vì action có thể bị gọi trực tiếp.

### UI

7. Trong `UserGrantsClient`, thêm nút “Tạo người dùng” và controlled `Dialog` dùng `components/ui/dialog.tsx`. Form gồm name, username, email, password (`type=password`, `autoComplete="new-password"`), role select từ prop `roles`, department select với “Không chọn”. Không render lại/đưa password vào URL, state debug, console hay danh sách users.
8. Submit dùng `useTransition` → `createUserAccountAction`; disable controls/nút trong lúc pending, hiển thị toast lỗi/success, reset form và đóng dialog chỉ khi success, rồi `router.refresh()`.
9. Mobile bắt buộc: dialog full-screen `h-dvh` trên mobile, safe areas, nội dung `overscroll-contain`, field `text-base md:text-sm`, touch target >=44px. Bọc table hiện hữu bằng `overflow-x-auto` và đặt `min-w-[600px]`.

## Files dự kiến

- Modify: `lib/auth.ts`; chuyển toàn bộ direct internal signup callers sang provisioning auth: `prisma/seed.ts`, `prisma/seed-test-users.ts`, `prisma/seed-director.ts`, `scripts/seed-admin.ts`, `scripts/seed-employees.ts`, `scripts/smoke-plan-bc.ts`, `scripts/smoke-task-collab.ts`
- Modify: `lib/admin/user-grants-service.ts`; add focused admin guard/account service modules where needed to keep boundaries small
- Modify: `app/(app)/admin/nguoi-dung/actions.ts`
- Modify: `app/(app)/admin/nguoi-dung/user-grants-client.tsx`
- Modify: `test/unit/p0-server-action-contracts.test.ts` hoặc test unit mới cùng convention; cập nhật mocks cho auth signup, user/role/department/audit.
- Không cần migration/schema hay Better Auth API per-call bổ sung; thay đổi auth config chỉ là primary/provisioning instances đã mô tả ở trên.

## Tests và deploy

1. Unit/service: unauthenticated, non-admin, inactive admin deny trước provisioning; password <12, invalid role/department, duplicate email/username; success creates Account nhưng token null/không có Session và attributes active; auth duplicate race; update failure → exact-ID compensation; compensation failure returns failure và không log secret.
2. Auth config contract: primary HTTP signup bị từ chối khi không có `E2E=true`, được bật trong E2E setup; provisioning signup không auto-sign-in. Không dùng `CI=true` để mở signup.
3. P0 contract: action manifest vẫn phủ `actions.ts`; action gọi guard/service và revalidate chỉ success.
4. E2E: admin mở dialog trên mobile viewport, tạo user, thấy row active với role/phòng; đăng xuất/đăng nhập bằng username/email và password khởi tạo; duplicate hiển thị lỗi, không tạo row thứ hai.
5. Chạy focused Vitest, `pnpm lint`, `pnpm build`, risk verification và suite E2E/security bắt buộc. Deploy theo PR green; build image theo merge SHA, recreate, smoke admin create và login, lưu image cũ để rollback.

## Rủi ro và rollback

- Race duplicate không được giải quyết chỉ bằng preflight; catch error từ Better Auth/Prisma và trả message domain-safe.
- Auth create và attribute update không chung transaction; compensation exact-ID bắt buộc. Không xóa theo email và không cleanup user đã tồn tại trước lời gọi.
- Primary auth tắt self-signup ở production; provisioning auth là server-only và `autoSignIn:false`. Tests phải chứng minh không tạo Session và không đổi cookie admin.
- Rollback ứng dụng: deploy image trước đó. Dữ liệu: xóa thủ công chỉ account vừa tạo dựa vào audit record/user ID nếu compensation không chạy được; không xóa theo email mơ hồ.
