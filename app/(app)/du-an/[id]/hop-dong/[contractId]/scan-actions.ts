"use server";

/**
 * Bản scan hợp đồng: tải lên, xóa mềm (quyền sửa công trình), xóa vĩnh viễn (thêm: admin).
 *
 * Quyền luôn kiểm theo `projectId` lấy từ DB qua hợp đồng; `projectId` client gửi chỉ để đối chiếu —
 * hợp đồng / scan không có, đã xóa, hoặc thuộc công trình khác đều nhận cùng một câu báo. Trả
 * `ActionResult` qua `runEntryAction`: tải lên trả `{ id }`, còn lại trả `{}`. Dòng audit do Prisma
 * extension ghi (create / update / delete) kèm người thao tác.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { runEntryAction, type ActionResult } from "@/lib/du-an/dt-hd-tt/entry-action-result";
import { CONTRACT_NOT_FOUND } from "@/lib/du-an/contract-labels";
import { purgeScan, saveContractScan, softDeleteScan } from "@/lib/du-an/contract-scan-service";

const LOG_TAG = "du-an/hop-dong-scan";

function toId(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(CONTRACT_NOT_FOUND);
  return n;
}

/** Scan của đúng công trình client đang xem; mặc định chỉ scan còn hiệu lực của hợp đồng còn hiệu lực. */
async function findScan(scanId: number, claimedProjectId: number, includeDeleted = false) {
  const scan = await prisma.projectContractAttachment.findUnique({
    where: { id: scanId },
    select: { id: true, contractId: true, storedPath: true, deletedAt: true, contract: { select: { projectId: true, deletedAt: true } } },
  });
  // Xóa vĩnh viễn (admin) nhận cả scan / hợp đồng đã xóa mềm — lối gỡ chặn hoàn tác import.
  if (!scan || (!includeDeleted && (scan.deletedAt || scan.contract.deletedAt)) || scan.contract.projectId !== claimedProjectId) {
    throw new Error(CONTRACT_NOT_FOUND);
  }
  return scan;
}

function revalidateDetail(projectId: number, contractId: number) {
  revalidatePath(`/du-an/${projectId}/hop-dong/${contractId}`);
}

export async function uploadContractScan(formData: FormData): Promise<ActionResult<{ id: number }>> {
  return runEntryAction(LOG_TAG, async () => {
    const contractId = toId(formData.get("contractId"));
    const claimedProjectId = toId(formData.get("projectId"));
    const file = formData.get("file");
    const contract = await prisma.projectContract.findUnique({ where: { id: contractId }, select: { projectId: true, deletedAt: true } });
    if (!contract || contract.deletedAt || contract.projectId !== claimedProjectId) throw new Error(CONTRACT_NOT_FOUND);
    const { userId } = await requireReleasedModuleRequest("du-an", {
      minLevel: "edit",
      scope: { kind: "project", projectId: contract.projectId },
    });
    if (!(file instanceof File)) throw new Error("Chưa chọn tệp");
    const id = await saveContractScan({ projectId: contract.projectId, contractId, uploaderId: userId, file });
    revalidateDetail(contract.projectId, contractId);
    return { id };
  });
}

export async function deleteContractScan(scanId: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const scan = await findScan(toId(scanId), toId(projectId));
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: scan.contract.projectId } });
    await softDeleteScan(scan.id);
    revalidateDetail(scan.contract.projectId, scan.contractId);
    return {};
  });
}

/** Xóa vĩnh viễn (kể cả scan / hợp đồng đã xóa mềm) — chỉ admin; không khôi phục được. */
export async function purgeContractScan(scanId: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const scan = await findScan(toId(scanId), toId(projectId), true);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: scan.contract.projectId } });
    await requireActiveAdmin();
    await purgeScan(scan.id, scan.storedPath);
    revalidateDetail(scan.contract.projectId, scan.contractId);
    return {};
  });
}
