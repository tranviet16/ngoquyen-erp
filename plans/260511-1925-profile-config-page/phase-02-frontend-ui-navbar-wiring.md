---
phase: 2
title: "Frontend UI & Navbar Wiring"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Frontend UI & Navbar Wiring

## Overview
Page server `/ho-so` fetch user data, client component render 3 sections (avatar+name, readonly info, change password). Repoint navbar "Tài khoản của tôi" từ `/master-data` sang `/ho-so`.

## Requirements
- Functional:
  - Hiển thị: avatar (96px) + name (editable), email/role/dept (readonly chips)
  - Edit name: input + nút "Lưu" (single-field, không auto-save)
  - Upload avatar: click ảnh mở file picker, hiển thị preview ngay, button "Xóa"
  - Đổi mật khẩu: 3 input (current/new/confirm) + button, validate client-side
  - Toast feedback cho mọi action
- Non-functional:
  - Single page, no tabs
  - Bundle: không thêm dependency mới
  - Avatar load lazy, fallback initials nếu image null

## Architecture

### Page server (`app/(app)/ho-so/page.tsx`)
```tsx
const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user) redirect("/login");
const user = await prisma.user.findUnique({
  where: { id: session.user.id },
  include: { department: true },
});
return <HoSoClient user={user} />;
```

### Client (`app/(app)/ho-so/ho-so-client.tsx`)
3 sections in cards:
1. **Avatar + Name** — Avatar component (96px round), file input hidden, hover overlay; name input + save button
2. **Thông tin tài khoản (readonly)** — email, role chip, dept (code-name)
3. **Đổi mật khẩu** — 3 password fields + button, hide form after success

Avatar src = `/api/avatars/${user.image}` if relative path (storage namespace), or empty → fallback initials.

### Validation (client)
- Name: trim, length 2-80
- Password: new == confirm, new length ≥ 8
- File: pick mime `image/png|jpeg|webp`, size ≤ 2MB (check trước khi upload để tránh round-trip)

### Navbar wiring (`components/layout/topbar.tsx`)
Đổi line 110 `router.push("/master-data")` → `router.push("/ho-so")`. Đổi label nếu cần (giữ "Tài khoản của tôi").

## Related Code Files
- Create:
  - `app/(app)/ho-so/page.tsx`
  - `app/(app)/ho-so/ho-so-client.tsx`
- Modify:
  - `components/layout/topbar.tsx` (line 110 — repoint)
- Reference:
  - `app/(app)/ho-so/actions.ts` (từ phase 1)
  - `components/ui/button.tsx`, `input.tsx`, `card.tsx`

## Implementation Steps
1. Page server: fetch user + dept, redirect nếu chưa login
2. Client component skeleton: state (name, avatar preview, password fields), useTransition cho mỗi action
3. Section Avatar + Name:
   - `<img>` 96px round, src từ user.image hoặc fallback initials
   - File input hidden, click avatar trigger picker
   - Client-side validate mime+size trước upload
   - "Xóa" button gọi removeAvatarAction
   - Name input + Save button (gọi updateProfileAction)
4. Section readonly info: chip layout với email/role/dept
5. Section đổi password: 3 inputs + button, client validate match + length
6. Toast success/error cho mỗi action, router.refresh() sau update để topbar reflect tên/avatar mới
7. Update `topbar.tsx` line 110 → `/ho-so`
8. `npx tsc --noEmit` + manual QA

## Success Criteria
- [ ] Truy cập `/ho-so` thấy đúng info của user hiện tại
- [ ] Sửa tên → lưu thành công, topbar cập nhật ngay sau refresh
- [ ] Upload avatar PNG/JPG/WEBP < 2MB → hiển thị ngay, persist sau reload
- [ ] Upload file > 2MB hoặc sai mime → block client-side, toast error
- [ ] Xóa avatar → fallback về initials, file vật lý bị xóa
- [ ] Đổi password đúng current → success, logout/login lại bằng new password OK
- [ ] Đổi password sai current → toast error, không update DB
- [ ] Click "Tài khoản của tôi" trên topbar → mở `/ho-so`
- [ ] `npx tsc --noEmit` clean

## Risk Assessment
- **Avatar cache stale sau update** — `router.refresh()` invalidate RSC cache; thêm `?v=${Date.now()}` query string vào src nếu vẫn cache
- **Topbar tên không update khi user sửa name** — better-auth session cache 5 phút; có thể cần `useSession` refetch hoặc accept lag 5 phút
- **Password form reset** — sau success phải clear inputs để tránh paste lại nhầm
- **Race upload + remove** — disable buttons khi pending để tránh
