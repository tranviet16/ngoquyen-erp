"use server";

/**
 * Server action của lưới phiếu ngày: bọc createDelivery / updateDelivery / softDeleteDelivery
 * (delivery-service.ts) và TRẢ kết quả thay vì ném lỗi.
 *
 * Lý do: ở bản production, React Flight chỉ gửi `digest` của lỗi ném ra từ server action — thông
 * điệp bị ẩn — nên lỗi nghiệp vụ như "Kỳ … đã được NCC ký" hay mốc chuyển đổi (`cutover_locked`)
 * không hiện được trên toast. Lỗi nghiệp vụ (MaterialScopeError, ModuleRequestError, Error thuần
 * của các guard, lỗi zod) được trả nguyên văn; lỗi khác (DB, hạ tầng) được ghi log và trả thông
 * điệp chung để không lộ chi tiết nội bộ (xem action-result.ts).
 */

import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { createDelivery, updateDelivery, softDeleteDelivery } from "./delivery-service";
import { runAction, type ActionResult } from "./action-result";
import type { DeliveryInput } from "./schemas";

export type DeliveryActionResult = ActionResult;

const GENERIC_MESSAGE = "Lỗi hệ thống khi lưu phiếu — thử lại hoặc liên hệ admin.";

function run(action: () => Promise<unknown>): Promise<DeliveryActionResult> {
  return runAction(
    "vat-tu-ncc.delivery-actions",
    async () => {
      await action();
      return {};
    },
    GENERIC_MESSAGE,
  );
}

export async function createDeliveryAction(input: DeliveryInput): Promise<DeliveryActionResult> {
  return run(async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "create", scope: "module" });
    await createDelivery(input);
  });
}

export async function updateDeliveryAction(id: number, input: DeliveryInput): Promise<DeliveryActionResult> {
  return run(async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
    await updateDelivery(id, input);
  });
}

export async function deleteDeliveryAction(id: number, supplierId: number): Promise<DeliveryActionResult> {
  return run(async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
    await softDeleteDelivery(id, supplierId);
  });
}
