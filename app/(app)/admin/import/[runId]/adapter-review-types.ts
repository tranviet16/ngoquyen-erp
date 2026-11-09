import type { ImportMapping } from "@/lib/import/adapters/adapter-types";
import type { StoredReview } from "@/lib/import/import-review";

/**
 * Props mà mọi component duyệt riêng của adapter nhận (trang chi tiết run là server component, nên
 * props phải tuần tự hóa được). Trang đã tự hiển thị trạng thái, phiên bản review, danh sách lỗi chặn
 * và xác nhận còn thiếu, cùng nút Ghi — component chỉ cần hiển thị `review.payload` và cho sửa ánh xạ.
 *
 * Sửa ánh xạ / xác nhận: gửi mapping ĐẦY ĐỦ đã sửa (gồm `ack:<mã>` = 1 cho mục đã xác nhận) qua
 * `refreshPreviewAction(runId, mapping)` (import-actions.ts), kiểm `result.ok`, rồi `router.refresh()`
 * để trang tải phiên bản review mới. Chỉ làm khi `editable`.
 */
export interface AdapterReviewProps {
  runId: number;
  adapterName: string;
  /** `ImportRun.status`: preview | committed | failed | rolled_back | … */
  status: string;
  /** `true` khi run đang preview — chỉ khi đó được "Lưu & tính lại". */
  editable: boolean;
  /** Phiên bản review đang hiển thị (nút Ghi gửi đúng số này). */
  reviewVersion: number;
  /** Ánh xạ đã lưu của run (kể cả khóa `ack:<mã>`). */
  mapping: ImportMapping;
  /** `reviewJson` đã chuẩn hóa: payload, blocking, requiredAcks, acks (ackedBy/ackedAt), bundle?, expected?. */
  review: StoredReview;
  /** Mã trong `requiredAcks` chưa được xác nhận. */
  missingAcks: string[];
}
