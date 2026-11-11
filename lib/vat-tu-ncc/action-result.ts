/**
 * Kết quả server action của công nợ vật tư: TRẢ `{ ok: true, … } | { ok: false, message }` thay vì
 * ném lỗi. Ở bản production React Flight chỉ gửi `digest` của lỗi ném ra từ server action — thông
 * điệp bị ẩn — nên lỗi nghiệp vụ ("Kỳ … đã được NCC ký", mốc chuyển đổi `cutover_locked`, công
 * trình chưa có Chủ thể `missing_entity`…) không hiện được trên toast.
 *
 * Không "use server": file chỉ chứa helper dùng chung cho các file action (`*-actions.ts`). Client
 * chỉ được `import type` từ đây (file kéo theo module phía server).
 */

import { ZodError } from "zod";
import { ModuleRequestError } from "@/lib/acl/released-module-request";
import { MaterialScopeError, type MaterialScopeErrorCode } from "./pair-scope";

/** `code`: mã lỗi nghiệp vụ của MaterialScopeError (vd. `signed_period`, `cutover_locked`) nếu có. */
export type ActionFailure = { ok: false; message: string; code?: MaterialScopeErrorCode };
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFailure;

export const GENERIC_ACTION_MESSAGE = "Lỗi hệ thống — thử lại hoặc liên hệ admin.";

/**
 * Thông điệp hiển thị cho người dùng. Lỗi nghiệp vụ (MaterialScopeError, ModuleRequestError, Error
 * thuần của các guard, lỗi zod) được trả nguyên văn; lỗi khác (Prisma, DB, hạ tầng — đều là lớp con
 * riêng của Error) trả `generic` để không lộ chi tiết nội bộ.
 */
export function userFacingMessage(err: unknown, generic: string = GENERIC_ACTION_MESSAGE): string {
  if (err instanceof MaterialScopeError || err instanceof ModuleRequestError) return err.message;
  if (err instanceof ZodError) return err.issues.map((issue) => issue.message).join("; ") || generic;
  if (err instanceof Error && err.constructor === Error && err.message) return err.message;
  return generic;
}

/**
 * Chạy `action` và đóng gói kết quả. Lỗi không phải nghiệp vụ được ghi log phía server (`logTag`)
 * trước khi trả thông điệp chung.
 */
export async function runAction<T extends object>(
  logTag: string,
  action: () => Promise<T>,
  generic: string = GENERIC_ACTION_MESSAGE,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await action()) };
  } catch (err) {
    const message = userFacingMessage(err, generic);
    if (message === generic) console.error(`[${logTag}]`, err);
    return err instanceof MaterialScopeError ? { ok: false, message, code: err.code } : { ok: false, message };
  }
}
