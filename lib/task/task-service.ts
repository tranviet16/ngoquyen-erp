import { headers } from "next/headers";
import type { Department, Prisma, Task, User } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserContext, type UserContext } from "@/lib/department-rbac";
import {
  canMoveTask,
  isValidTaskStatus,
  TASK_STATUSES,
  type TaskMoveRole,
  type TaskStatus,
} from "./state-machine";
import {
  createTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "./schemas";
import { createNotification } from "@/lib/notification/notification-service";
import { getChildCounts, type ChildCounts } from "./subtask-service";

export type TaskWithRelations = Task & {
  assignee: Pick<User, "id" | "name"> | null;
  creator: Pick<User, "id" | "name">;
  dept: Pick<Department, "id" | "code" | "name">;
  sourceForm: { id: number; code: string } | null;
  childCounts?: ChildCounts;
};

async function requireSession(): Promise<{ userId: string; role: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Phiên đăng nhập đã hết hạn");
  return { userId: session.user.id, role: session.user.role ?? "viewer" };
}

async function requireContext(): Promise<{ ctx: UserContext; role: string }> {
  const { userId, role } = await requireSession();
  const ctx = await getUserContext(userId);
  if (!ctx) throw new Error("Không tìm thấy thông tin người dùng");
  return { ctx, role };
}

function canViewTask(task: Task, ctx: UserContext, role: string): boolean {
  if (role === "admin") return true;
  if (ctx.isDirector) return true;
  if (task.creatorId === ctx.userId) return true;
  if (ctx.departmentId === task.deptId) return true;
  return false;
}

function canEditTask(task: Task, ctx: UserContext, role: string): boolean {
  if (role === "admin") return true;
  if (task.creatorId === ctx.userId) return true;
  if (ctx.isLeader && ctx.departmentId === task.deptId) return true;
  return false;
}

function canAssignTask(task: Task, ctx: UserContext, role: string): boolean {
  if (role === "admin") return true;
  if (ctx.isLeader && ctx.departmentId === task.deptId) return true;
  return false;
}

function canDeleteTask(task: Task, ctx: UserContext, role: string): boolean {
  if (role === "admin") return true;
  if (task.creatorId === ctx.userId && task.status === "todo") return true;
  return false;
}

export function moveRole(task: Task, ctx: UserContext, role: string): TaskMoveRole {
  if (role === "admin") return "admin";
  if (ctx.isLeader && ctx.departmentId === task.deptId) return "leader";
  if (task.assigneeId === ctx.userId) return "assignee";
  if (task.creatorId === ctx.userId) return "creator";
  return "none";
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listTasksForBoard(opts: {
  deptId?: number;
  assigneeId?: string;
  priority?: string;
  fromForm?: boolean;
}): Promise<{
  byStatus: Record<TaskStatus, TaskWithRelations[]>;
  ctx: UserContext;
  role: string;
}> {
  const { ctx, role } = await requireContext();

  const where: Prisma.TaskWhereInput = { parentId: null };

  if (role !== "admin" && !ctx.isDirector) {
    const orClauses: Prisma.TaskWhereInput[] = [{ creatorId: ctx.userId }];
    if (ctx.departmentId !== null) {
      orClauses.push({ deptId: ctx.departmentId });
    }
    where.OR = orClauses;
  }

  if (opts.deptId) where.deptId = opts.deptId;
  if (opts.assigneeId) where.assigneeId = opts.assigneeId;
  if (opts.priority) where.priority = opts.priority;
  if (opts.fromForm === true) where.sourceFormId = { not: null };
  if (opts.fromForm === false) where.sourceFormId = null;

  const items = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      dept: { select: { id: true, code: true, name: true } },
      sourceForm: { select: { id: true, code: true } },
    },
    orderBy: [{ status: "asc" }, { orderInColumn: "asc" }, { createdAt: "asc" }],
  });

  const counts = await getChildCounts(items.map((t) => t.id));

  const byStatus: Record<TaskStatus, TaskWithRelations[]> = {
    todo: [],
    doing: [],
    review: [],
    done: [],
  };
  for (const t of items) {
    if (!isValidTaskStatus(t.status)) continue;
    const enriched: TaskWithRelations = { ...(t as TaskWithRelations) };
    const c = counts.get(t.id);
    if (c) enriched.childCounts = c;
    byStatus[t.status].push(enriched);
  }

  return { byStatus, ctx, role };
}

