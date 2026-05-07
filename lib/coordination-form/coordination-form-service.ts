import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getUserContext,
  canSubmitFormToDept,
  type UserContext,
} from "@/lib/department-rbac";
import { getDeptAccessMap, hasDeptAccess, type DeptAccessMap } from "@/lib/dept-access";
import { nextStatus, type FormStatus, type FormAction } from "./state-machine";
import { nextFormCode, isUniqueViolation } from "./code-generator";
import type { CreateDraftInput, UpdateDraftInput } from "./schemas";
import type { CoordinationForm, CoordinationFormApproval, Department, User } from "@prisma/client";
import { getDeptLeaders, getDirectorId } from "@/lib/department-rbac";

const PAGE_SIZE = 20;

export type FormWithRelations = CoordinationForm & {
  creator: Pick<User, "id" | "name" | "email">;
  creatorDept: Pick<Department, "id" | "code" | "name">;
  executorDept: Pick<Department, "id" | "code" | "name">;
  approvals: (CoordinationFormApproval & {
    approver: Pick<User, "id" | "name">;
  })[];
};

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

function canView(
  form: CoordinationForm,
  ctx: UserContext,
  accessMap: DeptAccessMap,
): boolean {
  if (form.creatorId === ctx.userId) return true;
  if (hasDeptAccess(accessMap, form.creatorDeptId, "read")) return true;
  if (hasDeptAccess(accessMap, form.executorDeptId, "read")) return true;
  return false;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listForms(opts: {
  status?: FormStatus;
  mine?: boolean;
  page?: number;
}): Promise<{
  items: FormWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  pendingDirectorCount: number;
}> {
  const { ctx, role, accessMap } = await requireContext();
  const page = Math.max(1, opts.page ?? 1);

  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;

  if (opts.mine) {
    where.creatorId = ctx.userId;
  } else if (accessMap.scope === "scoped") {
    const viewableIds = Array.from(accessMap.grants.keys());
    const orClauses: Record<string, unknown>[] = [{ creatorId: ctx.userId }];
    if (viewableIds.length > 0) {
      orClauses.push({ creatorDeptId: { in: viewableIds } });
      orClauses.push({ executorDeptId: { in: viewableIds } });
    }
    if (ctx.isDirector) {
      orClauses.push({ status: { in: ["pending_director", "approved", "rejected"] } });
    }
    where.OR = orClauses;
  }

  const [items, total, pendingDirectorCount] = await Promise.all([
    prisma.coordinationForm.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, email: true } },
        creatorDept: { select: { id: true, code: true, name: true } },
        executorDept: { select: { id: true, code: true, name: true } },
        approvals: {
          include: { approver: { select: { id: true, name: true } } },
          orderBy: { signedAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.coordinationForm.count({ where }),
    prisma.coordinationForm.count({ where: { status: "pending_director" } }),
  ]);

  return { items: items as FormWithRelations[], total, page, pageSize: PAGE_SIZE, pendingDirectorCount };
}

export async function getFormById(id: number): Promise<FormWithRelations | null> {
  const { ctx, accessMap } = await requireContext();
  const form = await prisma.coordinationForm.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      creatorDept: { select: { id: true, code: true, name: true } },
      executorDept: { select: { id: true, code: true, name: true } },
      approvals: {
        include: { approver: { select: { id: true, name: true } } },
        orderBy: { signedAt: "asc" },
      },
    },
  });
  if (!form) return null;
  if (!canView(form, ctx, accessMap)) throw new Error("Bạn không có quyền xem phiếu này");
  return form as FormWithRelations;
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function createDraft(input: CreateDraftInput): Promise<CoordinationForm> {
  const { ctx } = await requireContext();
  if (ctx.departmentId === null) {
    throw new Error("Bạn cần thuộc 1 phòng ban để tạo phiếu");
  }

  const dept = await prisma.department.findUnique({
    where: { id: input.executorDeptId },
    select: { id: true, isActive: true },
  });
  if (!dept) throw new Error("Phòng thực hiện không tồn tại");
  if (!dept.isActive) throw new Error("Phòng thực hiện đã ngừng hoạt động");

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await nextFormCode();
    try {
      return await prisma.coordinationForm.create({
        data: {
          code,
          creatorId: ctx.userId,
          creatorDeptId: ctx.departmentId,
          executorDeptId: input.executorDeptId,
          content: input.content,
          priority: input.priority,
          deadline: input.deadline ?? null,
          status: "draft",
        },
      });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 2) continue;
      throw e;
    }
  }
  throw new Error("Không tạo được mã phiếu sau 3 lần thử, vui lòng thử lại");
}

