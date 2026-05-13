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
import { getDeptLeaders } from "@/lib/department-rbac";
import { isOverdue } from "./sla";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const PAGE_SIZE = 20;

export type FormWithRelations = CoordinationForm & {
  creator: Pick<User, "id" | "name" | "email">;
  creatorDept: Pick<Department, "id" | "code" | "name">;
  executorDept: Pick<Department, "id" | "code" | "name">;
  approvals: (CoordinationFormApproval & {
    approver: Pick<User, "id" | "name"> | null;
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
}> {
  const { ctx, accessMap } = await requireContext();
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
    where.OR = orClauses;
  }

  const include = {
    creator: { select: { id: true, name: true, email: true } },
    creatorDept: { select: { id: true, code: true, name: true } },
    executorDept: { select: { id: true, code: true, name: true } },
    approvals: {
      include: { approver: { select: { id: true, name: true } } },
      orderBy: { signedAt: "asc" as const },
    },
  };

  let [items, total] = await Promise.all([
    prisma.coordinationForm.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.coordinationForm.count({ where }),
  ]);

  const overdueIds = items.filter((f) => isOverdue(f)).map((f) => f.id);
  if (overdueIds.length > 0) {
    await batchEscalate(overdueIds);
    items = await prisma.coordinationForm.findMany({
      where: { id: { in: items.map((f) => f.id) } },
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  return { items: items as FormWithRelations[], total, page, pageSize: PAGE_SIZE };
}

export async function getFormById(id: number): Promise<FormWithRelations | null> {
  const { ctx, accessMap } = await requireContext();
  await tryEscalate(id);
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
  step: "creator" | "leader",
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
      link: `/van-hanh/phieu-phoi-hop/${form.id}`,
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
          link: `/van-hanh/phieu-phoi-hop/${updated.id}`,
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

async function requireLeaderOrDirectorForExecutor(formId: number): Promise<{
  ctx: UserContext;
  form: CoordinationForm;
}> {
  const { ctx } = await requireContext();
  const form = await prisma.coordinationForm.findUnique({ where: { id: formId } });
  if (!form) throw new Error("Không tìm thấy phiếu");

  if (form.escalatedAt) {
    if (!ctx.isDirector) {
      throw new Error("Phiếu đã quá hạn — chỉ Giám đốc duyệt");
    }
    return { ctx, form };
  }

  if (!ctx.isLeader || ctx.departmentId !== form.executorDeptId) {
    throw new Error("Chỉ lãnh đạo phòng thực hiện được duyệt");
  }
  return { ctx, form };
}

// ─── SLA escalation ─────────────────────────────────────────────────────────

async function notifyDirectorsOfEscalation(tx: Tx, form: CoordinationForm): Promise<void> {
  const directors = await tx.user.findMany({
    where: { isDirector: true },
    select: { id: true },
  });
  if (directors.length === 0) {
    console.warn(`[escalate] No isDirector users found for form ${form.code}`);
    return;
  }
  await tx.notification.createMany({
    data: directors.map((d) => ({
      userId: d.id,
      type: "coordination_form_escalated",
      title: `Phiếu quá hạn: ${form.code}`,
      body: `TBP không duyệt trong 24h, chuyển Giám đốc duyệt`,
      link: `/van-hanh/phieu-phoi-hop/${form.id}`,
    })),
  });
}

async function escalateIfOverdueTx(tx: Tx, formId: number): Promise<CoordinationForm | null> {
  const rows = await tx.$queryRaw<CoordinationForm[]>`
    SELECT * FROM coordination_forms WHERE id = ${formId} FOR UPDATE
  `;
  const form = rows[0];
  if (!form) return null;
  if (!isOverdue(form)) return null;

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
      approverId: null,
      action: "escalated",
      comment: "Quá hạn 24h, chuyển Giám đốc",
    },
  });

  await notifyDirectorsOfEscalation(tx, updated);
  return updated;
}

export async function tryEscalate(formId: number): Promise<CoordinationForm | null> {
  try {
    return await prisma.$transaction((tx) => escalateIfOverdueTx(tx, formId));
  } catch (e) {
    console.error(`[escalate] Failed for form ${formId}:`, e);
    return null;
  }
}

async function batchEscalate(formIds: number[]): Promise<void> {
  for (const id of formIds) {
    await tryEscalate(id);
  }
}

export async function leaderApprove(
  id: number,
  assigneeId: string,
  comment?: string,
): Promise<CoordinationForm> {
  const { ctx, form } = await requireLeaderOrDirectorForExecutor(id);
  if (!assigneeId) throw new Error("Cần chọn nhân viên phụ trách trước khi duyệt");

  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, departmentId: true, name: true },
  });
  if (!assignee) throw new Error("Không tìm thấy nhân viên được giao");
  if (assignee.departmentId !== form.executorDeptId) {
    throw new Error("Nhân viên được giao phải thuộc phòng thực hiện");
  }

  return applyTransition(
    id,
    "pending_leader",
    "leader_approve",
    "leader",
    ctx.userId,
    comment ?? null,
    { closedAt: new Date() },
    async (tx, updated) => {
      await tx.task.create({
        data: {
          title: updated.content.slice(0, 200),
          description: `Từ phiếu ${updated.code}\n\n${updated.content}`,
          deptId: updated.executorDeptId,
          creatorId: updated.creatorId,
          sourceFormId: updated.id,
          priority: updated.priority,
          deadline: updated.deadline,
          status: "todo",
          assigneeId: assignee.id,
        },
      });
      await notifyCreator(
        tx,
        updated,
        "form_approved",
        `Phiếu ${updated.code} đã được duyệt`,
        `Đã giao cho ${assignee.name}`,
      );
      if (assignee.id !== updated.creatorId) {
        await tx.notification.create({
          data: {
            userId: assignee.id,
            type: "task_assigned",
            title: `Bạn được giao công việc mới từ phiếu ${updated.code}`,
            body: updated.content.slice(0, 200),
            link: `/van-hanh/cong-viec`,
          },
        });
      }
    },
  );
}

