"use server";

/**
 * Mã nhóm của "Đối chiếu DT-HĐ-TT" (COC-BTLT, THEP-TRON…): mã, tên, NCC phụ trách (= đầu mối của
 * công trình), cờ vật tư chính (Phần I DT-TT). Quyền theo công trình: xem `read`, thêm `create`, sửa /
 * xóa `edit`. Mỗi lần ghi khóa công trình; đầu mối phải thuộc đúng công trình; mã trùng → thông điệp
 * tiếng Việt; xóa mềm, và bị từ chối khi còn ánh xạ dùng mã nhóm. Action ghi trả `ActionResult`.
 */

import type { ProjectGroupCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { aliasCountsByGroup } from "./alias-groups";
import { rowGone, runEntryAction, type ActionResult } from "./entry-action-result";
import { entryIdSchema } from "./entry-schemas";
import { assertCounterpartyInProject, assertProjectActive, refChanged, revalidateMappingChange, withUniqueMessage } from "./entry-write-guards";
import { lockProjectDtHdTt } from "./project-lock";
import {
  assertPatchKeys, groupCodeCreateSchema, groupCodeFieldsSchema, mergePatch,
  type GroupCodeCreateInput, type GroupCodeFields, type GroupCodePatch,
} from "./register-schemas";

export interface GroupCodeRow {
  id: number;
  code: string;
  name: string;
  counterpartyId: number | null;
  /** Tên đầu mối (cả đầu mối đã xóa — để dòng vẫn hiện tên). */
  counterpartyName: string | null;
  isMainMaterial: boolean;
  sortOrder: number;
  note: string | null;
  /** Số ánh xạ đang dùng mã nhóm. */
  aliasCount: number;
}

const LOG_TAG = "du-an.dt-hd-tt.group-code";
const GONE = rowGone("Mã nhóm");
const duplicateCode = (code: string) => `Mã nhóm "${code}" đã có trong công trình`;

type GroupCodeRecord = ProjectGroupCode & { counterparty: { name: string } | null };
const WITH_DETAILS = { counterparty: { select: { name: true } } } as const;

/** `aliasCount` theo Mã nhóm HIỆU LỰC của alias (hd / tt gán vào Dòng DT → nhóm của dòng DT). */
function toRow(g: GroupCodeRecord, aliasCount: number): GroupCodeRow {
  return {
    id: g.id, code: g.code, name: g.name, counterpartyId: g.counterpartyId, counterpartyName: g.counterparty?.name ?? null,
    isMainMaterial: g.isMainMaterial, sortOrder: g.sortOrder, note: g.note, aliasCount,
  };
}

async function assertCodeFree(tx: Pick<typeof prisma, "projectGroupCode">, projectId: number, code: string, exceptId: number | null): Promise<void> {
  const dup = await tx.projectGroupCode.findFirst({
    where: { projectId, code, deletedAt: null, ...(exceptId === null ? {} : { id: { not: exceptId } }) },
    select: { id: true },
  });
  if (dup) throw new Error(duplicateCode(code));
}

export async function listGroupCodes(projectId: number): Promise<GroupCodeRow[]> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const [rows, counts] = await Promise.all([
    prisma.projectGroupCode.findMany({ where: { projectId, deletedAt: null }, include: WITH_DETAILS, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    aliasCountsByGroup(prisma, projectId),
  ]);
  return rows.map((g) => toRow(g, counts.get(g.id) ?? 0));
}

export async function createGroupCode(input: GroupCodeCreateInput): Promise<ActionResult<{ row: GroupCodeRow }>> {
  return runEntryAction(LOG_TAG, async () => {
    const { projectId, ...fields } = groupCodeCreateSchema.parse(input);
    await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId } });
    const row = await withUniqueMessage(
      () =>
        prisma.$transaction(async (tx) => {
          await lockProjectDtHdTt(tx, [projectId]);
          await assertProjectActive(tx, projectId);
          await assertCounterpartyInProject(tx, projectId, fields.counterpartyId);
          await assertCodeFree(tx, projectId, fields.code, null);
          return tx.projectGroupCode.create({ data: { projectId, ...fields }, include: WITH_DETAILS });
        }),
      duplicateCode(fields.code),
    );
    revalidateMappingChange(projectId);
    return { row: toRow(row, 0) }; // mã mới: chưa ánh xạ nào dùng
  });
}

/** Sửa mã nhóm: chỉ các trường trong bản vá, trộn với dòng đọc lại dưới khóa. */
export async function updateGroupCode(id: number, projectId: number, patch: GroupCodePatch): Promise<ActionResult<{ row: GroupCodeRow }>> {
  return runEntryAction(LOG_TAG, async () => {
    const rowId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    assertPatchKeys(patch, Object.keys(groupCodeFieldsSchema.shape));
    const existing = await prisma.projectGroupCode.findUnique({ where: { id: rowId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(GONE);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    let code = "";
    const row = await withUniqueMessage(
      () =>
        prisma.$transaction(async (tx) => {
          await lockProjectDtHdTt(tx, [scopeId]);
          const current = await tx.projectGroupCode.findFirst({ where: { id: rowId, projectId: scopeId, deletedAt: null } });
          if (!current) throw new Error(GONE);
          const stored: GroupCodeFields = {
            code: current.code, name: current.name, counterpartyId: current.counterpartyId, isMainMaterial: current.isMainMaterial,
            sortOrder: current.sortOrder, note: current.note,
          };
          const fields = groupCodeFieldsSchema.parse(mergePatch(stored, patch));
          code = fields.code;
          if (refChanged(current.counterpartyId, fields.counterpartyId)) await assertCounterpartyInProject(tx, scopeId, fields.counterpartyId);
          if (fields.code !== current.code) await assertCodeFree(tx, scopeId, fields.code, rowId);
          return tx.projectGroupCode.update({ where: { id: rowId, projectId: scopeId }, data: fields, include: WITH_DETAILS });
        }),
      () => duplicateCode(code),
    );
    revalidateMappingChange(scopeId);
    return { row: toRow(row, (await aliasCountsByGroup(prisma, scopeId)).get(rowId) ?? 0) };
  });
}

/** Xóa mềm; từ chối khi còn ánh xạ dùng mã nhóm (dòng của chúng sẽ mất nhóm trong báo cáo). */
export async function softDeleteGroupCode(id: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const rowId = entryIdSchema.parse(id);
    const scopeId = entryIdSchema.parse(projectId);
    const existing = await prisma.projectGroupCode.findUnique({ where: { id: rowId }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== scopeId) throw new Error(GONE);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    await prisma.$transaction(async (tx) => {
      await lockProjectDtHdTt(tx, [scopeId]);
      const current = await tx.projectGroupCode.findFirst({ where: { id: rowId, projectId: scopeId, deletedAt: null }, select: { code: true } });
      if (!current) throw new Error(GONE);
      // Đếm theo nhóm hiệu lực: bản sao nhóm cũ trên alias hd / tt không chặn xóa.
      const used = (await aliasCountsByGroup(tx, scopeId)).get(rowId) ?? 0;
      if (used > 0) throw new Error(`Mã nhóm "${current.code}" đang dùng ở ${used} ánh xạ — đổi các ánh xạ đó sang mã khác trước khi xóa`);
      await tx.projectGroupCode.update({ where: { id: rowId, projectId: scopeId }, data: { deletedAt: new Date() } });
    });
    revalidateMappingChange(scopeId);
    return {};
  });
}
