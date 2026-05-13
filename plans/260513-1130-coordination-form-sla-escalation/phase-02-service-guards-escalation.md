---
phase: 2
title: "Service guards & escalation"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Service guards & escalation

## Overview

Thêm `escalateIfOverdue` vào `coordination-form-service.ts` (idempotent, race-safe). Wire vào `getCoordinationForm` và `listForms` (lazy on-read). Relax authorization để Director duyệt được phiếu đã escalate, khoá TBP.

## Requirements

**Functional:**
- Khi user mở detail của 1 phiếu quá hạn → tự động escalate trước khi return form
- Khi user load list → batch escalate tất cả phiếu quá hạn visible với user đó
- TBP gọi `leaderApprove`/`leaderReject*` trên phiếu escalated → throw error
- Director gọi cùng action → success (reuse code, không duplicate)
- Approval row mới tạo có `step = "auto_escalated"`, `action = "escalated"`, `approverId = null` (system action)

**Non-functional:**
- Idempotent: gọi `escalateIfOverdue(id)` N lần → chỉ 1 lần thực sự update
- Race-safe: 2 concurrent calls → exactly 1 thắng

## Architecture

```ts
// Trong coordination-form-service.ts

async function escalateIfOverdue(
  tx: Prisma.TransactionClient,
  formId: number,
): Promise<CoordinationForm | null> {
  // Re-fetch under lock — Postgres SELECT FOR UPDATE
  const rows = await tx.$queryRaw<CoordinationForm[]>`
    SELECT * FROM coordination_forms WHERE id = ${formId} FOR UPDATE
  `;
  const form = rows[0];
  if (!form || !isOverdue(form)) return null;

  // Find current leader(s) — capture first leader as escalatedFromUserId
  const leaders = await getDeptLeaders(form.executorDeptId);
  const fromUserId = leaders[0] ?? null;

  const updated = await tx.coordinationForm.update({
    where: { id: formId },
    data: { escalatedAt: new Date(), escalatedFromUserId: fromUserId },
  });

  await tx.coordinationFormApproval.create({
    data: {
      formId,
      step: "auto_escalated",
      approverId: null,  // system action — schema nullable per Phase 1 migration
      action: "escalated",
      comment: "Quá hạn 24h, chuyển Giám đốc",
      signedAt: new Date(),
    },
  });

  return updated;
}

// Public wrapper for callers outside a txn
export async function tryEscalate(formId: number): Promise<CoordinationForm | null> {
  return prisma.$transaction((tx) => escalateIfOverdue(tx, formId));
}

// Batch version cho list view
async function batchEscalate(formIds: number[]): Promise<Set<number>> {
  const escalated = new Set<number>();
  for (const id of formIds) {
    const r = await tryEscalate(id);
    if (r) escalated.add(id);
  }
  return escalated;
}
```

**Authorization update** trong `requireLeaderForExecutor`:
```ts
async function requireLeaderOrDirectorForExecutor(formId: number) {
  const { ctx } = await requireContext();
  const form = await prisma.coordinationForm.findUnique({ where: { id: formId } });
  if (!form) throw new Error("Không tìm thấy phiếu");

  // Already escalated → only Director can act
  if (form.escalatedAt) {
    if (!ctx.isDirector) {
      throw new Error("Phiếu đã quá hạn — chỉ Giám đốc duyệt");
    }
    return { ctx, form };
  }

  // Not escalated → only executor-dept leader
  if (!ctx.isLeader || ctx.departmentId !== form.executorDeptId) {
    throw new Error("Chỉ lãnh đạo phòng thực hiện được duyệt");
  }
  return { ctx, form };
}
```

Replace `requireLeaderForExecutor` → `requireLeaderOrDirectorForExecutor` trong `leaderApprove`, `leaderRejectRevise`, `leaderRejectClose`.

