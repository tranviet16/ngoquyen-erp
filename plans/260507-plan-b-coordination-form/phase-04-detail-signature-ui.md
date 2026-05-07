---
phase: 4
title: "Detail + Signature panel UI"
status: pending
priority: P1
effort: "2-3h"
dependencies: [3]
---

# Phase 4: Detail + Signature panel UI

## Overview
`/phieu-phoi-hop/[id]` — page xem chi tiết phiếu + history approval + signature panel (action buttons phụ thuộc role + status).

## Requirements

- Functional: hiển thị metadata, nội dung, history approvals (chronological), action panel context-aware
- Non-functional: server-render permission check, hide buttons không có quyền (không chỉ disable)

## Architecture

`page.tsx` (Server) → fetch form by id, fetch user context (role, dept, isLeader, isDirector), pass `availableActions: Action[]` to client.

Client signature panel: render buttons theo `availableActions` + dialog confirm cho reject (yêu cầu comment).

## Related Code Files

- Create: `app/(app)/phieu-phoi-hop/[id]/page.tsx` (~80 lines)
- Create: `app/(app)/phieu-phoi-hop/[id]/detail-client.tsx` (~200 lines)
- Modify: `app/(app)/phieu-phoi-hop/actions.ts` (add approve/reject actions)

## Permission resolution (server-side, in `page.tsx`)

```ts
function resolveActions(form: Form, ctx: UserContext): Action[] {
  const actions: Action[] = [];
  const isCreator = form.creatorId === ctx.userId;
  const isExecutorLeader = ctx.isLeader && ctx.departmentId === form.executorDeptId;

  if (form.status === "draft" && isCreator) {
    actions.push("edit", "submit", "cancel");
  }
  if (form.status === "revising" && isCreator) {
    actions.push("edit", "resubmit", "cancel");
  }
  if (form.status === "pending_leader" && isExecutorLeader) {
    actions.push("leader_approve", "leader_reject_revise", "leader_reject_close");
  }
  if (form.status === "pending_director" && ctx.isDirector) {
    actions.push("director_approve", "director_reject_revise", "director_reject_close");
  }
  return actions;
}

function canView(form, ctx): boolean {
  return (
    form.creatorId === ctx.userId ||
    (ctx.isLeader && ctx.departmentId === form.executorDeptId) ||
    ctx.isDirector ||
    ctx.role === "admin"
  );
}
```

## Detail page layout

```
┌─────────────────────────────────────────┐
│ ← Quay lại danh sách    [Status badge]  │
│ # PCV-202605-001                         │
├─────────────────────────────────────────┤
│ Phòng tạo:        Phòng KT (Nguyễn A)   │
│ Phòng thực hiện:  Phòng KH               │
│ Mức ưu tiên:      Cao                    │
│ Hạn chót:         2026-06-15             │
│ Tạo lúc:          2026-05-07 14:30       │
├─────────────────────────────────────────┤
│ Nội dung công việc:                      │
│ {whitespace-pre-wrap content}            │
├─────────────────────────────────────────┤
│ Lịch sử ký duyệt (4):                    │
│ ✓ 2026-05-07 14:35 — Nguyễn A submit    │
│ ✓ 2026-05-07 15:00 — Trần B (Leader KH) │
│   approve "OK triển khai"                │
│ ✗ 2026-05-07 16:20 — Lê C (Giám đốc)    │
│   reject_revise "Bổ sung deadline"      │
│ ✓ 2026-05-08 09:10 — Nguyễn A resubmit  │
├─────────────────────────────────────────┤
│ [Action buttons context-aware]           │
└─────────────────────────────────────────┘
```

## Detail client highlights

