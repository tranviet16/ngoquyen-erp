"use server";

import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { ModuleRequestError, requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { createSupplier } from "./supplier-service";
import { createContractor } from "./contractor-service";
import { createEntity } from "./entity-service";
import { createItem } from "./item-service";
import { createProject } from "./project-service";
import { contractorSchema, entitySchema, itemSchema, projectSchema, supplierSchema } from "./schemas";
import { findSimilarNames } from "./name-match";
import {
  QUICK_CREATE_LABELS,
  type ItemType,
  type QuickCreateKind,
  type QuickCreatedRecord,
  type QuickCreateResult,
} from "./quick-create-types";

type NamedRow = { id: number; name: string; code?: string; unit?: string; type?: string };

function toRecord(kind: QuickCreateKind, row: NamedRow): QuickCreatedRecord {
  return {
    kind,
    id: row.id,
    name: row.name,
    ...(row.code !== undefined ? { code: row.code } : {}),
    ...(row.unit !== undefined ? { unit: row.unit } : {}),
    ...(kind === "item" && row.type ? { itemType: row.type as ItemType } : {}),
  };
}

/** Bản ghi chưa xoá của một loại danh mục — để so tên gần trùng. */
function listLive(kind: QuickCreateKind): Promise<NamedRow[]> {
  const where = { deletedAt: null };
  switch (kind) {
    case "supplier":
      return prisma.supplier.findMany({ where, select: { id: true, name: true } });
    case "contractor":
      return prisma.contractor.findMany({ where, select: { id: true, name: true } });
    case "entity":
      return prisma.entity.findMany({ where, select: { id: true, name: true } });
    case "item":
      return prisma.item.findMany({ where, select: { id: true, name: true, code: true, unit: true, type: true } });
    case "project":
      return prisma.project.findMany({ where, select: { id: true, name: true, code: true } });
  }
}

/** Mã vật tư / dự án là duy nhất trong bản ghi chưa xoá: báo tên bản ghi đang giữ mã. */
async function assertCodeFree(kind: "item" | "project", code: string) {
  const other =
    kind === "item"
      ? await prisma.item.findFirst({ where: { code, deletedAt: null }, select: { name: true } })
      : await prisma.project.findFirst({ where: { code, deletedAt: null }, select: { name: true } });
  if (other) throw new Error(`Mã "${code}" đã được dùng cho ${QUICK_CREATE_LABELS[kind]} "${other.name}"`);
}

/** Kiểm dữ liệu và tạo bản ghi qua đúng hàm tạo của trang Danh mục (cùng audit, cùng revalidate). */
async function validateAndCreate(
  kind: QuickCreateKind,
  input: unknown,
  allowSimilarName: boolean,
): Promise<QuickCreateResult> {
  const create = async (name: string, run: () => Promise<NamedRow>): Promise<QuickCreateResult> => {
    if (!allowSimilarName) {
      const similar = findSimilarNames(name, await listLive(kind));
      if (similar.length > 0) {
        return {
          ok: false,
          code: "similar_name",
          message: `Đã có ${QUICK_CREATE_LABELS[kind]} tên gần giống "${name}".`,
          similar: similar.map((row) => toRecord(kind, row)),
        };
      }
    }
    return { ok: true, record: toRecord(kind, await run()) };
  };

  switch (kind) {
    case "supplier": {
      const data = supplierSchema.parse(input);
      return create(data.name, () => createSupplier(data));
    }
    case "contractor": {
      const data = contractorSchema.parse(input);
      return create(data.name, () => createContractor(data));
    }
    case "entity": {
      const data = entitySchema.parse(input);
      return create(data.name, () => createEntity(data));
    }
    case "item": {
      const data = itemSchema.parse(input);
      await assertCodeFree("item", data.code);
      return create(data.name, () => createItem(data));
    }
    case "project": {
      const data = projectSchema.parse(input);
      await assertCodeFree("project", data.code);
      return create(data.name, () => createProject(data));
    }
    default:
      return { ok: false, message: "Loại danh mục không hợp lệ" };
  }
}

function quickCreateFailure(err: unknown): QuickCreateResult {
  if (err instanceof ZodError) return { ok: false, message: err.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return { ok: false, message: "Mã đã được dùng cho bản ghi khác" };
  }
  if (err instanceof ModuleRequestError) {
    return { ok: false, message: err.reason === "unauthorized" ? "Phiên đăng nhập đã hết hạn" : "Bạn không có quyền tạo danh mục" };
  }
  if (err instanceof Error) return { ok: false, message: err.message };
  return { ok: false, message: "Không tạo được bản ghi" };
}

/**
 * Tạo nhanh một bản ghi danh mục từ ô chọn ở màn hình nhập liệu (chỉ admin, như trang Danh mục).
 * Tên gần trùng bản ghi đã có → trả `similar_name` kèm danh sách để người dùng chọn bản ghi cũ hoặc
 * gọi lại với `allowSimilarName` để vẫn tạo mới. Mã vật tư / dự án trùng thì luôn từ chối.
 */
export async function quickCreateRecordAction(
  kind: QuickCreateKind,
  input: unknown,
  opts: { allowSimilarName?: boolean } = {},
): Promise<QuickCreateResult> {
  try {
    await requireReleasedModuleRequest("master-data");
    await requireActiveAdmin();
    return await validateAndCreate(kind, input, opts.allowSimilarName === true);
  } catch (err) {
    return quickCreateFailure(err);
  }
}
