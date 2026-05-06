# Brainstorm: Phiếu phối hợp công việc + Kanban + Phân quyền

Date: 2026-05-06
Status: Design — pending user approval, NOT implemented yet

## Constraints (locked in by user)

| # | Quyết định |
|---|-----------|
| 1 | Department list: config động qua admin UI |
| 2 | 1 user = 1 phòng ban duy nhất |
| 3 | Giám đốc = 1 user duy nhất (singleton) |
| 4 | Reject có 2 nhánh: trả lại sửa (revising) HOẶC đóng phiếu (rejected) |
| 5 | Kanban statuses cố định: Todo / Doing / Review / Done |
| 6 | 1 phiếu = 1 task (auto-create khi approved) |
| 7 | Notification: in-app + Zalo group chat (Zalo cần research) |
| 8 | Triển khai 3 plan tuần tự: A → B → C |

## Principles
YAGNI / KISS / DRY. Không build feature ngoài scope (vd: comment threads, attachments rich, sub-tasks, time tracking — tất cả KHÔNG làm ở v1).

---

## Plan A — Foundation: Department + Membership

### Goal
Cho phép RBAC theo phòng ban song song với role chức năng hiện có.

### Schema changes (`prisma/schema.prisma`)

```prisma
model Department {
  id        Int      @id @default(autoincrement())
  code      String   @unique          // "KT", "VT", "CHCT"
  name      String                    // "Phòng Kế toán"
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members User[]
  @@map("departments")
}

model User {
  // ... existing fields kept
  departmentId Int?     // nullable — admin/director có thể không thuộc phòng nào
  isLeader     Boolean  @default(false)  // lãnh đạo phòng (chỉ valid khi có departmentId)
  isDirector   Boolean  @default(false)  // giám đốc — singleton, enforce app-side
  department   Department? @relation(fields: [departmentId], references: [id])

  @@index([departmentId])
}
```

**Constraints (app-side, không cần DB constraint phức tạp):**
- `isDirector = true` → max 1 user. Service layer kiểm tra trước khi set.
- `isLeader = true` → buộc phải có `departmentId`. Validate ở Zod schema.
- 1 phòng có thể có 0 hoặc nhiều leader (thực tế thường 1, nhưng không hard-lock).

### Helpers (`lib/department-rbac.ts` — NEW)

```ts
export async function getUserContext(userId: string): Promise<{
  user: User;
  departmentId: number | null;
  isLeader: boolean;
  isDirector: boolean;
}>;

export async function isDeptLeader(userId: string, deptId: number): Promise<boolean>;
export async function getDirectorId(): Promise<string | null>;
export async function getDeptLeaders(deptId: number): Promise<string[]>;
```

### Admin UI

- Route: `/admin/phong-ban` (admin only, dùng `hasRole(role, "admin")`)
- CRUD department (code, name, isActive)
- Assign users to departments + set leader/director flags
- Bảng list users với cột "Phòng ban" + "Vai trò" (member/leader/director)

### Files

- Create: `prisma/migrations/26XXXX_add_departments/migration.sql`, `lib/department-rbac.ts`, `lib/department-service.ts`, `app/(app)/admin/phong-ban/page.tsx`, `app/(app)/admin/phong-ban/department-client.tsx`
- Modify: `prisma/schema.prisma`, navigation menu

### Effort: 4–6h

### Risks
- **Director singleton drift**: nếu admin set 2 user `isDirector=true` qua DB tay → app phải tolerate (chọn user đầu tiên + warning log). Không hard-fail.
- **Existing users**: migration mặc định `departmentId=null`, không phá data hiện có.

---

## Plan B — Phiếu phối hợp + Approval workflow

### Goal
CRUD phiếu + 3-step signature flow. Phiếu approved chưa sinh task ở plan này (sẽ làm ở Plan C).

### Schema

```prisma
model CoordinationForm {
  id             Int      @id @default(autoincrement())
  code           String   @unique           // "PCB-202605-001"
  creatorId      String
  creatorDeptId  Int                        // snapshot — phòng của creator lúc tạo
  executorDeptId Int                        // phòng được yêu cầu thực hiện
  content        String   @db.Text
  priority       String                     // "cao" | "trung_binh" | "thap"
  deadline       DateTime?
  status         String   @default("draft") // xem state machine bên dưới
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  submittedAt    DateTime?
  closedAt       DateTime?

  creator        User       @relation(...)
  creatorDept    Department @relation(...)
  executorDept   Department @relation(...)
  approvals      CoordinationFormApproval[]
  task           Task?                      // 1:1, link sau ở Plan C

  @@index([executorDeptId, status])
  @@index([creatorId])
  @@map("coordination_forms")
}

model CoordinationFormApproval {
  id         Int      @id @default(autoincrement())
  formId     Int
  step       String                          // "leader" | "director"
  approverId String
  action     String                          // "approve" | "reject_revise" | "reject_close"
  comment    String?  @db.Text
  signedAt   DateTime @default(now())

  form     CoordinationForm @relation(fields: [formId], references: [id], onDelete: Cascade)
  approver User             @relation(...)

  @@index([formId])
  @@map("coordination_form_approvals")
}
```

