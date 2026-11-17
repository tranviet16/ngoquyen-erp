import { DtTtView } from "@/components/du-an/dt-hd-tt/dt-tt-view";
import { loadReportPage } from "@/components/du-an/dt-hd-tt/load-report-page";
import { ReportToolbar, SettingsBanner } from "@/components/du-an/dt-hd-tt/report-bits";

export default async function DtTtPage({ params }: { params: Promise<{ id: string }> }) {
  const { projectId, reports, projectLabel } = await loadReportPage(params);
  return (
    <div className="space-y-4">
      <ReportToolbar title="Đối chiếu dự toán – thực tế (DT-TT)" subtitle={projectLabel} projectId={projectId} report="dt-tt" />
      <SettingsBanner settings={reports.settings} projectId={projectId} />
      <DtTtView report={reports.dtTt} phanIII={reports.phanIII} />
    </div>
  );
}
