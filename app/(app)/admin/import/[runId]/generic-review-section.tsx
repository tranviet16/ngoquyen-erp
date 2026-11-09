import type { AdapterReviewProps } from "./adapter-review-types";

/**
 * Phần duyệt mặc định cho adapter chưa đăng ký component riêng. Lỗi chặn và xác nhận còn thiếu đã
 * được trang hiển thị; phần này liệt kê mọi mục cần xác nhận kèm người / thời điểm đã xác nhận.
 * Không hiển thị `payload` (định dạng riêng của từng adapter).
 */
export function GenericReviewSection({ review }: AdapterReviewProps) {
  if (review.requiredAcks.length === 0) return null;

  return (
    <div className="border rounded-lg p-4 space-y-2 text-sm">
      <h2 className="font-semibold">Mục cần xác nhận ({review.requiredAcks.length})</h2>
      <ul className="space-y-1">
        {review.requiredAcks.map((code) => {
          const ack = Object.hasOwn(review.acks, code) ? review.acks[code] : null;
          return (
            <li key={code} className="flex flex-wrap gap-x-2">
              <span className="font-mono text-xs break-all">{code}</span>
              {ack ? (
                <span className="text-green-700 dark:text-green-300 text-xs">
                  đã xác nhận bởi {ack.ackedBy} lúc {new Date(ack.ackedAt).toLocaleString("vi-VN")}
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-300 text-xs">chưa xác nhận</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