export async function updateDraft(
  id: number,
  input: UpdateDraftInput
): Promise<CoordinationForm> {
  const { ctx } = await requireContext();

  return prisma.$transaction(async (tx) => {
    const found = await tx.coordinationForm.findUnique({ where: { id } });
    if (!found) throw new Error("Không tìm thấy phiếu");
    if (found.creatorId !== ctx.userId) throw new Error("Chỉ người tạo được sửa");
    if (found.status !== "draft" && found.status !== "revising") {
      throw new Error("Chỉ sửa được phiếu ở trạng thái nháp hoặc đang sửa");
    }

    if (input.executorDeptId !== undefined) {
      const dept = await tx.department.findUnique({
        where: { id: input.executorDeptId },
        select: { isActive: true },
      });
      if (!dept) throw new Error("Phòng thực hiện không tồn tại");
      if (!dept.isActive) throw new Error("Phòng thực hiện đã ngừng hoạt động");
    }

    const data: Record<string, unknown> = {};
    if (input.executorDeptId !== undefined) data.executorDeptId = input.executorDeptId;
    if (input.content !== undefined) data.content = input.content;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.deadline !== undefined) data.deadline = input.deadline;

    return tx.coordinationForm.update({ where: { id }, data });
  });
}

type TxCallback = (
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  updated: CoordinationForm,
) => Promise<void>;

async function applyTransition(
  id: number,
  expected: FormStatus,
  action: FormAction,
  step: "creator" | "leader" | "director",
  approverId: string,
  comment: string | null,
  extraData: Record<string, unknown> = {},
  txCallback?: TxCallback,
): Promise<CoordinationForm> {
  const to = nextStatus(expected, action);
  return prisma.$transaction(async (tx) => {
    const found = await tx.coordinationForm.findUnique({ where: { id } });
    if (!found) throw new Error("Không tìm thấy phiếu");
    if (found.status !== expected) {
      throw new Error("Phiếu đã được xử lý bởi người khác, vui lòng tải lại trang");
    }
    const updated = await tx.coordinationForm.update({
      where: { id },
      data: { status: to, ...extraData },
    });
    await tx.coordinationFormApproval.create({
      data: { formId: id, step, approverId, action, comment },
    });
    if (txCallback) await txCallback(tx, updated);
    return updated;
  });
}

async function notifyCreator(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  form: CoordinationForm,
  type: "form_approved" | "form_rejected" | "form_revising",
  title: string,
  body: string,
): Promise<void> {
  await tx.notification.create({
    data: {
      userId: form.creatorId,
      type,
      title,
      body,
      link: `/phieu-phoi-hop/${form.id}`,
    },
  });
}

