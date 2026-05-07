---
phase: 2
title: "Service layer + state machine"
status: pending
priority: P1
effort: "2-3h"
dependencies: [1]
---

# Phase 2: Service layer + state machine

## Overview
Implement business logic: create draft, submit, approve/reject (leader & director), cancel, list, getById. Centralized state transitions with optimistic locking.

## Requirements

- Functional: 1 file service exports tất cả mutation + query
- Non-functional: state transition phải atomic; reject double-submit

## Architecture

Pattern: file `lib/coordination-form/coordination-form-service.ts` exports async functions, mỗi function:
1. Resolve session (current user) qua `auth.api.getSession({ headers: await headers() })`
2. Permission check qua `lib/department-rbac.ts` helpers
3. State check qua optimistic update (`where: { id, status: 'expected_status' }`)
4. Append `CoordinationFormApproval` row trong transaction
5. Throw clear Vietnamese errors

State transitions tập trung trong helper `assertTransition(from, action) → toStatus`.

## Related Code Files

- Create: `lib/coordination-form/coordination-form-service.ts` (~200 lines)
- Create: `lib/coordination-form/state-machine.ts` (~50 lines)
- Create: `lib/coordination-form/schemas.ts` (Zod input schemas)

## State machine helper (`state-machine.ts`)

```ts
export const FORM_STATUSES = [
  "draft", "pending_leader", "pending_director",
  "approved", "rejected", "revising", "cancelled",
] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export const TERMINAL: FormStatus[] = ["approved", "rejected", "cancelled"];

type Action =
  | "submit" | "leader_approve" | "leader_reject_revise" | "leader_reject_close"
  | "director_approve" | "director_reject_revise" | "director_reject_close"
  | "resubmit" | "cancel";

const TRANSITIONS: Record<FormStatus, Partial<Record<Action, FormStatus>>> = {
  draft:            { submit: "pending_leader", cancel: "cancelled" },
  pending_leader:   {
    leader_approve: "pending_director",
    leader_reject_revise: "revising",
    leader_reject_close: "rejected",
  },
  pending_director: {
    director_approve: "approved",
    director_reject_revise: "revising",
    director_reject_close: "rejected",
  },
  revising:         { resubmit: "pending_leader", cancel: "cancelled" },
  approved:         {},
  rejected:         {},
  cancelled:        {},
};

export function nextStatus(from: FormStatus, action: Action): FormStatus {
  const to = TRANSITIONS[from]?.[action];
  if (!to) throw new Error(`Không thể ${action} từ trạng thái ${from}`);
  return to;
}
```

## Service exports (`coordination-form-service.ts`)

```ts
// Queries
listForms(opts: { status?: FormStatus; deptId?: number; mine?: boolean; page?: number }): Promise<{items, total, page, pageSize}>
getFormById(id: number): Promise<FormWithRelations | null>

// Mutations (all "use server" callable, but service is plain — actions wrap)
createDraft(input: CreateDraftInput): Promise<CoordinationForm>
updateDraft(id: number, input: UpdateDraftInput): Promise<CoordinationForm>
submitForm(id: number): Promise<CoordinationForm>
cancelForm(id: number): Promise<CoordinationForm>
leaderApprove(id: number, comment?: string): Promise<CoordinationForm>
leaderRejectRevise(id: number, comment: string): Promise<CoordinationForm>
leaderRejectClose(id: number, comment: string): Promise<CoordinationForm>
directorApprove(id: number, comment?: string): Promise<CoordinationForm>
directorRejectRevise(id: number, comment: string): Promise<CoordinationForm>
directorRejectClose(id: number, comment: string): Promise<CoordinationForm>
```

## Critical patterns

**Optimistic state lock** (every state transition):
```ts
const result = await prisma.coordinationForm.updateMany({
  where: { id, status: expectedStatus },
  data: { status: nextStatus, ...timestamps },
});
if (result.count === 0) throw new Error("Phiếu đã được xử lý bởi người khác");
```
**Note:** `updateMany` bypasses audit middleware → must pass `__skipAudit: true`. Audit row added manually via separate `prisma.auditLog.create` OR use single `prisma.$transaction` with `update` (single row by id). Prefer the single-`update` form below for audit consistency:

