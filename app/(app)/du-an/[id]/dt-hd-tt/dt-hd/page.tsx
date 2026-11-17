import { DtHdView } from "@/components/du-an/dt-hd-tt/dt-hd-view";
import { loadReportPage } from "@/components/du-an/dt-hd-tt/load-report-page";
import { ReportToolbar, SettingsBanner } from "@/components/du-an/dt-hd-tt/report-bits";

export default async function DtHdPage({ params }: { params: Promise<{ id: string }> }) {
  const { projectId, reports, projectLabel } = await loadReportPage(params);
  return (
    <div className="space-y-4">
      <ReportToolbar title="Đối chiếu dự toán – hóa đơn (DT-HĐ)" subtitle={projectLabel} projectId={projectId} report="dt-hd" />
      <SettingsBanner settings={reports.settings} projectId={projectId} />
      <DtHdView report={reports.dtHd} />
    </div>
  );
}
