import { notFound } from "next/navigation";
import { DtHdTtSubNav } from "@/components/du-an/dt-hd-tt/dt-hd-tt-sub-nav";

/** Tab "Đối chiếu DT-HĐ-TT": thanh điều hướng con; quyền đọc dự án đã kiểm ở layout công trình. */
export default async function DtHdTtLayout({ params, children }: { params: Promise<{ id: string }>; children: React.ReactNode }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  return (
    <div className="space-y-4">
      <DtHdTtSubNav basePath={`/du-an/${projectId}/dt-hd-tt`} />
      {children}
    </div>
  );
}
