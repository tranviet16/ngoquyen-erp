---
phase: 3
title: "Notifications"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Notifications

## Overview

Trong `escalateIfOverdue` (Phase 2), sau khi mark `escalatedAt`, gửi notification in-app cho **mọi user có `isDirector = true`**. Reuse `tx.notification.create` pattern đã có trong service.

## Requirements

**Functional:**
- Khi form được escalate, mỗi Director nhận 1 notification với link tới form
- Nếu Director cũng là Creator của form → vẫn nhận (họ cần biết phiếu của mình bị TBP để quá hạn)
- Nếu không có Director nào → escalate vẫn xảy ra, không throw (chỉ log warning)

**Non-functional:**
- Notification gửi trong cùng transaction với update `escalatedAt` (atomic)
- Reuse type naming convention: `coordination_form_escalated`

## Architecture

```ts
// Trong escalateIfOverdue, sau khi update + create approval:

const directors = await tx.user.findMany({
  where: { isDirector: true },
  select: { id: true, name: true },
});

if (directors.length === 0) {
  console.warn(`[SLA Escalation] Form ${formId} escalated but no directors found`);
  return updated;
}

const creator = await tx.user.findUnique({
  where: { id: form.creatorId },
  select: { name: true },
});

for (const director of directors) {
  await tx.notification.create({
    data: {
      userId: director.id,
      type: "coordination_form_escalated",
      title: `Phiếu ${form.code} quá hạn — cần Giám đốc duyệt`,
      body: `Phiếu của ${creator?.name ?? "?"} không được TBP duyệt trong 24h`,
      link: `/van-hanh/phieu-phoi-hop/${formId}`,
    },
  });
}
```

## Related Code Files

**Modify:**
- `lib/coordination-form/coordination-form-service.ts` (extend `escalateIfOverdue`)

**Modify (test):**
- `lib/coordination-form/__tests__/escalate.test.ts` (add assertions for notifications)

## Implementation Steps

1. **Verify `user.isDirector` field tồn tại** trong schema — đọc `prisma/schema.prisma` line ~30-50 cho `model User`. Nếu thiếu thì là blocker → ESCALATE TO USER (theo brainstorm field này đã có vì `lib/acl/effective.ts` dùng `user.isDirector`).

2. **Insert notification logic** vào cuối `escalateIfOverdue` (trước `return updated`), pattern như code mẫu trên.

3. **Update test** `__tests__/escalate.test.ts`:
   - Mock 2 directors trong DB seed
   - Sau `tryEscalate(formId)` → query `notification` table, expect 2 rows với `type = "coordination_form_escalated"`, đúng `link` và `userId`
   - Trường hợp 0 director: escalate vẫn thành công, không có notification, có console warning

4. **Verify type consistency** — search `type:` literals trong codebase:
   ```
   grep -rn '"form_approved"\|"form_rejected"\|"form_submitted"' app/ lib/ components/
   ```
   Đảm bảo notification UI component handle hoặc gracefully ignore type mới `coordination_form_escalated`.

5. **Verify:** chạy lại tests, manual smoke — submit form, fast-forward `submittedAt` 25h, mở detail → check Notification table có row mới cho mỗi director.

## Success Criteria

- [ ] Tất cả user có `isDirector = true` nhận đúng 1 notification per escalation
- [ ] Notification có `link = /van-hanh/phieu-phoi-hop/{id}` click được
- [ ] Không có director → console warning, không throw
- [ ] Notification và `escalatedAt` update trong cùng 1 transaction (rollback cùng nhau nếu có lỗi)
- [ ] Test suite cập nhật pass

## Risk Assessment

- **Risk:** N directors × M overdue forms trong batch escalate → N×M notification inserts có thể chậm.
  **Mitigation:** Expect N (director count) < 5 và M < 50; tổng <250 inserts/batch — acceptable. Nếu chậm sau monitor, đổi `createMany`.

- **Risk:** Notification component UI không handle type mới → display fallback xấu.
  **Mitigation:** Check notification list component (Phase 4 sẽ scan); fallback rendering thường là generic title/body nên ok.

- **Risk:** Director cũng là Leader của executor dept → nhận 2 notifications (submit + escalate).
  **Mitigation:** Acceptable — họ thật sự cần biết cả 2 events. Không dedup.
