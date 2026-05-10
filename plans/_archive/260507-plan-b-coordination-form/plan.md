---
title: "Plan B — Coordination Form + 3-Step Approval"
status: completed
priority: P1
effort: "8-12h"
dependencies: ["260506-plan-a-department-foundation"]
blocks: ["260507-plan-c-kanban-task"]
parent: ../260506-phieu-phoi-hop-kanban-brainstorm/brainstorm-summary.md
mode: deep
---

# Plan B — Phiếu phối hợp công việc + Approval workflow

CRUD phiếu phối hợp giữa các phòng ban + 3-step signature flow. KHÔNG sinh task ở plan này (Plan C sẽ làm).

Brainstorm gốc: [brainstorm-summary.md](../260506-phieu-phoi-hop-kanban-brainstorm/brainstorm-summary.md)
Plan A (foundation): [Plan A](../260506-plan-a-department-foundation/plan.md)

## Locked decisions từ brainstorm

| # | Decision |
|---|----------|
| 1 | Mã phiếu: `PCV-YYYYMM-NNN` (zero-padded 3 digits, reset mỗi tháng) |
| 2 | Department flat list (đã có ở Plan A) |
| 3 | Phòng thực hiện phải có ≥1 leader → block submit nếu không có |
| 4 | Director vắng → tắc nghẽn ở v1 (không ủy quyền) |
| 5 | Reject 2 nhánh: `reject_revise` (creator sửa, resubmit) hoặc `reject_close` (terminal) |
| 6 | Notification: chỉ in-app v1 (defer Plan C) — Plan B KHÔNG có notification |
| 7 | 1 phiếu = 1 task — chỉ trigger ở Plan C |

## Phases

| # | Phase | File | Status | Effort |
|---|-------|------|--------|--------|
| 1 | Schema + migration + code generator | [phase-01-schema-and-codegen.md](phase-01-schema-and-codegen.md) | completed | 1h |
| 2 | Service layer + state machine | [phase-02-service-layer.md](phase-02-service-layer.md) | completed | 2-3h |
| 3 | List + Create UI | [phase-03-list-create-ui.md](phase-03-list-create-ui.md) | completed | 2-3h |
| 4 | Detail + Signature panel UI | [phase-04-detail-signature-ui.md](phase-04-detail-signature-ui.md) | completed | 2-3h |
| 5 | Verify + nav link + smoke test | [phase-05-verify.md](phase-05-verify.md) | completed | 30m |

## State machine (canonical)

```
draft ──submit──▶ pending_leader
                      │
                      ├─approve──▶ pending_director
                      │                 │
                      │                 ├─approve──▶ approved  (terminal)
                      │                 ├─reject_revise──▶ revising
                      │                 └─reject_close──▶ rejected (terminal)
                      ├─reject_revise──▶ revising
                      └─reject_close──▶ rejected (terminal)

revising ──resubmit──▶ pending_leader   (history giữ nguyên, append approval mới)

draft ──cancel──▶ cancelled (terminal, only by creator)
revising ──cancel──▶ cancelled (terminal, only by creator)
```

**Terminal states:** `approved`, `rejected`, `cancelled`. Không có transition ra khỏi terminal.

## Permission matrix

| Action | Ai được phép |
|--------|--------------|
| Create draft | User có `departmentId != null` |
| Edit draft / revising | Chỉ creator |
| Submit (draft/revising → pending_leader) | Chỉ creator |
| Cancel | Creator (chỉ khi `draft` hoặc `revising`) hoặc admin |
| Approve/Reject step `leader` | User có `isLeader=true` AND `departmentId === form.executorDeptId` |
| Approve/Reject step `director` | User có `isDirector=true` |
| View form | Creator + leaders của executorDept + director + admin |

## Validation rules (server-side)

- Submit chặn nếu `executorDept.canSubmitFormToDept() === false` (không có leader)
- Submit chặn nếu `creatorDeptId === executorDeptId` (không tự gửi cho phòng mình) — **hỏi user xác nhận** (xem red-team)
- `priority` ∈ {`cao`, `trung_binh`, `thap`}
- `deadline` (nếu có) phải > `submittedAt`
- `content` length 10..2000 chars

## Out of scope (KHÔNG làm ở Plan B)

- Notification (in-app/Zalo) — defer Plan C
- Auto-create Task khi approved — defer Plan C (sẽ thêm 1 hook ở `approveByDirector()`)
- File attachment lên phiếu
- Comment thread
- Email gửi creator/approver
- Bulk approve
- Edit phiếu sau khi approved (immutable)
- Audit query UI (đã có audit log tự động ở `lib/prisma.ts`)

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Code generation collision (2 user submit cùng lúc) | UNIQUE constraint trên `code` + retry-on-conflict 1 lần trong service |
| State transition race (2 leader cùng approve) | Optimistic check: where status='pending_leader' AND id=X. Nếu update affected=0 → throw "Phiếu đã được xử lý" |
| Phòng thực hiện đổi leader sau submit | Snapshot không cần — query lại `getDeptLeaders()` mỗi lần render. Leader cũ mất quyền approve ngay. |
| Creator chuyển phòng giữa chừng | `creatorDeptId` snapshot ở row → lịch sử đúng |
| Director vắng → backlog | App-side warning ở list page (đếm `pending_director` count). Không hard-fail. |

## Red-team findings (xem [red-team-review.md](red-team-review.md))

## Validation results (xem [validation.md](validation.md))