### State machine

```
draft ──submit──▶ pending_leader
                      │
                      ├─approve──▶ pending_director
                      │                 │
                      │                 ├─approve──▶ approved  (terminal — Plan C trigger)
                      │                 ├─reject_revise──▶ revising
                      │                 └─reject_close──▶ rejected (terminal)
                      ├─reject_revise──▶ revising
                      └─reject_close──▶ rejected (terminal)

revising ──resubmit──▶ pending_leader   (giữ nguyên approval history)
```

### Permission matrix (Plan B)

| Action | Ai được phép |
|--------|--------------|
| Create draft | Bất kỳ user có `departmentId` |
| Edit draft / revising | Chỉ creator |
| Submit (draft → pending_leader) | Chỉ creator |
| Approve/Reject ở step `leader` | Bất kỳ user có `isLeader=true` AND `departmentId === form.executorDeptId` |
| Approve/Reject ở step `director` | User có `isDirector=true` |
| Cancel form | Creator (chỉ khi `draft` hoặc `revising`) | admin |
| View form | Creator + leader của executorDept + director + admin |

**Lưu ý:** Nếu phòng thực hiện không có leader nào → step `leader` bị stuck. Mitigation: admin UI cảnh báo, hoặc fallback sang director (cần user quyết định — flag dưới).

### UI

- `/phieu-phoi-hop` — list + filter theo status, dept, người tạo
- `/phieu-phoi-hop/tao-moi` — create form
- `/phieu-phoi-hop/[id]` — detail + signature panel (action button hiện theo permission)

### Effort: 6–8h

### Risks
- **Empty leader dept**: phòng thực hiện không có leader → phiếu kẹt. Cần policy.
- **Director vắng mặt**: không có cơ chế ủy quyền tạm. Chấp nhận v1.
- **Snapshot creatorDeptId**: nếu creator chuyển phòng giữa chừng, lịch sử vẫn đúng.

---

## Plan C — Kanban board + Task + Permission + Notification

### Schema

```prisma
model Task {
  id            Int      @id @default(autoincrement())
  title         String
  description   String?  @db.Text
  status        String   @default("todo")     // todo | doing | review | done
  priority      String   @default("trung_binh")
  deadline      DateTime?
  assigneeId    String?                       // null = chưa assign
  deptId        Int                            // phòng phụ trách
  creatorId     String
  sourceFormId  Int?     @unique               // 1:1 link với CoordinationForm
  orderInColumn Int      @default(0)           // drag-drop ordering trong column
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  completedAt   DateTime?

  assignee   User?             @relation("TaskAssignee", fields: [assigneeId], references: [id])
  creator    User              @relation("TaskCreator", fields: [creatorId], references: [id])
  dept       Department        @relation(...)
  sourceForm CoordinationForm? @relation(fields: [sourceFormId], references: [id])

  @@index([deptId, status, orderInColumn])
  @@index([assigneeId, status])
  @@map("tasks")
}
```

KHÔNG làm ở v1: TaskComment, TaskAttachment, sub-tasks, time-tracking, recurring tasks.

### Auto-create từ phiếu (hook ở Plan B service)

Khi `CoordinationForm.status → "approved"`:
```ts
await prisma.task.create({
  data: {
    title: form.content.slice(0, 200),
    description: `Từ phiếu ${form.code}\n\n${form.content}`,
    deptId: form.executorDeptId,
    creatorId: form.creatorId,
    sourceFormId: form.id,
    priority: form.priority,
    deadline: form.deadline,
    status: "todo",
    assigneeId: null,                  // leader phòng thực hiện sẽ assign
  }
});
```

### Permission matrix (Plan C)

