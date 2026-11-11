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
import { createDelivery, updateDelivery, softDeleteDelivery, type DeliveryLedgerStatus } from "./delivery-service";
import { runAction, type ActionResult } from "./action-result";
import type { DeliveryInput } from "./schemas";

export type DeliveryActionResult = ActionResult;
/** Thêm / sửa phiếu còn trả phiếu đã vào công nợ chưa, để lưới báo cho người nhập. */
export type DeliverySaveResult = ActionResult<{ ledgerStatus: DeliveryLedgerStatus }>;

const GENERIC_MESSAGE = "Lỗi hệ thống khi lưu phiếu — thử lại hoặc liên hệ admin.";
const LOG_TAG = "vat-tu-ncc.delivery-actions";

/**
 * `opts.overrideLocked` (thêm / sửa / xoá): admin đã xác nhận thao tác trên phiếu trong kỳ đã ký /
 * kỳ chuyển đổi (lần gọi thứ hai sau khi lần đầu trả `code: "signed_period" | "cutover_locked"`).
 * Server tự kiểm admin.
 */
export async function createDeliveryAction(
  input: DeliveryInput,
  opts?: { overrideLocked?: boolean },
): Promise<DeliverySaveResult> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "create", scope: "module" });
    const { ledgerStatus } = await createDelivery(input, { overrideLocked: opts?.overrideLocked === true });
    return { ledgerStatus };
  }, GENERIC_MESSAGE);
}

export async function updateDeliveryAction(
  id: number,
  input: DeliveryInput,
  opts?: { overrideLocked?: boolean },
): Promise<DeliverySaveResult> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
    const { ledgerStatus } = await updateDelivery(id, input, { overrideLocked: opts?.overrideLocked === true });
    return { ledgerStatus };
  }, GENERIC_MESSAGE);
}

export async function deleteDeliveryAction(
  id: number,
  supplierId: number,
  opts?: { overrideLocked?: boolean },
): Promise<DeliveryActionResult> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
    await softDeleteDelivery(id, supplierId, { overrideLocked: opts?.overrideLocked === true });
    return {};
  }, GENERIC_MESSAGE);
}
