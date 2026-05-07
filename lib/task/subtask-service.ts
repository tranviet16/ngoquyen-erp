import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserContext, type UserContext } from "@/lib/department-rbac";
import { getDeptAccessMap, hasDeptAccess, type DeptAccessMap } from "@/lib/dept-access";

export interface ChildCounts {
  done: number;
  total: number;
}

export interface SubtaskRow {
  id: number;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: Date;
}

async function requireSession(): Promise<{ userId: string; role: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Phiên đăng nhập đã hết hạn");
  return { userId: session.user.id, role: session.user.role ?? "viewer" };
}

async function requireContext(): Promise<{ ctx: UserContext; role: string; accessMap: DeptAccessMap }> {
  const { userId, role } = await requireSession();
  const ctx = await getUserContext(userId);
  if (!ctx) throw new Error("Không tìm thấy thông tin người dùng");
  const accessMap = await getDeptAccessMap(userId);
  return { ctx, role, accessMap };
}

function canEditTask(
  task: { creatorId: string; deptId: number },
  ctx: UserContext,
  role: string,
): boolean {
  if (role === "admin") return true;
  if (task.creatorId === ctx.userId) return true;
  if (ctx.isLeader && ctx.departmentId === task.deptId) return true;
  return false;
}

function canViewTask(
  task: { creatorId: string; deptId: number },
  ctx: UserContext,
  accessMap: DeptAccessMap,
): boolean {
  if (task.creatorId === ctx.userId) return true;
  return hasDeptAccess(accessMap, task.deptId, "read");
}

/**
 * Fetch {done, total} counts for a list of parent task IDs in 2 groupBy queries.
 * Empty Map entries mean a parent has no children.
 */
export async function getChildCounts(parentIds: number[]): Promise<Map<number, ChildCounts>> {
  const out = new Map<number, ChildCounts>();
  if (parentIds.length === 0) return out;

  const [totals, dones] = await Promise.all([
    prisma.task.groupBy({
      by: ["parentId"],
      where: { parentId: { in: parentIds } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["parentId"],
      where: { parentId: { in: parentIds }, status: "done" },
      _count: { _all: true },
    }),
  ]);

  for (const row of totals) {
    if (row.parentId == null) continue;
    out.set(row.parentId, { total: row._count._all, done: 0 });
  }
  for (const row of dones) {
    if (row.parentId == null) continue;
    const cur = out.get(row.parentId);
    if (cur) cur.done = row._count._all;
  }
  return out;
}

export async function listChildren(parentId: number): Promise<SubtaskRow[]> {
  const { ctx, accessMap } = await requireContext();
  const parent = await prisma.task.findUnique({
    where: { id: parentId },
    select: { id: true, deptId: true, creatorId: true },
  });
  if (!parent) throw new Error("Không tìm thấy task cha");
  if (!canViewTask(parent, ctx, accessMap)) throw new Error("Bạn không có quyền xem");

  const rows = await prisma.task.findMany({
    where: { parentId },
    orderBy: [{ orderInColumn: "asc" }, { createdAt: "asc" }],
    include: { assignee: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    assigneeId: r.assigneeId,
    assigneeName: r.assignee?.name ?? null,
    createdAt: r.createdAt,
  }));
}

export async function deleteSubtask(id: number): Promise<void> {
  const { ctx, role } = await requireContext();
  await prisma.$transaction(async (tx) => {
    const sub = await tx.task.findUnique({
      where: { id },
      select: { id: true, parentId: true, deptId: true, creatorId: true },
    });
    if (!sub) throw new Error("Không tìm thấy việc nhỏ");
    if (sub.parentId == null) throw new Error("Đây không phải việc nhỏ");
    const parent = await tx.task.findUnique({
      where: { id: sub.parentId },
      select: { creatorId: true, deptId: true },
    });
    if (!parent) throw new Error("Không tìm thấy task cha");
    const allowed =
      role === "admin" ||
      sub.creatorId === ctx.userId ||
      canEditTask(parent, ctx, role);
    if (!allowed) throw new Error("Bạn không có quyền xoá việc nhỏ này");
    await tx.task.delete({ where: { id } });
  });
}

export async function reorderSubtasks(parentId: number, orderedIds: number[]): Promise<void> {
  const { ctx, role } = await requireContext();

  await prisma.$transaction(async (tx) => {
    const parent = await tx.task.findUnique({
      where: { id: parentId },
      select: { id: true, deptId: true, creatorId: true },
    });
    if (!parent) throw new Error("Không tìm thấy task cha");
    if (!canEditTask(parent, ctx, role)) throw new Error("Bạn không có quyền sắp xếp việc nhỏ");

    const children = await tx.task.findMany({
      where: { parentId },
      select: { id: true },
    });
    const childIds = new Set(children.map((c) => c.id));
    if (orderedIds.length !== childIds.size) {
      throw new Error("Danh sách sắp xếp không khớp số việc nhỏ");
    }
    for (const id of orderedIds) {
      if (!childIds.has(id)) throw new Error("ID việc nhỏ không hợp lệ");
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await tx.task.update({
        where: { id: orderedIds[i] },
        data: { orderInColumn: i },
      });
    }
  });
}

export async function createSubtask(
  parentId: number,
  input: { title: string; assigneeId?: string | null; priority?: string },
): Promise<SubtaskRow> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 200) throw new Error("Tiêu đề từ 1-200 ký tự");
  const priority = input.priority ?? "trung_binh";

  const { ctx, role } = await requireContext();

  return prisma.$transaction(async (tx) => {
    const parent = await tx.task.findUnique({
      where: { id: parentId },
      select: { id: true, deptId: true, creatorId: true, parentId: true },
    });
    if (!parent) throw new Error("Không tìm thấy task cha");
    if (parent.parentId != null) throw new Error("Không thể tạo việc nhỏ từ một việc nhỏ (giới hạn 1 cấp)");
    if (!canEditTask(parent, ctx, role)) throw new Error("Bạn không có quyền tạo việc nhỏ ở task này");

    if (input.assigneeId) {
      const u = await tx.user.findUnique({
        where: { id: input.assigneeId },
        select: { departmentId: true },
      });
      if (!u || u.departmentId !== parent.deptId) {
        throw new Error("Người được giao phải thuộc phòng của task cha");
      }
    }

    const created = await tx.task.create({
      data: {
        title,
        deptId: parent.deptId,
        creatorId: ctx.userId,
        parentId: parent.id,
        assigneeId: input.assigneeId ?? null,
        priority,
        status: "todo",
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    return {
      id: created.id,
      title: created.title,
      status: created.status,
      priority: created.priority,
      assigneeId: created.assigneeId,
      assigneeName: created.assignee?.name ?? null,
      createdAt: created.createdAt,
    };
  });
}
