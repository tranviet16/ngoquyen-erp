---
title: "Trang Hồ sơ cá nhân (/ho-so)"
description: "User self-service profile: name, avatar, password"
status: pending
priority: P2
created: 2026-05-11
---

# Trang Hồ sơ cá nhân (/ho-so)

## Overview

User self-service page tại `/ho-so` cho phép xem/sửa name + avatar và đổi mật khẩu qua better-auth. Email/role/dept readonly (admin sửa qua `/admin/nguoi-dung`). Avatar lưu qua `@/lib/storage` namespace `avatars/{userId}/`, serve qua route mới `/api/avatars/[...path]`. Audit log mọi mutation. Navbar đã có link "Tài khoản của tôi" trỏ sai (`/master-data`) → repoint sang `/ho-so`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Backend & Avatar Serving](./phase-01-backend-avatar-serving.md) | Pending |
| 2 | [Frontend UI & Navbar Wiring](./phase-02-frontend-ui-navbar-wiring.md) | Pending |

## Context
- Brainstorm summary: [reports/brainstorm-summary.md](./reports/brainstorm-summary.md)
- Auth lib: better-auth (`lib/auth.ts`)
- Storage: `@/lib/storage` (LocalDiskStore, root `./uploads`)
- Audit log helper: pattern từ `lib/task/task-service.ts` (`logTaskAudit`)
- Navbar: `components/layout/topbar.tsx` line 110 — currently routes to `/master-data`

## Dependencies
None.

## Out of Scope
- Sessions list, 2FA, email verification flow
- Notification preferences (schema chưa support)
- Theme/language (đã có ThemeToggle ở topbar)
