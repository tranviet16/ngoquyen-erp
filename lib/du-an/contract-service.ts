"use server";

/**
 * Hợp đồng dự án (tab "Hợp đồng"). Action ghi trả `ActionResult` qua `runEntryAction` — bản production
 * ẩn thông điệp lỗi ném từ server action. Payload cố định: tạo trả `{ id }`, sửa / xóa trả `{}`
 * (không trả bản ghi Prisma vì có Decimal).
 *
 * Sửa / xóa lấy `projectId` từ DB; hợp đồng không có, đã xóa hoặc của công trình khác đều nhận cùng
 * một câu báo. Service ghi đủ trường mỗi lần lưu và tự suy khóa đối tác từ `partyKind`.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { hasDbErrorCode } from "@/lib/import/import-errors";
import { runEntryAction, type ActionResult } from "./dt-hd-tt/entry-action-result";
import { CONTRACT_NOT_FOUND } from "./contract-labels";
import { contractSchema, type ContractInput } from "./schemas";

const LOG_TAG = "du-an/hop-dong";
const CHECK_VIOLATION = new Set(["23514"]);
const FK_VIOLATION = new Set(["23503"]);

export async function listContracts(projectId: number) {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  return prisma.projectContract.findMany({
    where: { projectId, deletedAt: null },
    include: {
      supplier: { select: { id: true, name: true, deletedAt: true } },
      contractor: { select: { id: true, name: true, deletedAt: true } },
    },
    orderBy: [{ signedDate: { sort: "desc", nulls: "last" } }, { id: "desc" }],
  });
}

/**
 * Đội thi công chọn được ở form hợp đồng: mọi đội đang hoạt động (dữ liệu nền dùng chung, chỉ id +
 * tên). Chỉ phục vụ form nên cần quyền tạo trên công trình.
 */
export async function listContractorOptions(projectId: number): Promise<{ id: number; name: string }[]> {
  await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId } });
  return prisma.contractor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

type ParsedContract = ReturnType<typeof contractSchema.parse>;
type CurrentParty = { supplierId: number | null; contractorId: number | null } | null;

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function trimOrNull(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

/**
 * Bộ trường ghi xuống DB (đủ mọi trường). Khóa đối tác suy từ `partyKind`; loại khác hợp đồng kinh tế
 * thì bộ ba đối tác về null. Gắn mới / đổi đối tác cần đối tác còn hiệu lực; giữ nguyên đối tác đã bị
 * xóa khỏi danh mục thì được. `partyName` trống → tên đối tác (CĐT: `Project.ownerInvestor`).
 */
async function contractFields(data: ParsedContract, current: CurrentParty) {
  const partyKind = data.docType === "contract" ? (data.partyKind ?? null) : null;
  const supplierId = partyKind === "ncc" ? (data.supplierId ?? null) : null;
  const contractorId = partyKind === "doi_thi_cong" ? (data.contractorId ?? null) : null;
  let autoName: string | null = null;

  if (supplierId != null) {
    const s = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true, deletedAt: true } });
    if (!s) throw new Error("NCC không còn trong danh mục — tải lại trang.");
    if (s.deletedAt && supplierId !== current?.supplierId) {
      throw new Error(`NCC «${s.name}» đã bị xóa khỏi danh mục — chọn NCC khác.`);
    }
    autoName = s.name;
  }
  if (contractorId != null) {
    const c = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { name: true, deletedAt: true } });
    if (!c) throw new Error("Đội thi công không còn trong danh mục — tải lại trang.");
    if (c.deletedAt && contractorId !== current?.contractorId) {
      throw new Error(`Đội «${c.name}» đã bị xóa khỏi danh mục — chọn đội khác.`);
    }
    autoName = c.name;
  }
  if (partyKind === "cdt") {
    const p = await prisma.project.findUnique({ where: { id: data.projectId }, select: { ownerInvestor: true } });
    autoName = trimOrNull(p?.ownerInvestor);
  }

  return {
    docName: data.docName,
    docType: data.docType,
    status: data.status,
    partyKind,
    supplierId,
    contractorId,
    partyName: partyKind !== null ? (autoName ?? trimOrNull(data.partyName)) : trimOrNull(data.partyName),
    valueVnd: data.valueVnd ?? null,
    valueTtVnd: data.docType === "contract" ? (data.valueTtVnd ?? null) : null,
    signedDate: toDate(data.signedDate),
    expiryDate: toDate(data.expiryDate),
    storage: trimOrNull(data.storage),
    note: trimOrNull(data.note),
  };
}

/** Đổi lỗi ràng buộc DB sang câu tiếng Việt (lỗi Prisma không được `runAction` trả nguyên văn). */
async function withConstraintMessages<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (hasDbErrorCode(err, CHECK_VIOLATION)) {
      throw new Error("Đối tác hoặc giá trị của hợp đồng không hợp lệ (loại đối tác, khóa đối tác, giá trị TT âm).");
    }
    if (hasDbErrorCode(err, FK_VIOLATION)) throw new Error("Đối tác không còn trong danh mục — tải lại trang.");
    throw err;
  }
}

function revalidateContract(projectId: number, id?: number) {
  revalidatePath(`/du-an/${projectId}/hop-dong`);
  if (id != null) revalidatePath(`/du-an/${projectId}/hop-dong/${id}`);
}

export async function createContract(input: ContractInput): Promise<ActionResult<{ id: number }>> {
  return runEntryAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId: input.projectId } });
    const data = contractSchema.parse(input);
    const fields = await contractFields(data, null);
    const record = await withConstraintMessages(() =>
      // Không `select`: dòng audit tự ghi lưu nguyên bản ghi sau khi tạo / sửa.
      prisma.projectContract.create({ data: { projectId: data.projectId, ...fields } }),
    );
    revalidateContract(data.projectId);
    return { id: record.id };
  });
}

export async function updateContract(id: number, input: ContractInput): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const existing = await prisma.projectContract.findUnique({
      where: { id },
      select: { projectId: true, deletedAt: true, supplierId: true, contractorId: true },
    });
    if (!existing || existing.deletedAt || existing.projectId !== input.projectId) throw new Error(CONTRACT_NOT_FOUND);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    const data = contractSchema.parse({ ...input, projectId: existing.projectId });
    const fields = await contractFields(data, existing);
    await withConstraintMessages(() =>
      prisma.projectContract.update({
        where: { id, projectId: existing.projectId },
        data: { ...fields, updatedAt: new Date() },
      }),
    );
    revalidateContract(existing.projectId, id);
    return {};
  });
}

export async function softDeleteContract(id: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const existing = await prisma.projectContract.findUnique({ where: { id }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== projectId) throw new Error(CONTRACT_NOT_FOUND);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    await prisma.projectContract.update({
      where: { id, projectId: existing.projectId },
      data: { deletedAt: new Date(), updatedAt: new Date() },
      select: { id: true },
    });
    revalidateContract(existing.projectId, id);
    return {};
  });
}