```ts
// Atomic: single update row + create approval row in same tx
return prisma.$transaction(async (tx) => {
  const found = await tx.coordinationForm.findUnique({ where: { id } });
  if (!found) throw new Error("Không tìm thấy phiếu");
  if (found.status !== expectedStatus) throw new Error("Phiếu đã được xử lý");
  const updated = await tx.coordinationForm.update({
    where: { id },
    data: { status: nextStatus, ...timestamps },
  });
  await tx.coordinationFormApproval.create({
    data: { formId: id, step, approverId, action, comment },
  });
  return updated;
});
```

**Permission check templates:**
```ts
// In leaderApprove:
const ctx = await getUserContext(currentUserId);
if (!ctx?.isLeader || ctx.departmentId !== form.executorDeptId) {
  throw new Error("Chỉ lãnh đạo phòng thực hiện được duyệt");
}

// In directorApprove:
if (!ctx?.isDirector) throw new Error("Chỉ giám đốc được duyệt cuối");

// In createDraft:
if (!ctx?.departmentId) throw new Error("Bạn cần thuộc 1 phòng ban để tạo phiếu");
```

**Submit validation chain:**
```ts
async function submitForm(id: number) {
  const form = await getFormByIdInternal(id);
  if (form.creatorId !== currentUserId) throw new Error("Chỉ creator được submit");
  if (form.status !== "draft" && form.status !== "revising") {
    throw new Error("Chỉ submit được khi ở trạng thái nháp/sửa");
  }
  if (!(await canSubmitFormToDept(form.executorDeptId))) {
    throw new Error("Phòng thực hiện chưa có lãnh đạo");
  }
  // Apply transition
  return tx_transition(id, form.status, "pending_leader", "submit", currentUserId, null);
}
```

**Code generation retry** (in `createDraft`):
```ts
async function createDraftWithCode(data: ...) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await nextFormCode();
    try {
      return await prisma.coordinationForm.create({ data: { code, ...data } });
    } catch (e: any) {
      if (e.code === "P2002" && attempt < 2) continue;  // unique violation, retry
      throw e;
    }
  }
  throw new Error("Không tạo được mã phiếu sau 3 lần thử");
}
```

## Zod schemas (`schemas.ts`)

```ts
export const createDraftSchema = z.object({
  executorDeptId: z.number().int().positive(),
  content: z.string().min(10).max(2000),
  priority: z.enum(["cao", "trung_binh", "thap"]).default("trung_binh"),
  deadline: z.string().datetime().nullable().optional(),
});

export const rejectSchema = z.object({
  comment: z.string().min(5).max(500),
});
```

## Implementation Steps

1. Create `lib/coordination-form/state-machine.ts`
2. Create `lib/coordination-form/schemas.ts`
3. Create `lib/coordination-form/coordination-form-service.ts`:
   - import deps (prisma, auth, headers, dept-rbac, state-machine, code-generator)
   - helper `getCurrentUserId()` reading session
   - private `getFormByIdInternal()` (no permission check)
   - public `getFormById()` (with permission check based on `canView()`)
   - mutations as per state machine
4. `npx tsc --noEmit` pass

## Success Criteria

- [ ] Tất cả 11 service functions exported và type-safe
- [ ] State transitions reject invalid transitions với Vietnamese error
- [ ] Submit chặn nếu phòng thực hiện thiếu leader
- [ ] Optimistic lock chặn double-approve (test bằng 2 tab)
- [ ] `npx tsc --noEmit` pass

## Risk Assessment

- **Audit middleware không catch updateMany** → dùng `update` single-row pattern (đã ghi rõ trên).
- **Self-submit (creator phòng A → executor phòng A):** brainstorm chưa cấm. Quyết định: **ALLOW** ở v1 (creator có thể là member, leader phòng A approve cho member khác). Document trong code comment.
- **Nhiều leader cùng phòng** → leader đầu tiên approve thắng (optimistic lock). OK.
- **Director self-creator self-leader:** một user vừa là director vừa creator vừa leader → có thể tự duyệt phiếu. **Để v1 cho phép** (admin trust). Audit log capture cả history.