export async function submitForm(id: number): Promise<CoordinationForm> {
  const { ctx } = await requireContext();
  const form = await prisma.coordinationForm.findUnique({ where: { id } });
  if (!form) throw new Error("Không tìm thấy phiếu");
  if (form.creatorId !== ctx.userId) throw new Error("Chỉ người tạo được gửi duyệt");
  if (form.status !== "draft" && form.status !== "revising") {
    throw new Error("Chỉ gửi duyệt được khi phiếu ở trạng thái nháp hoặc đang sửa");
  }
  if (!(await canSubmitFormToDept(form.executorDeptId))) {
    throw new Error("Phòng thực hiện chưa có lãnh đạo, không thể gửi duyệt");
  }
  const action: FormAction = form.status === "draft" ? "submit" : "resubmit";
  const extra = form.status === "draft" ? { submittedAt: new Date() } : {};
  return applyTransition(id, form.status, action, "creator", ctx.userId, null, extra, async (tx, updated) => {
    const leaderIds = await getDeptLeaders(updated.executorDeptId);
    for (const leaderId of leaderIds) {
      if (leaderId === ctx.userId) continue;
      await tx.notification.create({
        data: {
          userId: leaderId,
          type: "form_submitted",
          title: `Phiếu mới chờ duyệt: ${updated.code}`,
          body: updated.content.slice(0, 200),
          link: `/phieu-phoi-hop/${updated.id}`,
        },
      });
    }
  });
}

export async function cancelForm(id: number): Promise<CoordinationForm> {
  const { ctx, role } = await requireContext();
  const form = await prisma.coordinationForm.findUnique({ where: { id } });
  if (!form) throw new Error("Không tìm thấy phiếu");
  if (form.creatorId !== ctx.userId && role !== "admin") {
    throw new Error("Chỉ người tạo hoặc admin được hủy phiếu");
  }
  if (form.status !== "draft" && form.status !== "revising") {
    throw new Error("Chỉ hủy được phiếu ở trạng thái nháp hoặc đang sửa");
  }
  return applyTransition(id, form.status, "cancel", "creator", ctx.userId, null, {
    closedAt: new Date(),
  });
}

async function requireLeaderForExecutor(formId: number): Promise<{
  ctx: UserContext;
  form: CoordinationForm;
}> {
  const { ctx } = await requireContext();
  const form = await prisma.coordinationForm.findUnique({ where: { id: formId } });
  if (!form) throw new Error("Không tìm thấy phiếu");
  if (!ctx.isLeader || ctx.departmentId !== form.executorDeptId) {
    throw new Error("Chỉ lãnh đạo phòng thực hiện được duyệt");
  }
  return { ctx, form };
}

async function requireDirector(formId: number): Promise<{
  ctx: UserContext;
  form: CoordinationForm;
}> {
  const { ctx } = await requireContext();
  const form = await prisma.coordinationForm.findUnique({ where: { id: formId } });
  if (!form) throw new Error("Không tìm thấy phiếu");
  if (!ctx.isDirector) throw new Error("Chỉ giám đốc được duyệt cuối");
  return { ctx, form };
}

export async function leaderApprove(id: number, comment?: string): Promise<CoordinationForm> {
  const { ctx } = await requireLeaderForExecutor(id);
  return applyTransition(id, "pending_leader", "leader_approve", "leader", ctx.userId, comment ?? null, {}, async (tx, updated) => {
    const directorId = await getDirectorId();
    if (directorId && directorId !== ctx.userId) {
      await tx.notification.create({
        data: {
          userId: directorId,
          type: "form_submitted",
          title: `Phiếu chờ giám đốc duyệt: ${updated.code}`,
          body: updated.content.slice(0, 200),
          link: `/phieu-phoi-hop/${updated.id}`,
        },
      });
    }
  });
}

export async function leaderRejectRevise(id: number, comment: string): Promise<CoordinationForm> {
  if (!comment || comment.trim().length < 5) throw new Error("Lý do tối thiểu 5 ký tự");
  const { ctx } = await requireLeaderForExecutor(id);
  return applyTransition(id, "pending_leader", "leader_reject_revise", "leader", ctx.userId, comment, {}, async (tx, u) => {
    await notifyCreator(tx, u, "form_revising", `Phiếu ${u.code} cần sửa lại`, comment);
  });
}

export async function leaderRejectClose(id: number, comment: string): Promise<CoordinationForm> {
  if (!comment || comment.trim().length < 5) throw new Error("Lý do tối thiểu 5 ký tự");
  const { ctx } = await requireLeaderForExecutor(id);
  return applyTransition(id, "pending_leader", "leader_reject_close", "leader", ctx.userId, comment, {
    closedAt: new Date(),
  }, async (tx, u) => {
    await notifyCreator(tx, u, "form_rejected", `Phiếu ${u.code} bị từ chối`, comment);
  });
}

