---
phase: 1
title: "Backend & Avatar Serving"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Backend & Avatar Serving

## Overview
Server actions cho profile + password change, namespace avatar trong storage, route public-but-auth-gated để serve avatar file. Audit log mọi mutation.

## Requirements
- Functional:
  - `updateProfileAction({ name })` — validate 2-80 chars, trim, prisma update, audit
  - `uploadAvatarAction(FormData)` — validate mime + size, lưu file, update `user.image`, audit, cleanup old file
  - `removeAvatarAction()` — delete file, set `image=null`, audit
  - `changePasswordAction({ currentPassword, newPassword })` — gọi `auth.api.changePassword`, audit (KHÔNG log hash)
  - `GET /api/avatars/[...path]` — stream file qua `store.getStream`, content-type theo extension, require session
- Non-functional:
  - Reuse audit pattern từ task-service (`logTaskAudit`)
  - Validation chặn path traversal (storage layer đã sanitize, vẫn check userId match session)
  - Tránh log password trong audit `afterJson`

## Architecture

### Storage layout
```
uploads/
  avatars/
    {userId}/
      {cuid}.{ext}    # ext: png|jpg|jpeg|webp
```

### Audit helper
Tạo helper dùng chung trong `lib/audit-user.ts`:
```ts
async function logUserAudit(
  tx: Prisma.TransactionClient | typeof prisma,
  action: "profile_update" | "password_change",
  userId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) { ... }
```
Password change: `before = after = null`, chỉ ghi action + actor.

### Avatar route guard
```ts
// app/api/avatars/[...path]/route.ts
const session = await auth.api.getSession({ headers });
if (!session) return new Response("Unauthorized", { status: 401 });
const rel = `avatars/${params.path.join("/")}`;
// stream via store.getStream(rel)
```
Không check userId match — bất kỳ user đăng nhập đều có thể xem avatar người khác (giống cách Slack/Notion).

### Avatar upload flow
1. Parse FormData, validate `File` instance
2. Check mime `image/png|jpeg|webp`, size ≤ 2MB
3. Generate cuid, derive ext từ mime
4. Read old `user.image`, save new file, update DB
5. Delete old file (best-effort, swallow ENOENT)
6. Audit

### Better-auth changePassword
Verify signature trước implement. Expected (better-auth v1.x):
```ts
await auth.api.changePassword({
  body: { currentPassword, newPassword, revokeOtherSessions: false },
  headers: await headers(),
});
```
Nếu API khác → check `node_modules/better-auth/dist/*.d.ts` cho exact shape.

## Related Code Files
- Create:
  - `app/(app)/ho-so/actions.ts` — 4 server actions
  - `app/api/avatars/[...path]/route.ts` — file serve route
  - `lib/audit-user.ts` — `logUserAudit` helper
- Modify: none
- Reference:
  - `lib/auth.ts` — better-auth instance
  - `lib/storage/index.ts` — `store` singleton
  - `lib/task/task-service.ts` — audit pattern
  - `app/api/tasks/[id]/attachments/[attId]/route.ts` — stream pattern

## Implementation Steps
1. Verify `auth.api.changePassword` signature trong `node_modules/better-auth/dist`
2. Tạo `lib/audit-user.ts` với `logUserAudit` helper (tableName='User')
3. Tạo `app/(app)/ho-so/actions.ts`:
   - `updateProfileAction` — zod validate name, transaction (update + audit)
   - `uploadAvatarAction` — validate mime/size, generate path, putFile, update DB, delete old, audit
   - `removeAvatarAction` — read current image, deleteFile, null DB, audit
   - `changePasswordAction` — call better-auth, audit on success
   - Mỗi action gọi `auth.api.getSession` để lấy userId, throw nếu chưa login
4. Tạo `app/api/avatars/[...path]/route.ts`:
   - GET handler, require session
   - Sanitize: params.path join, prefix `avatars/`, pass to `store.getStream`
   - Content-Type theo extension (png/jpeg/webp)
   - Cache-Control: `private, max-age=300`
5. Test bằng `npx tsc --noEmit`

## Success Criteria
- [ ] 4 server actions compile, không lint error
- [ ] `lib/audit-user.ts` reused được cho future user-related audits
- [ ] Avatar route stream file đúng content-type
- [ ] Avatar route reject 401 nếu không login
- [ ] Audit log có entry sau mỗi action (verify qua psql)
- [ ] Password change KHÔNG log hash trong beforeJson/afterJson
- [ ] `npx tsc --noEmit` clean

## Risk Assessment
- **Better-auth API signature** — verify ở step 1; nếu lib phiên bản khác cần adapt
- **Old avatar cleanup race** — nếu user upload nhanh 2 lần, có thể leak file cũ. Best-effort delete OK, không critical
- **Path traversal qua route param** — storage layer đã sanitize, đủ an toàn
- **Session check trong action vs middleware** — action tự check là pattern hiện tại của codebase (xem các actions khác), không cần middleware riêng
