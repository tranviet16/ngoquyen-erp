---
phase: 1
title: "Schema & SLA helpers"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Schema & SLA helpers

## Overview

Thêm 2 cột vào `CoordinationForm` để track escalation, và viết module pure helpers tính SLA. Backfill data hiện có để không mất phiếu pending cũ.

## Requirements

**Functional:**
- `CoordinationForm` lưu được trạng thái escalated với timestamp và `escalatedFromUserId` (TBP đáng ra phải duyệt)
- Pure functions tính `isOverdue(form)`, `deadlineOf(form)`, `hoursRemaining(form, now)` không I/O

**Non-functional:**
- Migration zero-downtime, không lock table dài
- Helpers 100% pure (test được bằng vitest không cần DB)

## Architecture

```prisma
model CoordinationForm {
  // ... existing fields
  submittedAt          DateTime?
  escalatedAt          DateTime?
  escalatedFromUserId  String?
  escalatedFromUser    User?     @relation("CoordinationFormEscalatedFrom", fields: [escalatedFromUserId], references: [id])
  // ... existing
  @@index([status, submittedAt])  // hỗ trợ query "pending_leader + quá hạn"
}
```

`lib/coordination-form/sla.ts` (pure):
```ts
export const SLA_HOURS = 24;

export function deadlineOf(form: { submittedAt: Date | null }): Date | null {
  if (!form.submittedAt) return null;
  return new Date(form.submittedAt.getTime() + SLA_HOURS * 3600 * 1000);
}

export function isOverdue(
  form: { status: string; submittedAt: Date | null; escalatedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (form.status !== "pending_leader") return false;
  if (form.escalatedAt) return false;
  const dl = deadlineOf(form);
  return dl != null && now > dl;
}

export function hoursRemaining(
  form: { submittedAt: Date | null },
  now: Date = new Date(),
): number | null {
  const dl = deadlineOf(form);
  if (!dl) return null;
  return (dl.getTime() - now.getTime()) / 3600_000;
}
```

## Related Code Files

**Create:**
- `lib/coordination-form/sla.ts`
- `lib/coordination-form/__tests__/sla.test.ts` (vitest)
- `prisma/migrations/<auto-timestamp>_add_coordination_form_sla/migration.sql`

**Modify:**
- `prisma/schema.prisma` (CoordinationForm model + User reverse relation)

## Implementation Steps

1. **Schema update** — Thêm vào `model CoordinationForm`:
   - `escalatedAt DateTime?`
   - `escalatedFromUserId String?`
   - Relation `escalatedFromUser User? @relation("CoordinationFormEscalatedFrom", ...)`
   - `@@index([status, submittedAt])`

2. **User reverse relation** — Thêm vào `model User`:
   - `coordinationFormsEscalatedFrom CoordinationForm[] @relation("CoordinationFormEscalatedFrom")`

2b. **`CoordinationFormApproval.approverId` → nullable** (per Validation Session 1):
   - Đổi `approverId String` → `approverId String?` (line 119)
   - Relation: `approver User? @relation("CFormApprover", fields: [approverId], references: [id])`
   - Backfill: existing rows không bị ảnh hưởng (đều có approverId)
   - **Note:** UI hiển thị approval log cần xử lý `approverId == null` → render "(tự động)" hoặc tương đương

3. **Run migration** —
   ```bash
   npx prisma migrate dev --name add_coordination_form_sla
   ```

4. **Backfill SQL** trong migration file (append vào `migration.sql` sau khi prisma generate):
   ```sql
   -- Mark old pending forms as already-escalated (no notifications sent for these).
   -- Per Validation Session 1: backfill ALL overdue pending forms to avoid notification
   -- burst when deploying.
   UPDATE coordination_forms
   SET escalated_at = submitted_at + INTERVAL '24 hours'
   WHERE status = 'pending_leader'
     AND submitted_at < NOW() - INTERVAL '24 hours';
   ```
   **Quan trọng:** Backfill chỉ set `escalated_at`, không insert vào `coordination_form_approvals` và không tạo `Notification`. Khi user mở phiếu cũ → service phát hiện đã escalated → không re-trigger noti.

5. **Write `lib/coordination-form/sla.ts`** với 3 helpers ở trên.

6. **Write tests** `lib/coordination-form/__tests__/sla.test.ts`:
   - `isOverdue` returns false khi `status !== "pending_leader"`
   - `isOverdue` returns false khi `escalatedAt != null`
   - `isOverdue` returns true khi `submittedAt + 24h < now`
   - `deadlineOf` returns null khi `submittedAt = null`
   - `hoursRemaining` âm khi quá hạn, dương khi chưa

7. **Verify:** `npx prisma migrate status` clean, `npx vitest run lib/coordination-form/__tests__/sla.test.ts` pass.

## Success Criteria

- [ ] Migration apply trên DB dev không lỗi
- [ ] Backfill chạy đúng — query `SELECT count(*) FROM coordination_forms WHERE status='pending_leader' AND escalated_at IS NULL AND submitted_at < NOW() - INTERVAL '24 hours'` = 0
- [ ] `npx tsc --noEmit` clean
- [ ] Test suite cho `sla.ts` pass với 100% coverage 3 functions

## Risk Assessment

- **Risk:** Backfill có thể chuyển nhầm phiếu mới submit qua trạng thái escalated nếu chạy sai timing.
  **Mitigation:** Backfill chỉ chạy 1 lần trong migration, có WHERE rất cụ thể (`submitted_at < NOW() - 24h`). Migration chạy lúc deploy, không có data race.
- **Risk:** Index `[status, submittedAt]` không được dùng nếu query không match thứ tự cột.
  **Mitigation:** Phase 2 query sẽ filter theo `status` trước rồi `submittedAt` → match index prefix.

<!-- Updated: Validation Session 1 - approverId nullable migration gộp vào Phase 1; backfill confirmed all-overdue scope -->