export async function directorApprove(id: number, comment?: string): Promise<CoordinationForm> {
  const { ctx } = await requireDirector(id);
  return applyTransition(id, "pending_director", "director_approve", "director", ctx.userId, comment ?? null, {
    closedAt: new Date(),
  }, async (tx, u) => {
    // Auto-create Task linked to this form
    await tx.task.create({
      data: {
        title: u.content.slice(0, 200),
        description: `Từ phiếu ${u.code}\n\n${u.content}`,
        deptId: u.executorDeptId,
        creatorId: u.creatorId,
        sourceFormId: u.id,
        priority: u.priority,
        deadline: u.deadline,
        status: "todo",
        assigneeId: null,
      },
    });
    // Notify creator
    await notifyCreator(tx, u, "form_approved", `Phiếu ${u.code} đã được duyệt`, "Task đã được tạo trong bảng công việc");
    // Notify leaders of executor dept (so they assign the task)
    const leaderIds = await getDeptLeaders(u.executorDeptId);
    for (const leaderId of leaderIds) {
      if (leaderId === ctx.userId || leaderId === u.creatorId) continue;
      await tx.notification.create({
        data: {
          userId: leaderId,
          type: "task_assigned",
          title: `Task mới từ phiếu ${u.code}`,
          body: "Cần phân công cho thành viên trong phòng",
          link: `/cong-viec`,
        },
      });
    }
  });
}

export async function directorRejectRevise(id: number, comment: string): Promise<CoordinationForm> {
  if (!comment || comment.trim().length < 5) throw new Error("Lý do tối thiểu 5 ký tự");
  const { ctx } = await requireDirector(id);
  return applyTransition(id, "pending_director", "director_reject_revise", "director", ctx.userId, comment, {}, async (tx, u) => {
    await notifyCreator(tx, u, "form_revising", `Phiếu ${u.code} cần sửa lại (giám đốc)`, comment);
  });
}

export async function directorRejectClose(id: number, comment: string): Promise<CoordinationForm> {
  if (!comment || comment.trim().length < 5) throw new Error("Lý do tối thiểu 5 ký tự");
  const { ctx } = await requireDirector(id);
  return applyTransition(id, "pending_director", "director_reject_close", "director", ctx.userId, comment, {
    closedAt: new Date(),
  }, async (tx, u) => {
    await notifyCreator(tx, u, "form_rejected", `Phiếu ${u.code} bị từ chối (giám đốc)`, comment);
  });
}

// ─── Action resolution (server-side) ────────────────────────────────────────

export type AvailableAction =
  | "edit"
  | "submit"
  | "resubmit"
  | "cancel"
  | "leader_approve"
  | "leader_reject_revise"
  | "leader_reject_close"
  | "director_approve"
  | "director_reject_revise"
  | "director_reject_close";

export function resolveAvailableActions(
  form: CoordinationForm,
  ctx: UserContext,
  role: string
): AvailableAction[] {
  const out: AvailableAction[] = [];
  const isCreator = form.creatorId === ctx.userId;
  const isExecutorLeader = ctx.isLeader && ctx.departmentId === form.executorDeptId;

  if (form.status === "draft" && isCreator) out.push("edit", "submit", "cancel");
  if (form.status === "revising" && isCreator) out.push("edit", "resubmit", "cancel");
  if (form.status === "draft" && role === "admin" && !isCreator) out.push("cancel");
  if (form.status === "revising" && role === "admin" && !isCreator) out.push("cancel");
  if (form.status === "pending_leader" && isExecutorLeader) {
    out.push("leader_approve", "leader_reject_revise", "leader_reject_close");
  }
  if (form.status === "pending_director" && ctx.isDirector) {
    out.push("director_approve", "director_reject_revise", "director_reject_close");
  }
  return out;
}
