"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { projectSchema, categorySchema, type ProjectInput, type CategoryInput } from "./schemas";
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

export async function createProject(input: ProjectInput) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const data = projectSchema.parse(input);
  const project = await prisma.project.create({
    data: {
      code: data.code,
      name: data.name,
      ownerInvestor: data.ownerInvestor,
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
  const project = await prisma.project.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      ownerInvestor: data.ownerInvestor,
      contractValue: data.contractValue !== undefined && data.contractValue !== "" ? data.contractValue : null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      status: data.status,
    },
  });
  revalidatePath(`/master-data/projects/${id}`);
  revalidatePath("/master-data/projects");
  revalidatePath("/master-data");
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
const PROJECT_PATCH_WHITELIST = ["code", "name", "status"] as const;

const patchProjectSchema = z.object({
  code: z.string().min(1, "Mã không được để trống").optional(),
  name: z.string().min(1, "Tên không được để trống").optional(),
  status: z.enum(["active", "completed", "paused"]).optional(),
});

export async function patchProject(id: number, patch: Record<string, unknown>) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();

  for (const k of Object.keys(patch)) {
    if (!(PROJECT_PATCH_WHITELIST as readonly string[]).includes(k)) {
      throw new Error(`Field "${k}" không được phép inline edit`);
    }
  }

  const data = patchProjectSchema.parse(patch);
  const updated = await prisma.project.update({ where: { id }, data });
  revalidatePath(`/master-data/projects/${id}`);
  revalidatePath("/master-data/projects");
  revalidatePath("/master-data");
  revalidatePath("/du-an");
  return updated;
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