**Wire lazy escalate:**
- `getCoordinationForm(id)` — gọi `tryEscalate(id)` trước khi load form
- `listForms({...})` — sau khi fetch items, filter `items.filter(f => isOverdue(f))`, gọi `batchEscalate`, re-fetch

## Related Code Files

**Modify:**
- `lib/coordination-form/coordination-form-service.ts`
- `prisma/schema.prisma` (nếu cần đổi `CoordinationFormApproval.approverId` thành nullable — kiểm tra trước)

**Create:**
- `lib/coordination-form/__tests__/escalate.test.ts`

## Implementation Steps

1. **Schema prerequisite** — Phase 1 đã migrate `approverId` thành nullable (per Validation Session 1). Trong escalateIfOverdue, pass `approverId: null` cho approval row.

2. **Import sla helpers** vào `coordination-form-service.ts`:
   ```ts
   import { isOverdue } from "./sla";
   ```

3. **Implement `escalateIfOverdue`** (private helper) và `tryEscalate` (public wrapper) như code mẫu trên.

4. **Implement `batchEscalate`** dùng cho list view.

5. **Wire vào `getCoordinationForm`** (hoặc tên tương đương — đọc file để xác nhận):
   ```ts
   export async function getCoordinationForm(id: number) {
     await tryEscalate(id);  // best-effort, returns null if not overdue
     // ... existing fetch logic
   }
   ```

6. **Wire vào `listForms`** sau initial fetch:
   ```ts
   const items = await prisma.coordinationForm.findMany({ ... });
   const overdueIds = items.filter(isOverdue).map(f => f.id);
   if (overdueIds.length > 0) {
     await batchEscalate(overdueIds);
     // re-fetch to get fresh escalatedAt
     return listForms(opts);  // or selectively re-query
   }
   return { items, ... };
   ```
   **Optimization:** Tránh recursion bằng cách re-fetch chỉ những id bị escalate, merge lại.

7. **Replace `requireLeaderForExecutor`** với `requireLeaderOrDirectorForExecutor` ở 3 chỗ: `leaderApprove`, `leaderRejectRevise`, `leaderRejectClose`. Đổi tên function hoặc giữ tên cũ nhưng update logic.

8. **Update `resolveAvailableActions`** để Director thấy actions khi form escalated.

9. **Write tests** (`__tests__/escalate.test.ts`):
   - `escalateIfOverdue` no-op khi form chưa quá hạn
   - `escalateIfOverdue` set `escalatedAt` khi overdue
   - Call 2x → second is no-op (idempotent)
   - TBP gọi `leaderApprove` sau escalate → throw
   - Director gọi `leaderApprove` → success, tạo Task
   - **Skip race test** trong unit (cần integration DB) — viết note manual test

10. **Verify:** `npx tsc --noEmit` clean, tests pass.

## Success Criteria

- [ ] `tryEscalate(formId)` idempotent — gọi 2 lần trả về null lần 2
- [ ] TBP gọi `leaderApprove` trên form escalated → error "Phiếu đã quá hạn — chỉ Giám đốc duyệt"
- [ ] Director gọi `leaderApprove` trên form escalated → success, Task được tạo
- [ ] List view với 5 form quá hạn → tất cả escalate trong 1 transaction batch
- [ ] `npx tsc --noEmit` clean
- [ ] Test suite escalate pass

## Risk Assessment

- **Risk:** `SELECT FOR UPDATE` qua `$queryRaw` lose Prisma type safety.
  **Mitigation:** Cast result type rõ ràng; integration test cover happy path.

- **Risk:** Re-fetch trong `listForms` có thể infinite loop nếu logic sai.
  **Mitigation:** Đặt flag/depth limit hoặc dùng selective re-query thay vì recursion.

- **Risk:** Director count = 0 trong system → form mãi pending.
  **Mitigation:** Phase 3 sẽ log warning nếu không có director; admin grant `isDirector` qua UI hiện có.

<!-- Updated: Validation Session 1 - approverId nullable resolved in Phase 1; director auth strict to isDirector only -->

