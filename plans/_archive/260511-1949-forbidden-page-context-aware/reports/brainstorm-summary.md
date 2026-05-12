# Brainstorm — Forbidden page context-aware

**Date:** 2026-05-11
**Status:** Approved

## Problem
`app/forbidden/page.tsx` hiện tại quá generic: full-screen ngoài app shell, không cho user biết module nào bị từ chối, level nào còn thiếu. Guard `requireModuleAccess` redirect plain `/forbidden`, mất context.

## Requirements
- User biết được **module** + **level** mà mình thiếu quyền
- Giữ navigation (sidebar+topbar) để user đi tiếp
- KISS: không over-engineer (không request-access flow, không audit, không email admin)
- Backward compat: caller cũ gọi `redirect("/forbidden")` không param vẫn hoạt động (fallback generic)

## Approaches considered
| # | Approach | Pros | Cons | Verdict |
|---|----------|------|------|---------|
| 1 | Context-aware qua query string | Simple, không cần state | Query lộ trong URL (chấp nhận được) | ✅ Chọn |
| 2 | Server-side session storage | URL sạch | Phức tạp, cần flash-message system | ❌ Over-engineer |
| 3 | Full self-service request flow | UX tốt nhất | Cần thêm table access_request, notification | ❌ YAGNI |

## Final design

### Routing
- Move `app/forbidden/page.tsx` → `app/(app)/forbidden/page.tsx`
- Delete file cũ (route group ưu tiên — tránh collision)
- Kế thừa `(app)/layout.tsx` (sidebar+topbar). Layout đó chỉ check session+role `viewer`, không guard module → không loop.

### Guards redirect với context
`lib/acl/guards.ts:48`:
```ts
redirect(`/forbidden?m=${encodeURIComponent(moduleKey)}&need=${opts.minLevel ?? "read"}`);
```

### Page component
Server Component, parse `searchParams` (Next 16 async):
```ts
const { m, need } = await searchParams;
const moduleLabel = MODULE_KEYS.includes(m) ? MODULE_LABELS[m] : null;
const levelLabel = LEVEL_LABELS[need] ?? null;
```
Whitelist check chống XSS.

### Level labels (mới — `lib/acl/module-labels.ts`)
```
read    → "Xem"
comment → "Bình luận"
edit    → "Chỉnh sửa"
admin   → "Quản trị"
```

### UI
- Icon ShieldOff
- H1: "Không có quyền truy cập"
- Body (có context): "Bạn cần quyền **{level}** cho module **{module}**."
- Body (fallback): câu generic cũ
- Footer: "Vui lòng liên hệ quản trị viên để được cấp quyền."
- 1 button: "Về Dashboard"

## Files affected
| Action | File |
|--------|------|
| Create | `app/(app)/forbidden/page.tsx` |
| Modify | `lib/acl/module-labels.ts` (thêm LEVEL_LABELS) |
| Modify | `lib/acl/guards.ts:48` (append query string) |
| Delete | `app/forbidden/page.tsx` |

## Risks
- **middleware.ts chặn `/forbidden`** → grep + xác nhận trong matcher, KHÔNG infinite-redirect
- **Caller direct `redirect("/forbidden")`** ngoài guards.ts → fallback generic, OK
- **Tên file collision** → bắt buộc delete file cũ
- **Next 16 searchParams** → là Promise, phải `await`

## Success criteria
- [ ] User bị deny du-an edit thấy: "Bạn cần quyền **Chỉnh sửa** cho module **Dự án xây dựng**"
- [ ] Sidebar+topbar hiển thị trên trang forbidden
- [ ] Query param sai/invalid → fallback generic
- [ ] `npx tsc --noEmit` clean
- [ ] Không có infinite redirect

## Effort
~1.5h (1 phase đủ — không cần chia)

## Out of scope
- Request-access flow
- Audit log deny events
- Hiển thị scope detail (project name, dept name)
- Email admin contact
