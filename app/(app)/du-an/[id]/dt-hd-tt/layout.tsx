import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AliasQueueBadge } from "@/components/du-an/dt-hd-tt/alias-queue-badge";
import { DtHdTtSubNav } from "@/components/du-an/dt-hd-tt/dt-hd-tt-sub-nav";

/**
 * Tab "Đối chiếu DT-HĐ-TT": thanh mục con có nhóm (hàng 2 của khung dự án); quyền đọc dự án đã kiểm ở
 * layout công trình. Huy hiệu "chưa gán" tải trong Suspense riêng nên không chặn trang hay bản in.
 */
export default async function DtHdTtLayout({ params, children }: { params: Promise<{ id: string }>; children: React.ReactNode }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  return (
    <div className="space-y-4">
      <DtHdTtSubNav
        basePath={`/du-an/${projectId}/dt-hd-tt`}
        badge={
          <Suspense fallback={null}>
            <AliasQueueBadge projectId={projectId} />
          </Suspense>
        }
      />
      {children}
    </div>
  );
}