```tsx
const [rejectDialog, setRejectDialog] = useState<{ open: boolean; type: "revise" | "close"; step: "leader" | "director" } | null>(null);
const [comment, setComment] = useState("");

function doApprove(action: "leader_approve" | "director_approve") {
  startTransition(async () => {
    try {
      if (action === "leader_approve") await leaderApproveAction(id);
      else await directorApproveAction(id);
      toast.success("Đã duyệt");
      router.refresh();
    } catch (e) { toast.error(e.message); }
  });
}

function doReject() {
  if (comment.length < 5) { toast.error("Lý do tối thiểu 5 ký tự"); return; }
  startTransition(async () => {
    try {
      const fn = `${rejectDialog.step}Reject${rejectDialog.type === "revise" ? "Revise" : "Close"}Action`;
      await actions[fn](id, comment);
      toast.success("Đã từ chối");
      setRejectDialog(null);
      setComment("");
      router.refresh();
    } catch (e) { toast.error(e.message); }
  });
}
```

Action button rendering:
```tsx
{availableActions.includes("submit") && (
  <Button onClick={doSubmit}>Gửi duyệt</Button>
)}
{availableActions.includes("leader_approve") && (
  <Button variant="default" onClick={() => doApprove("leader_approve")}>
    Duyệt (Lãnh đạo)
  </Button>
)}
{availableActions.includes("leader_reject_revise") && (
  <Button variant="outline" onClick={() => setRejectDialog({ open: true, type: "revise", step: "leader" })}>
    Yêu cầu sửa
  </Button>
)}
{availableActions.includes("leader_reject_close") && (
  <Button variant="destructive" onClick={() => setRejectDialog({ open: true, type: "close", step: "leader" })}>
    Từ chối (đóng)
  </Button>
)}
{/* tương tự cho director_* */}
```

## Reject dialog

```tsx
<CrudDialog
  title={rejectDialog?.type === "revise" ? "Yêu cầu sửa lại" : "Từ chối phiếu"}
  open={!!rejectDialog?.open}
  onOpenChange={(o) => !o && setRejectDialog(null)}
>
  <Label>Lý do (tối thiểu 5 ký tự) *</Label>
  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} />
  <div className="flex justify-end gap-2 mt-3">
    <Button variant="outline" onClick={() => setRejectDialog(null)}>Hủy</Button>
    <Button variant="destructive" onClick={doReject} disabled={pending}>Xác nhận</Button>
  </div>
</CrudDialog>
```

## Server actions (extend `actions.ts`)

```ts
export async function leaderApproveAction(id: number, comment?: string) {
  const f = await svc.leaderApprove(id, comment);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  revalidatePath("/phieu-phoi-hop");
  return f;
}
export async function leaderRejectReviseAction(id: number, comment: string) {
  const f = await svc.leaderRejectRevise(id, comment);
  revalidatePath(`/phieu-phoi-hop/${id}`);
  return f;
}
// ... tương tự cho 4 action còn lại
```

## Implementation Steps

1. Create `app/(app)/phieu-phoi-hop/[id]/page.tsx` (server, fetch + permission)
2. Create `detail-client.tsx` (UI + action handlers)
3. Extend `actions.ts` với 6 action approve/reject (leader + director × approve/revise/close)
4. Test luồng: draft → submit → leader approve → director reject_revise → resubmit → director approve
5. `npx tsc --noEmit` pass

## Success Criteria

- [ ] Detail page render đầy đủ metadata + history
- [ ] Action buttons context-aware (creator/leader/director thấy đúng buttons)
- [ ] User không có quyền view → 403 hoặc redirect `/phieu-phoi-hop`
- [ ] Reject yêu cầu comment ≥5 chars (cả client + server)
- [ ] Optimistic lock test: 2 leader cùng approve → 1 thắng, 1 nhận lỗi tiếng Việt
- [ ] `npx tsc --noEmit` pass

## Risk Assessment

- **Action panel hiển thị nhầm** → snapshot perm check ở server (không trust client). Test bằng cách thay đổi role giữa render và submit (race window nhỏ).
- **History dài (>20 entries)** → giữ scroll, không truncate. v1 chấp nhận.
- **Reject comment HTML inject** → `whitespace-pre-wrap` + React escape. OK.
- **Edit draft khi đang ở `revising`** → giống edit `draft`, dùng cùng form. Modal hoặc redirect `/tao-moi?editId=X`. Quyết định: dùng inline edit toggle trong detail page (đỡ thêm route).
