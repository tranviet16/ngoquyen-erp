"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { projectSchema, categorySchema, projectEntityIdSchema, type ProjectInput, type CategoryInput } from "./schemas";
import { serializeDecimal } from "@/lib/utils/serialize-decimal";
import { queryProjectById } from "./project-query";

export async function listProjects(opts?: { search?: string; status?: string; includeDeleted?: boolean; page?: number; pageSize?: number; ids?: number[] }) {
  await requireReleasedModuleRequest("master-data");
  const { search = "", status, includeDeleted = false, page = 1, pageSize = 20, ids } = opts ?? {};
  const where = {
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(status ? { status } : {}),
    ...(ids !== undefined ? { id: { in: ids } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { code: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { categories: { where: { deletedAt: null } } } } },
    }),
    prisma.project.count({ where }),
  ]);
  return { items: serializeDecimal(items), total, page, pageSize };
}

export async function getProjectById(id: number) {
  await requireReleasedModuleRequest("master-data");
  return queryProjectById(id);
}

/**
 * Mã dự án là duy nhất trong các dự án chưa xoá (index `projects_code_active_unique`). Kiểm trước để
 * báo tên dự án đang giữ mã; nếu hai người lưu cùng lúc thì index vẫn chặn (P2002, xem
 * `projectEditFailure`).
 */
async function assertProjectCodeFree(code: string, exceptId?: number) {
  const other = await prisma.project.findFirst({
    where: { code, deletedAt: null, ...(exceptId !== undefined ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (other) throw new Error(`Mã dự án "${code}" đã được dùng cho dự án "${other.name}"`);
}

/** Không sửa dự án đã xoá mềm (nó không còn hiện ở danh sách nào). */
async function assertProjectActive(id: number) {
  const project = await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!project) throw new Error(`Dự án #${id} không tồn tại hoặc đã bị xoá`);
}

export async function createProject(input: ProjectInput) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const data = projectSchema.parse(input);
  await assertProjectCodeFree(data.code);
  const project = await prisma.project.create({
    data: {
      code: data.code,
      name: data.name,
      ownerInvestor: data.ownerInvestor?.trim() || null,
      contractValue: data.contractValue && data.contractValue !== "" ? data.contractValue : undefined,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      status: data.status,
    },
  });
  revalidatePath("/master-data/projects");
  revalidatePath("/master-data");
  return project;
}

export async function updateProject(id: number, input: ProjectInput) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const data = projectSchema.parse(input);
  await assertProjectActive(id);
  await assertProjectCodeFree(data.code, id);
  const project = await prisma.project.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      // Ô trống = chưa có chủ đầu tư (NULL), không lưu chuỗi rỗng.
      ownerInvestor: data.ownerInvestor?.trim() || null,
      contractValue: data.contractValue !== undefined && data.contractValue !== "" ? data.contractValue : null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      status: data.status,
    },
  });
  revalidatePath(`/master-data/projects/${id}`);
  revalidatePath("/master-data/projects");
  revalidatePath("/master-data");
  revalidatePath("/du-an");
  return project;
}

export async function softDeleteProject(id: number) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const project = await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/master-data/projects");
  revalidatePath("/master-data");
  return project;
}

// ─── Inline-edit patch ────────────────────────────────────────────────────────

import { z } from "zod";

// Project fields safe for inline edit (startDate/endDate/contractValue → form only)
const PROJECT_PATCH_WHITELIST = ["code", "name", "status", "entityId"] as const;

const patchProjectSchema = z.object({
  code: z.string().trim().min(1, "Mã không được để trống").optional(),
  name: z.string().trim().min(1, "Tên không được để trống").optional(),
  status: z.enum(["active", "completed", "paused"]).optional(),
  entityId: projectEntityIdSchema.optional(),
});

type ProjectEntityTx = Pick<
  typeof prisma,
  "$queryRaw" | "entity" | "ledgerTransaction" | "supplierDeliveryDaily" | "ledgerOpeningBalance" | "supplierReconciliation"
>;

