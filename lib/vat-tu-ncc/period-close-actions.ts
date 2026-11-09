"use server";

/**
 * Server action của tab Chốt kỳ: bọc previewPeriodClose / commitPeriodClose (period-close-service.ts)
 * và TRẢ `{ ok, … }` thay vì ném — lỗi biên kỳ, kỳ đã ký, mốc chuyển đổi, công trình chưa có Chủ
 * thể… hiện được trên toast ở bản production (xem action-result.ts).
 */

import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { commitPeriodClose, previewPeriodClose, type PeriodClosePreview, type PeriodRangeInput } from "./period-close-service";
import { runAction, type ActionResult } from "./action-result";

const LOG_TAG = "vat-tu-ncc.period-close-actions";

export async function previewPeriodCloseAction(
  supplierId: number,
  projectId: number,
  range?: PeriodRangeInput,
): Promise<ActionResult<{ preview: PeriodClosePreview }>> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("vat-tu-ncc");
    return { preview: await previewPeriodClose(supplierId, projectId, range) };
  });
}

export async function commitPeriodCloseAction(
  supplierId: number,
  projectId: number,
  range: PeriodRangeInput,
  prices: Array<{ deliveryId: number; unitPrice: number }>,
): Promise<ActionResult<{ closedCount: number; totalAmountTt: string }>> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
    return commitPeriodClose(supplierId, projectId, range, prices);
  });
}
