import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { DtTtScreen } from "@/components/du-an/dt-hd-tt/dt-tt-screen";
import { DtTtView } from "@/components/du-an/dt-hd-tt/dt-tt-view";
import { loadReportPage } from "@/components/du-an/dt-hd-tt/load-report-page";
import { ReportPageLayout, ReportToolbar, SettingsBanner } from "@/components/du-an/dt-hd-tt/report-bits";

/**
 * Báo cáo DT-TT: màn hình mới (thanh nhảy Phần I · II · III, nhóm Phần I thu gọn được, neo `#dm-{id}`, cảnh báo có
 * link) và bản in A4 giữ nguyên là con cuối (`ReportPageLayout`). Quyền đọc dự án theo công trình kiểm trước mọi truy vấn.
 */
export default async function DtTtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const { reports, projectLabel } = await loadReportPage(params);
  return (
    <ReportPageLayout
      toolbar={<ReportToolbar title="Đối chiếu dự toán – thực tế (DT-TT)" subtitle={projectLabel} projectId={projectId} report="dt-tt" />}
      banner={<SettingsBanner settings={reports.settings} projectId={projectId} />}
      screen={<DtTtScreen projectId={projectId} report={reports.dtTt} phanIII={reports.phanIII} />}
      print={<DtTtView report={reports.dtTt} phanIII={reports.phanIII} />}
    />
  );
}
