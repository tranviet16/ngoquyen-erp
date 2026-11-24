/**
 * Kết quả của các action ghi ở sổ nhập liệu "Đối chiếu DT-HĐ-TT": TRẢ `{ ok: true, … } | { ok: false,
 * message }` thay vì ném. Bản production chỉ gửi `digest` của lỗi ném từ server action, nên lý do từ
 * chối ("Đầu mối không thuộc công trình này", "chưa có hạng mục"…) sẽ mất.
 *
 * Dựa trên `runAction` của công nợ vật tư: lỗi nghiệp vụ (Error thuần, zod) trả nguyên văn, lỗi khác
 * (DB, hạ tầng) ghi log và trả thông điệp chung. Thêm: từ chối quyền đổi sang câu tiếng Việt.
 * Không "use server" — chỉ import từ các service; client chỉ dùng kiểu trả về của action.
 */

import { ModuleRequestError } from "@/lib/acl/released-module-request";
import { runAction, type ActionResult } from "@/lib/vat-tu-ncc/action-result";

export type { ActionResult };

const ACL_MESSAGE: Record<string, string> = {
  unauthorized: "Phiên đăng nhập đã hết — đăng nhập lại rồi thử lại.",
  forbidden: "Bạn không có quyền thao tác này trên công trình.",
  development: "Module Dự án đang phát triển — chưa mở cho tài khoản này.",
};

export function runEntryAction<T extends object>(logTag: string, action: () => Promise<T>): Promise<ActionResult<T>> {
  return runAction(logTag, async () => {
    try {
      return await action();
    } catch (err) {
      if (err instanceof ModuleRequestError) throw new Error(ACL_MESSAGE[err.reason] ?? err.message);
      throw err;
    }
  });
}

/** Dòng không còn (đã xóa, của công trình khác, hoặc không có) — một câu chung, không lộ dòng của công trình khác. */
export const rowGone = (what: string) => `${what} không còn trong công trình này — tải lại trang.`;
