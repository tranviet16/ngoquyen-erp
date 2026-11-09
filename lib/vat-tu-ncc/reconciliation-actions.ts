"use server";

/**
 * Server action của tab Đối chiếu: tạo / ký / gỡ ký / xoá kỳ đối chiếu, TRẢ `{ ok, … }` thay vì ném —
 * lỗi biên kỳ, kỳ trùng, kỳ chuyển đổi bị khoá, "phiếu chưa chốt"… hiện được trên toast ở bản
 * production (xem action-result.ts). Guard nghiệp vụ / quyền vẫn nằm ở service bên dưới.
 */

import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { createReconciliation, softDeleteReconciliation } from "./reconciliation-service";
import { signReconciliation, unsignReconciliation } from "./reconciliation-derive-service";
import { runAction, type ActionResult } from "./action-result";
import type { ReconciliationInput } from "./schemas";

const LOG_TAG = "vat-tu-ncc.reconciliation-actions";

export async function createReconciliationAction(input: ReconciliationInput): Promise<ActionResult<{ id: number }>> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "create", scope: "module" });
    const record = await createReconciliation(input);
    return { id: record.id };
  });
}

export async function signReconciliationAction(id: number): Promise<ActionResult> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
    await signReconciliation(id);
    return {};
  });
}

export async function unsignReconciliationAction(id: number): Promise<ActionResult> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
    await unsignReconciliation(id);
    return {};
  });
}

export async function softDeleteReconciliationAction(id: number, supplierId: number): Promise<ActionResult> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
    await softDeleteReconciliation(id, supplierId);
    return {};
  });
}
