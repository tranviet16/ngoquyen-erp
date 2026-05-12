---
phase: 5
title: "Detail page UI cleanup"
status: completed
priority: P1
effort: "3h"
dependencies: [3]
---

# Phase 5: Detail page UI cleanup

## Overview

Remove director approve/reject UI from coordination-form detail. Add an assignee picker to the leader-approval flow. Update inbox/dashboard to drop director-pending columns.

## Requirements

- Leader's "Duyệt" button opens a modal/inline panel with assignee picker (employees in `executorDeptId`, active only) + comment field.
- "Duyệt" button disabled until assignee selected.
- Director buttons removed from detail page.
- Inbox/dashboard: remove "Chờ giám đốc duyệt" column/section.

## Related Code Files

- Modify: `app/(app)/phieu-phoi-hop/[id]/detail-client.tsx` — remove director controls; add assignee picker into leader-approve.
- Create: `app/(app)/phieu-phoi-hop/[id]/leader-approve-modal.tsx` (split out of detail-client if it grows >200 lines).
- Modify: `app/(app)/phieu-phoi-hop/page.tsx` (or list view) — drop pending_director column.
- Modify: dashboard widgets that show pending counts.
- Modify: server action wrapping `leaderApprove` to forward `assigneeId`.

## Implementation Steps

1. Build server query: list active users where `deptId = executorDeptId`. Reuse if exists.
2. Add `<AssigneePicker>` (combobox / select with search) to leader-approve form.
3. Wire submit → server action `leaderApprove({ formId, assigneeId, comment })`.
4. Disable submit when no assignee.
5. Delete director buttons + their server-action imports from detail-client.
6. Update inbox + counts UI to remove `pending_director`.
7. `npx tsc --noEmit` then click-test in browser.

## Success Criteria

- [ ] Leader can no longer approve without picking an assignee.
- [ ] No director controls visible anywhere in coordination-form UI.
- [ ] Approving creates a Task immediately visible in assignee's Kanban.

## Risk Assessment

- Risk: AssigneePicker slow on large depts. Mitigation: server-side search, paginate at 100.
- Risk: stale optimistic state if approve fails post-validation. Mitigation: rely on server toast + revalidatePath.