export async function leaderRejectRevise(id: number, comment: string): Promise<CoordinationForm> {
  if (!comment || comment.trim().length < 5) throw new Error("Lý do tối thiểu 5 ký tự");
  const { ctx } = await requireLeaderOrDirectorForExecutor(id);
  return applyTransition(id, "pending_leader", "leader_reject_revise", "leader", ctx.userId, comment, {}, async (tx, u) => {
    await notifyCreator(tx, u, "form_revising", `Phiếu ${u.code} cần sửa lại`, comment);
  });
}

export async function leaderRejectClose(id: number, comment: string): Promise<CoordinationForm> {
  if (!comment || comment.trim().length < 5) throw new Error("Lý do tối thiểu 5 ký tự");
  const { ctx } = await requireLeaderOrDirectorForExecutor(id);
  return applyTransition(id, "pending_leader", "leader_reject_close", "leader", ctx.userId, comment, {
    closedAt: new Date(),
  }, async (tx, u) => {
    await notifyCreator(tx, u, "form_rejected", `Phiếu ${u.code} bị từ chối`, comment);
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
  | "leader_reject_close";

export function resolveAvailableActions(
  form: CoordinationForm,
  ctx: UserContext,
  role: string
): AvailableAction[] {
  const out: AvailableAction[] = [];
  const isCreator = form.creatorId === ctx.userId;
  const isExecutorLeader = ctx.isLeader && ctx.departmentId === form.executorDeptId;
  const isEscalated = form.escalatedAt != null;

  if (form.status === "draft" && isCreator) out.push("edit", "submit", "cancel");
  if (form.status === "revising" && isCreator) out.push("edit", "resubmit", "cancel");
  if (form.status === "draft" && role === "admin" && !isCreator) out.push("cancel");
  if (form.status === "revising" && role === "admin" && !isCreator) out.push("cancel");
  if (form.status === "pending_leader") {
    if (isEscalated) {
      if (ctx.isDirector) out.push("leader_approve", "leader_reject_revise", "leader_reject_close");
    } else if (isExecutorLeader) {
      out.push("leader_approve", "leader_reject_revise", "leader_reject_close");
    }
  }
  return out;
}

// Helper for assignee picker UI: list users in executor dept.
export async function listAssigneeCandidates(formId: number): Promise<Array<{ id: string; name: string; email: string }>> {
  const { form } = await requireLeaderOrDirectorForExecutor(formId);
  const users = await prisma.user.findMany({
    where: { departmentId: form.executorDeptId },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return users;
}
