---
phase: 1
title: "Setup & Foundation (Auth, RBAC, Audit, Infra)"
status: completed
priority: P1
effort: "2w"
dependencies: []
---

# Phase 1: Setup & Foundation

## Overview
Khởi tạo Next.js + PostgreSQL + Prisma project, cấu hình Better Auth với RBAC 5 vai trò, Prisma middleware ghi audit log, Docker compose deploy lên VPS, base layout + nav.

## Requirements
**Functional:**
- Đăng nhập email/password
- 5 role: `admin`, `ketoan`, `canbo_vt`, `chihuy_ct`, `viewer`
- Mọi mutation tự động ghi `audit_logs`
- Layout chung với sidebar 6 module + topbar user menu

**Non-functional:**
- TypeScript strict mode
- File ≤ 200 dòng
- Postgres dev qua Docker, prod qua VPS Docker compose
- ESLint + Prettier minimal config

## Architecture
```
apps/web (Next.js 15 App Router)
├── app/
│   ├── (auth)/login
│   ├── (app)/                    ← layout với sidebar
│   │   ├── master-data/
│   │   ├── du-an/
│   │   ├── vat-tu-ncc/
│   │   ├── cong-no-vt/
│   │   ├── cong-no-nc/
│   │   ├── sl-dt/
│   │   └── tai-chinh/
│   └── api/auth/[...all]
├── lib/
│   ├── auth.ts                   ← Better Auth config
│   ├── prisma.ts                 ← singleton + audit middleware
│   ├── rbac.ts                   ← role check helpers
│   └── audit.ts
├── prisma/schema.prisma
└── components/ui/                ← shadcn primitives
docker/
├── docker-compose.yml
├── Dockerfile
└── nginx.conf
```

**Audit middleware** (Prisma `$extends`): intercept `create/update/delete` → write `audit_logs` với `user_id` (lấy từ async context), `table`, `record_id`, `action`, `before_json`, `after_json`, `created_at`.

## Related Code Files
**Create:**
- `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`, `.gitignore`
- `prisma/schema.prisma` (User, Role, AuditLog only ở phase này)
- `lib/auth.ts`, `lib/prisma.ts`, `lib/rbac.ts`, `lib/audit.ts`, `lib/async-context.ts`
- `app/layout.tsx`, `app/(auth)/login/page.tsx`
- `app/(app)/layout.tsx` (sidebar + topbar)
- `app/(app)/page.tsx` (dashboard placeholder)
- `app/api/auth/[...all]/route.ts`
- `middleware.ts` (route protection + RBAC)
- `components/ui/*` (shadcn: button, input, card, sidebar, dropdown-menu)
- `docker/docker-compose.yml`, `docker/Dockerfile`, `docker/nginx.conf`
- `README.md` (setup instructions)

## Implementation Steps
1. `npx create-next-app@latest` (TS, App Router, Tailwind, ESLint)
2. Install: `prisma @prisma/client better-auth zod @tanstack/react-query`
3. Install shadcn/ui CLI + add primitives
4. Setup Postgres docker + Prisma schema cho User/Role/AuditLog
5. Cấu hình Better Auth (email+password, session DB-backed)
6. Implement `lib/rbac.ts` với `requireRole(role)` helper
7. Tạo Prisma middleware audit log (đọc user từ AsyncLocalStorage set bởi middleware)
8. Build login page + protected layout
9. Sidebar nav với 6 module entry (link tới placeholder page)
10. Seed script: 1 admin user mặc định
11. Docker compose (web + postgres + nginx)
12. Smoke test: `tsc --noEmit`, `next build`, login flow, audit row được ghi

## Success Criteria
- [ ] `next build` pass, không TS error
- [ ] Login → redirect dashboard, logout OK
- [ ] User không có role không vào được route protected (test bằng curl)
- [ ] Tạo/sửa/xóa user → có row trong `audit_logs`
- [ ] `docker compose up` chạy được local
- [ ] Sidebar hiển thị 6 module entry, click ra placeholder page

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Better Auth API thay đổi | Pin version trong package.json; đọc docs hiện tại trước khi code |
| AsyncLocalStorage user context mất giữa server actions | Wrap mỗi request handler bằng helper `withUserContext()`; fallback `system` user nếu null |
| Audit log phình DB | Phase 1 chấp nhận; Phase 2 thêm partition theo tháng nếu cần |
