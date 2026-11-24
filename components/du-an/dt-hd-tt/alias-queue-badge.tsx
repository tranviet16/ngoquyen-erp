/**
 * Huy hiệu "n chưa gán" trên mục Ánh xạ. Server component, đặt trong Suspense riêng ở layout của tab:
 * đếm chậm thì trang vẫn hiện, đếm lỗi thì chỉ mất huy hiệu — không bao giờ chặn báo cáo hay bản in.
 */

import { unstable_rethrow } from "next/navigation";
import { loadAliasQueueSummary } from "./load-report-page";

export async function AliasQueueBadge({ projectId }: { projectId: number }) {
  let count: number;
  try {
    count = (await loadAliasQueueSummary(projectId)).chuaGanTotal;
  } catch (err) {
    unstable_rethrow(err);
    console.error("[alias-queue-badge] không đếm được khóa chưa gán của công trình", projectId, err);
    return null;
  }
  if (count === 0) return null;
  return (
    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-900" title={`${count} tên chưa gán (Dự toán, Hóa đơn, Thực tế nhập)`}>
      {count}
    </span>
  );
}
