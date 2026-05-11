---
title: Dashboard My work MVP
description: >-
  Biến trang `/dashboard` từ placeholder tĩnh thành landing "My work": KPI +
  task của tôi + phiếu chờ duyệt + thông báo.
status: completed
priority: P2
created: 2026-05-11T00:00:00.000Z
---

# Dashboard My work MVP

## Overview
Rewrite `app/(app)/dashboard/page.tsx` thành Server Component fetch parallel 4 nguồn dữ liệu (task của tôi, phiếu chờ duyệt, thông báo chưa đọc, module có quyền), hiển thị 4 KPI + 3 list section + empty fallback.

**Context:** [brainstorm-summary.md](./reports/brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Implementation](./phase-01-implementation.md) | Completed |

## Dependencies
None.

## Pre-flight findings

### `listTasksForBoard` (lib/task/task-service.ts:126)
✅ Hỗ trợ `assigneeId` + `deadlineFrom`/`deadlineTo`. Internal `requireContext()` đã filter ACL.
⚠️ Returns `byStatus: Record<TaskStatus, TaskWithRelations[]>` (grouped). Dashboard phải:
  - Flatten: `[...byStatus.todo, ...byStatus.doing, ...byStatus.review]` (loại bỏ `done`)
  - Filter overdue/upcoming bằng JS sau khi flatten (đơn giản, list nhỏ)
→ **KHÔNG cần helper mới**, dùng trực tiếp.

### `listForms` (lib/coordination-form/coordination-form-service.ts:54)
⚠️ Signature chỉ có `{ status?, mine?, page? }` — **không có filter "approver=me"**.
Quyết định MVP: dùng `listForms({ status: "submitted" })` — service tự filter theo `accessMap` (chỉ trả forms user có quyền xem). Đây là proxy của "phiếu trong tầm phụ trách đang chờ duyệt". Đủ cho MVP.
→ **KHÔNG mở rộng service**, dùng trực tiếp với note ở phase doc.

### `countMyUnread` (lib/notification/notification-service.ts)
✅ Có sẵn, không cần verify thêm.

### Quick-nav fallback
⚠️ `getEffectiveModules` **không tồn tại** (brainstorm assume nhầm). Thay thế:
  - Reuse `canAccess(userId, moduleKey, { minLevel: "read", scope: "module" })` từ `lib/acl/effective.ts`
  - Hard-code 6 module shortcuts (du-an, vat-tu-ncc, sl-dt, van-hanh.cong-viec, van-hanh.phieu-phoi-hop, thong-bao), map qua `Promise.all(canAccess)`, render những cái pass.
→ Không cần helper mới.