export async function getTaskById(id: number): Promise<TaskWithRelations> {
  const { ctx, role } = await requireContext();
  const t = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      dept: { select: { id: true, code: true, name: true } },
      sourceForm: { select: { id: true, code: true } },
    },
  });
  if (!t) throw new Error("Không tìm thấy task");
  if (!canViewTask(t, ctx, role)) throw new Error("Bạn không có quyền xem task này");
  return t as TaskWithRelations;
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function createTaskManual(input: CreateTaskInput): Promise<Task> {
  const data = createTaskSchema.parse(input);
  const { ctx, role } = await requireContext();

  // Permission: member of dept | leader | admin/director
  const isMember = ctx.departmentId === data.deptId;
  const allowed = role === "admin" || ctx.isDirector || ctx.isLeader || isMember;
  if (!allowed) throw new Error("Bạn không có quyền tạo task ở phòng này");

  // Validate dept active
  const dept = await prisma.department.findUnique({ where: { id: data.deptId } });
  if (!dept || !dept.isActive) throw new Error("Phòng ban không hợp lệ hoặc đã ngừng hoạt động");

  // Validate assignee belongs to dept (if provided)
  if (data.assigneeId) {
    const assignee = await prisma.user.findUnique({
      where: { id: data.assigneeId },
      select: { departmentId: true },
    });
    if (!assignee || assignee.departmentId !== data.deptId) {
      throw new Error("Người được giao phải thuộc phòng đã chọn");
    }
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        deptId: data.deptId,
        assigneeId: data.assigneeId ?? null,
        priority: data.priority,
        deadline: data.deadline,
        creatorId: ctx.userId,
        status: "todo",
      },
    });
    if (data.assigneeId && data.assigneeId !== ctx.userId) {
      await createNotification(
        {
          userId: data.assigneeId,
          type: "task_assigned",
          title: "Bạn có task mới",
          body: task.title,
          link: `/cong-viec?taskId=${task.id}`,
        },
        tx,
      );
    }
    return task;
  });
}

export async function updateTask(id: number, input: UpdateTaskInput): Promise<Task> {
  const data = updateTaskSchema.parse(input);
  const { ctx, role } = await requireContext();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUnique({ where: { id } });
    if (!existing) throw new Error("Không tìm thấy task");
    if (!canEditTask(existing, ctx, role)) throw new Error("Bạn không có quyền sửa task này");
    if (existing.status === "done") throw new Error("Task đã hoàn thành, không thể sửa");

    const patch: Prisma.TaskUpdateInput = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.deadline !== undefined) patch.deadline = data.deadline;

    return tx.task.update({ where: { id }, data: patch });
  });
}

export async function assignTask(id: number, assigneeId: string | null): Promise<Task> {
  const { ctx, role } = await requireContext();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUnique({ where: { id } });
    if (!existing) throw new Error("Không tìm thấy task");
    if (!canAssignTask(existing, ctx, role)) throw new Error("Chỉ lãnh đạo phòng được phân công");

    if (assigneeId) {
      const u = await tx.user.findUnique({
        where: { id: assigneeId },
        select: { departmentId: true },
      });
      if (!u || u.departmentId !== existing.deptId) {
        throw new Error("Người được giao phải thuộc phòng của task");
      }
    }

    const updated = await tx.task.update({
      where: { id },
      data: { assigneeId: assigneeId ?? null },
    });

    if (assigneeId && assigneeId !== ctx.userId) {
      await createNotification(
        {
          userId: assigneeId,
          type: "task_assigned",
          title: "Bạn được giao task",
          body: updated.title,
          link: `/cong-viec?taskId=${updated.id}`,
        },
        tx,
      );
    } else if (!assigneeId && existing.assigneeId && existing.assigneeId !== ctx.userId) {
      await createNotification(
        {
          userId: existing.assigneeId,
          type: "task_unassigned",
          title: "Bạn được gỡ khỏi task",
          body: updated.title,
          link: `/cong-viec?taskId=${updated.id}`,
        },
        tx,
      );
    }

    return updated;
  });
}

