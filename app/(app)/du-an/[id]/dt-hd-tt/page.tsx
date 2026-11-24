import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { loadReportPage } from "@/components/du-an/dt-hd-tt/load-report-page";
import { TongQuanView } from "@/components/du-an/dt-hd-tt/tong-quan-view";
import { listAliasBoard } from "@/lib/du-an/dt-hd-tt/alias-service";
import { listCounterparties } from "@/lib/du-an/dt-hd-tt/counterparty-service";
import { buildOverview } from "@/lib/du-an/dt-hd-tt/overview";

/**
 * Tổng quan của Đối chiếu DT-HĐ-TT (trang mở đầu của tab, cho lãnh đạo / chỉ huy): số chính, đầu mối
 * vượt dự toán, việc cần làm, kiểm tổng và lối tắt ba báo cáo. Chỉ đọc. Quyền đọc dự án theo công trình
 * kiểm trước, rồi ba nguồn tải song song (mỗi service tự kiểm quyền lần nữa).
 */
export default async function DtHdTtOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [{ reports, projectLabel }, board, { links }] = await Promise.all([
    loadReportPage(params),
    listAliasBoard(projectId),
    listCounterparties(projectId),
  ]);

  return <TongQuanView projectId={projectId} projectLabel={projectLabel} overview={buildOverview(reports, board, links)} />;
}
