/**
 * Hợp đồng chung của các lệnh đo trong scripts/dt-hd-tt-ui-measure/. Mỗi lệnh là một file riêng, do phase
 * làm màn hình tương ứng thêm vào cùng với màn hình và các `data-*` của nó, để hai phase chạy song song không
 * sửa chung một file. Lệnh trả về danh sách lỗi (lỗi nào cũng làm script thoát khác 0) và ghi chú.
 */

import type { Session } from "../dt-hd-tt-browser-session";

export interface MeasureContext {
  session: Session;
  projectId: number;
  /** Tham số dòng lệnh còn lại, cho lệnh nào cần thêm (ví dụ --control). */
  argv: string[];
}

export interface MeasureResult {
  failures: string[];
  notes: string[];
}

export type MeasureCommand = (ctx: MeasureContext) => Promise<MeasureResult>;