export async function moveTask(id: number, toStatus: TaskStatus, toOrder?: number): Promise<Task> {
  if (!isValidTaskStatus(toStatus)) throw new Error("Trạng thái không hợp lệ");
  const { ctx, role } = await requireContext();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUnique({ where: { id } });
    if (!existing) throw new Error("Không tìm thấy task");

    const fromStatus = existing.status;
    if (!isValidTaskStatus(fromStatus)) throw new Error("Trạng thái nguồn không hợp lệ");

    const role0 = moveRole(existing, ctx, role);
    if (!canMoveTask(fromStatus, toStatus, role0, existing.sourceFormId !== null)) {
      throw new Error(
        `Bạn không có quyền chuyển task từ "${fromStatus}" sang "${toStatus}"`,
      );
    }

    const updated = await tx.task.update({
      where: { id },
      data: {
        status: toStatus,
        orderInColumn: toOrder ?? 0,
        completedAt: toStatus === "done" ? new Date() : null,
      },
    });

    if (existing.assigneeId && existing.assigneeId !== ctx.userId) {
      await createNotification(
        {
          userId: existing.assigneeId,
          type: "task_status_changed",
          title: `Task đã được chuyển sang "${toStatus}"`,
          body: updated.title,
          link: `/cong-viec?taskId=${updated.id}`,
        },
        tx,
      );
    }

    if (existing.parentId !== null && toStatus === "done") {
      await maybeBumpParentToReview(tx, existing.parentId, ctx.userId);
    }

    return updated;
  });
}

type TaskTxClient = Pick<typeof prisma, "task" | "notification">;

export async function maybeBumpParentToReview(
  tx: TaskTxClient,
  parentId: number,
  actingUserId: string,
): Promise<boolean> {
  const parent = await tx.task.findUnique({ where: { id: parentId } });
  if (!parent || parent.status === "review" || parent.status === "done") return false;
  const [total, doneCount] = await Promise.all([
    tx.task.count({ where: { parentId } }),
    tx.task.count({ where: { parentId, status: "done" } }),
  ]);
  if (total === 0 || total !== doneCount) return false;

  await tx.task.update({
    where: { id: parentId },
    data: { status: "review", completedAt: null },
  });
  const recipients = new Set<string>();
  if (parent.assigneeId && parent.assigneeId !== actingUserId) recipients.add(parent.assigneeId);
  if (parent.creatorId !== actingUserId) recipients.add(parent.creatorId);
  for (const uid of recipients) {
    await createNotification(
      {
        userId: uid,
        type: "task_status_changed",
        title: 'Task chuyển sang "Chờ duyệt" (mọi việc nhỏ đã hoàn thành)',
        body: parent.title,
        link: `/cong-viec?taskId=${parent.id}`,
      },
      tx,
    );
  }
  return true;
}

export async function deleteTask(id: number): Promise<void> {
  const { ctx, role } = await requireContext();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findUnique({ where: { id } });
    if (!existing) throw new Error("Không tìm thấy task");
    if (!canDeleteTask(existing, ctx, role))
      throw new Error("Chỉ creator (khi task ở 'todo') hoặc admin được xoá");
    await tx.task.delete({ where: { id } });
  });
}

export async function listDeptMembers(deptId: number): Promise<Array<{ id: string; name: string; email: string }>> {
  const rows = await prisma.user.findMany({
    where: { departmentId: deptId },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

export { TASK_STATUSES };