| Action | Ai được phép |
|--------|--------------|
| Create task tay (không qua phiếu) | Member của phòng (deptId=own) | leader (any dept của họ) | admin/director (any dept) |
| Edit title/description/priority/deadline | Creator | leader của task.deptId | admin |
| Assign/reassign | Leader của task.deptId | admin |
| Move todo ↔ doing | Assignee | leader của task.deptId |
| Move doing → review | Assignee | leader |
| Move review → done | Leader của task.deptId | creator (nếu task tự tạo, không từ phiếu) |
| Move bất kỳ → todo (rework) | Leader của task.deptId | admin |
| Delete | Creator (chỉ khi status=todo) | admin |
| View | Member của task.deptId | creator | director | admin |

### Kanban UI

- Route: `/cong-viec` (board view) + `/cong-viec/danh-sach` (list view)
- 4 columns cố định: Todo / Doing / Review / Done
- Drag-drop: dùng `@dnd-kit/core` (đã quen Next 16 RSC) — client component
- Filter: theo phòng (default: phòng của user), assignee, priority, có nguồn từ phiếu hay không
- Card hiện: title, priority badge, deadline, assignee avatar, "📋 PCB-..." badge nếu có sourceFormId
- Click card → drawer detail (edit + comment-less view ở v1)

### Notification

**In-app (v1, làm chắc chắn):**
```prisma
model Notification {
  id        Int      @id @default(autoincrement())
  userId    String
  type      String   // "form_submitted" | "form_approved" | "form_rejected" | "task_assigned" | "task_status_changed" | "task_deadline_soon"
  title     String
  body      String
  link      String?  // "/phieu-phoi-hop/123" or "/cong-viec?taskId=45"
  readAt    DateTime?
  createdAt DateTime @default(now())

  user User @relation(...)

  @@index([userId, readAt])
}
```
- Bell icon ở topbar (đã có topbar.tsx)
- Polling 30s hoặc SSE (chọn polling cho KISS ở v1)

**Zalo group chat (v1.5 — research first, KHÔNG block ship Plan C):**
- Zalo Official Account Notification API: chỉ push 1-1, KHÔNG push group được
- Zalo Group: không có public webhook API
- Lựa chọn khả dĩ:
  - (a) Zalo Bot API (private beta, cần đăng ký) — push lên group qua bot token
  - (b) Zapier/Make.com webhook → Zalo (qua bên thứ 3) — phụ thuộc service ngoài
  - (c) Zalo Mini App — quá phức tạp cho needs này
  - (d) Bỏ Zalo, dùng email — đơn giản, ai cũng có
- **Đề xuất**: ship Plan C với in-app notification, sau đó research Zalo riêng (1 plan nhỏ). Nếu Zalo không khả thi → chuyển sang email SMTP.

### Effort: 8–12h (chưa tính Zalo)

### Risks
- **Drag-drop trên RSC**: phải client component, cần optimistic update + server action revalidate. Đã có pattern.
- **orderInColumn race condition**: 2 người drag cùng lúc → tạm chấp nhận last-write-wins ở v1.
- **Director view all**: query có thể nặng nếu nhiều task — cần index + pagination.

---

## Dependency graph

```
Plan A (Department + Membership)
   │
   ├─▶ Plan B (Phiếu + Approval)
   │       │
   │       └─▶ Plan C (Kanban + Task + auto-create từ phiếu approved)
   │
   └─▶ Plan C (cũng cần dept để filter Kanban)
```

A bắt buộc đầu tiên. B và C phụ thuộc A. C phụ thuộc B (cho hook auto-create) — nhưng có thể build skeleton C song song với B (auto-create là 1 hàm riêng, plug vào sau).

## Tổng effort: 18–26h thực thi (chưa tính Zalo, chưa tính debug)

## Decisions chốt cuối (locked 2026-05-06)

1. Mã phiếu: `PCV-YYYYMM-NNN`
2. Department: flat list, không có hierarchy
3. Empty-leader dept: KHÔNG xảy ra — admin phải đảm bảo mỗi phòng có ≥1 leader trước khi phòng đó được chọn làm `executorDept`. Validate ở submit-time: nếu phòng thực hiện chưa có leader → block + thông báo creator.
4. Director vắng: chấp nhận tắc nghẽn v1 (không ủy quyền phó)
5. Notification v1: chỉ in-app. Zalo tách thành plan research riêng sau Plan C.

Schema impact của (3): thêm validation ở `submitForm()` — `assert: getDeptLeaders(form.executorDeptId).length > 0`.

---

## Next steps

- User review design này
- Trả lời 5 câu open trên
- Sau khi approve → chạy `/ck:plan` cho Plan A trước (foundation, không có dep)
- Plan B + C tạo sau khi A xong