/**
 * Chủ thể của công trình là nguồn suy Chủ thể cho mọi ghi công nợ vật tư (chốt kỳ, sổ, số dư, đợt
 * thanh toán). Báo cáo lại nhóm theo Chủ thể LƯU TRÊN DÒNG sổ, nên đổi Chủ thể khi công trình đã có
 * dữ liệu vật tư sẽ tách một cặp NCC × công trình thành hai nhóm. Vì vậy:
 *  - giữ nguyên: luôn được;
 *  - gán lần đầu (đang NULL): được, trừ khi công trình đã có dòng sổ / số dư vật tư mang Chủ thể KHÁC
 *    (dòng cũ được gán công trình trước khi công trình có Chủ thể) — gán phải đúng Chủ thể của dòng;
 *  - đổi sang Chủ thể khác / bỏ gán: chỉ khi công trình chưa có sổ vật tư, phiếu, số dư ban đầu vật
 *    tư hay kỳ đối chiếu (bản ghi chưa xoá).
 *
 * Chạy trong transaction, dòng công trình bị khoá `FOR UPDATE` trước khi đếm: ghi vật tư đọc công
 * trình `FOR SHARE` (`resolveMaterialEntityId`), nên ghi vật tư đầu tiên và đổi Chủ thể không chen
 * nhau — bên đến sau chờ bên kia commit rồi mới đọc / đếm.
 */
async function assertProjectEntityChangeAllowed(tx: ProjectEntityTx, projectId: number, nextEntityId: number | null) {
  const [project] = await tx.$queryRaw<{ entityId: number | null }[]>`
    SELECT "entityId" FROM projects WHERE id = ${projectId} AND "deletedAt" IS NULL FOR UPDATE`;
  if (!project) throw new Error(`Dự án #${projectId} không tồn tại`);
  if (nextEntityId != null) {
    const entity = await tx.entity.findFirst({ where: { id: nextEntityId, deletedAt: null }, select: { id: true } });
    if (!entity) throw new Error(`Chủ thể #${nextEntityId} không tồn tại`);
  }
  if (project.entityId === nextEntityId) return;

  if (project.entityId == null && nextEntityId != null) {
    // Gán lần đầu: dòng sổ / số dư vật tư đã mang công trình phải cùng Chủ thể sẽ gán (bất biến I2).
    const otherEntity = { ledgerType: "material", projectId, entityId: { not: nextEntityId } };
    const [ledgerRows, openings] = await Promise.all([
      tx.ledgerTransaction.count({ where: { ...otherEntity, deletedAt: null } }),
      tx.ledgerOpeningBalance.count({ where: otherEntity }),
    ]);
    const mismatched = [
      ledgerRows && `${ledgerRows} dòng sổ vật tư`,
      openings && `${openings} số dư ban đầu vật tư`,
    ].filter(Boolean);
    if (mismatched.length > 0) {
      throw new Error(
        `Không thể gán Chủ thể #${nextEntityId}: công trình đã có ${mismatched.join(", ")} mang Chủ thể khác. ` +
          `Gán đúng Chủ thể của các dòng đó.`,
      );
    }
    return;
  }

  const [ledgerRows, deliveries, openings, reconciliations] = await Promise.all([
    tx.ledgerTransaction.count({ where: { ledgerType: "material", projectId, deletedAt: null } }),
    tx.supplierDeliveryDaily.count({ where: { projectId, deletedAt: null } }),
    tx.ledgerOpeningBalance.count({ where: { ledgerType: "material", projectId } }),
    tx.supplierReconciliation.count({ where: { projectId, deletedAt: null } }),
  ]);
  const usage = [
    ledgerRows && `${ledgerRows} dòng sổ vật tư`,
    deliveries && `${deliveries} phiếu`,
    openings && `${openings} số dư ban đầu vật tư`,
    reconciliations && `${reconciliations} kỳ đối chiếu`,
  ].filter(Boolean);
  if (usage.length > 0) {
    throw new Error(
      `Không thể đổi Chủ thể: công trình đã có dữ liệu công nợ vật tư (${usage.join(", ")}). ` +
        `Chủ thể của dữ liệu cũ sẽ lệch với công trình.`,
    );
  }
}

