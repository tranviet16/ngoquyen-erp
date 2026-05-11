---
phase: 1
title: Implementation
status: completed
priority: P2
effort: 1.5h
dependencies: []
---

# Phase 1: Implementation

## Overview
Di chuyển forbidden page vào app shell, thêm context-aware messaging qua query string `?m={moduleKey}&need={level}`. Whitelist moduleKey chống XSS, fallback generic khi query thiếu/invalid.

## Requirements
- Functional:
  - User bị deny module X cần level Y thấy: "Bạn cần quyền **{level label}** cho module **{module label}**"
  - Sidebar + topbar hiển thị (page nằm trong `(app)` shell)
  - Query thiếu/invalid → fallback câu generic cũ
  - 1 nút "Về Dashboard"
- Non-functional:
  - Whitelist moduleKey trước khi render (chống XSS)
  - `npx tsc --noEmit` clean
  - Backward compat: caller cũ `redirect("/forbidden")` (không param) vẫn hoạt động

## Architecture

### Query schema
```
/forbidden?m={moduleKey}&need={level}
```
- `m`: alphanumeric + dot (e.g. `du-an`, `van-hanh.hieu-suat`)
- `need`: `read | comment | edit | admin`

### Page resolver (Server Component)
```tsx
export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; need?: string }>;
}) {
  const { m, need } = await searchParams;
  const isValidModule = m && (MODULE_KEYS as readonly string[]).includes(m);
  const moduleLabel = isValidModule ? MODULE_LABELS[m as ModuleKey] : null;
  const levelLabel = need && need in LEVEL_LABELS ? LEVEL_LABELS[need as AccessLevel] : null;
  // render context-aware nếu cả 2 valid, else generic
}
```

### Level labels (mới)
File: `lib/acl/module-labels.ts`
```ts
export const LEVEL_LABELS: Record<AccessLevel, string> = {
  read: "Xem",
  comment: "Bình luận",
  edit: "Chỉnh sửa",
  admin: "Quản trị",
};
```

### Guards redirect
File: `lib/acl/guards.ts:48`
```ts
const params = new URLSearchParams({ m: moduleKey, need: minLevel });
redirect(`/forbidden?${params.toString()}`);
```
Dùng `URLSearchParams` thay vì template string để safe-encode.

### Optional callers update
- `app/(app)/van-hanh/hieu-suat/user/[userId]/page.tsx:54` — đổi thành `redirect(`/forbidden?m=van-hanh.hieu-suat&need=read`)`
- `app/(app)/van-hanh/hieu-suat/dept/[deptId]/page.tsx:48` — tương tự
- (Nice-to-have, không critical — fallback generic vẫn ổn)

## Related Code Files
- **Create:**
  - `app/(app)/forbidden/page.tsx`
- **Modify:**
  - `lib/acl/module-labels.ts` (thêm `LEVEL_LABELS`)
  - `lib/acl/guards.ts` (line 48 — append query)
  - `app/(app)/van-hanh/hieu-suat/user/[userId]/page.tsx` (line 54 — truyền query)
  - `app/(app)/van-hanh/hieu-suat/dept/[deptId]/page.tsx` (line 48 — truyền query)
- **Delete:**
  - `app/forbidden/page.tsx` (file cũ ngoài app shell)

## Implementation Steps
1. Thêm `LEVEL_LABELS` vào `lib/acl/module-labels.ts` (export thêm, không phá API hiện có)
2. Tạo `app/(app)/forbidden/page.tsx`:
   - Server Component, async, parse `searchParams`
   - Whitelist `m` qua `MODULE_KEYS.includes()`
   - Render context-aware nếu valid, fallback generic
   - 1 button "Về Dashboard"
   - Giữ icon `ShieldOff` từ lucide-react
3. Sửa `lib/acl/guards.ts:48`:
   - Build query qua `URLSearchParams`
   - Truyền `moduleKey` + `minLevel`
4. Xóa `app/forbidden/page.tsx` (file cũ)
5. (Optional) Update 2 callers ngoài guards.ts truyền query
6. `npx tsc --noEmit` — verify clean
7. Manual QA: đăng nhập viewer → mở `/du-an` (hoặc module bất kỳ user không có quyền) → kiểm tra:
   - Sidebar + topbar hiển thị
   - Message: "Bạn cần quyền **Xem** cho module **Dự án xây dựng**"
   - Nút "Về Dashboard" hoạt động
   - Thử `/forbidden` không query → fallback generic
   - Thử `/forbidden?m=invalid&need=hack` → fallback generic (không render raw input)

## Success Criteria
- [ ] `app/(app)/forbidden/page.tsx` tồn tại + render đúng
- [ ] `app/forbidden/page.tsx` đã xóa
- [ ] Guard redirect truyền query đầy đủ
- [ ] `LEVEL_LABELS` export từ module-labels.ts
- [ ] Whitelist chặn moduleKey không hợp lệ
- [ ] Fallback generic khi thiếu query
- [ ] `npx tsc --noEmit` clean
- [ ] Manual QA pass cả 3 scenarios (valid / no query / invalid query)

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| File collision `app/forbidden` vs `app/(app)/forbidden` | Bắt buộc xóa file cũ; Next.js prefer route group nhưng có warning |
| XSS qua query param `m` | Whitelist `MODULE_KEYS.includes()` trước khi render |
| Next 16 `searchParams` async | Page dùng `await searchParams` (đã pattern hóa trong codebase) |
| Caller cũ pass moduleKey unknown | Whitelist fallback → generic, no crash |
| `(app)/layout.tsx` guard `viewer` role | Đã verify: chỉ check session + role tồn tại, không guard module → không loop |
