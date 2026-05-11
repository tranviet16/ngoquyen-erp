---
title: Forbidden page context-aware
description: >-
  Move /forbidden vào app shell + truyền moduleKey/level qua query để hiển thị
  thông báo cụ thể
status: completed
priority: P2
created: 2026-05-11T00:00:00.000Z
---

# Forbidden page context-aware

## Overview
Nâng cấp `/forbidden`: di chuyển vào `(app)` shell (giữ sidebar+topbar), hiển thị tên module + level user đang thiếu quyền (truyền qua query). Whitelist module chống XSS. Fallback generic khi không có/invalid query.

**Context:** [brainstorm-summary.md](./reports/brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Implementation](./phase-01-implementation.md) | Completed |

## Dependencies
None.

## Pre-flight findings
- **No `middleware.ts`** ở repo root → không có concern infinite-redirect.
- **2 callers ngoài `guards.ts`** vẫn dùng `redirect("/forbidden")`:
  - `app/(app)/van-hanh/hieu-suat/user/[userId]/page.tsx:54`
  - `app/(app)/van-hanh/hieu-suat/dept/[deptId]/page.tsx:48`
  - → Fallback generic OK; nâng cấp truyền query là **nice-to-have** (đưa vào phase 1).