export async function patchProject(id: number, patch: Record<string, unknown>) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();

  for (const k of Object.keys(patch)) {
    if (!(PROJECT_PATCH_WHITELIST as readonly string[]).includes(k)) {
      throw new Error(`Field "${k}" không được phép inline edit`);
    }
  }

  const data = patchProjectSchema.parse(patch);
  const entityId = data.entityId;
  // Đổi Chủ thể tự kiểm dự án còn tồn tại dưới khoá FOR UPDATE; các trường khác kiểm ở đây.
  if (entityId === undefined) await assertProjectActive(id);
  if (data.code !== undefined) await assertProjectCodeFree(data.code, id);
  const updated =
    entityId === undefined
      ? await prisma.project.update({ where: { id }, data })
      : // Khoá dòng công trình, kiểm rồi ghi trong cùng transaction (xem assertProjectEntityChangeAllowed).
        await prisma.$transaction(async (tx) => {
          await assertProjectEntityChangeAllowed(tx, id, entityId);
          return tx.project.update({ where: { id }, data });
        });
  revalidatePath(`/master-data/projects/${id}`);
  revalidatePath("/master-data/projects");
  revalidatePath("/master-data");
  revalidatePath("/du-an");
  return updated;
}

export type ProjectEditResult = { ok: true } | { ok: false; message: string };
/** Giữ tên cũ cho chỗ gọi sửa Chủ thể. */
export type ProjectEntityPatchResult = ProjectEditResult;

/**
 * Đổi lỗi nghiệp vụ thành kết quả hiển thị được: bản production chỉ gửi `digest` của lỗi ném từ
 * server action, nên lý do từ chối (trùng mã, đã có dữ liệu vật tư…) sẽ mất. Guard nghiệp vụ ném
 * `new Error(...)` thuần; trùng mã do hai người lưu cùng lúc rơi vào index (P2002). Lỗi khác (DB,
 * hạ tầng) vẫn được ném lại như cũ.
 */
function projectEditFailure(err: unknown): ProjectEditResult {
  if (err instanceof z.ZodError) return { ok: false, message: err.issues.map((i) => i.message).join("; ") };
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return { ok: false, message: "Mã dự án đã được dùng cho dự án khác" };
  }
  if (err instanceof Error && err.constructor === Error) return { ok: false, message: err.message };
  throw err;
}

async function toEditResult(action: () => Promise<unknown>): Promise<ProjectEditResult> {
  try {
    await action();
    return { ok: true };
  } catch (err) {
    return projectEditFailure(err);
  }
}

/** Thêm dự án từ form, trả lý do từ chối thay vì ném lỗi. */
export async function createProjectAction(input: ProjectInput): Promise<ProjectEditResult> {
  await requireReleasedModuleRequest("master-data");
  return toEditResult(() => createProject(input));
}

/** Lưu form "Sửa dự án", trả lý do từ chối thay vì ném lỗi. */
export async function updateProjectAction(id: number, input: ProjectInput): Promise<ProjectEditResult> {
  await requireReleasedModuleRequest("master-data");
  return toEditResult(() => updateProject(id, input));
}

/** Sửa nhanh một ô (mã, tên, trạng thái, Chủ thể) ở danh sách dự án, trả lý do từ chối. */
export async function patchProjectAction(id: number, patch: Record<string, unknown>): Promise<ProjectEditResult> {
  await requireReleasedModuleRequest("master-data");
  return toEditResult(() => patchProject(id, patch));
}

/** Sửa nhanh Chủ thể ở danh sách dự án (lý do từ chối như "đã có dữ liệu vật tư" được trả về). */
export async function patchProjectEntity(id: number, entityId: number | null): Promise<ProjectEditResult> {
  await requireReleasedModuleRequest("master-data");
  return patchProjectAction(id, { entityId });
}

// patchDuAn aliases patchProject — same Prisma model, both paths revalidated
export async function patchDuAn(id: number, patch: Record<string, unknown>) {
  await requireReleasedModuleRequest("master-data");
  return patchProject(id, patch);
}

export async function createCategory(projectId: number, input: CategoryInput) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const data = categorySchema.parse(input);
  const category = await prisma.projectCategory.create({
    data: { ...data, projectId },
  });
  revalidatePath(`/master-data/projects/${projectId}`);
  return category;
}

export async function updateCategory(id: number, projectId: number, input: CategoryInput) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const data = categorySchema.parse(input);
  const category = await prisma.projectCategory.update({ where: { id }, data });
  revalidatePath(`/master-data/projects/${projectId}`);
  return category;
}

export async function softDeleteCategory(id: number, projectId: number) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const category = await prisma.projectCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath(`/master-data/projects/${projectId}`);
  return category;
}
