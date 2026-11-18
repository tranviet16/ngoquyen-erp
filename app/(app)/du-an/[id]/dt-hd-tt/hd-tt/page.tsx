import { HdTtView } from "@/components/du-an/dt-hd-tt/hd-tt-view";
import { loadReportPage } from "@/components/du-an/dt-hd-tt/load-report-page";
import { ReportToolbar, SettingsBanner } from "@/components/du-an/dt-hd-tt/report-bits";

export default async function HdTtPage({ params }: { params: Promise<{ id: string }> }) {
  const { projectId, reports, projectLabel } = await loadReportPage(params);
  return (
    <div className="space-y-4">
      <ReportToolbar title="Đối chiếu hóa đơn – thực tế (HĐ-TT)" subtitle={projectLabel} projectId={projectId} report="hd-tt" />
      <SettingsBanner settings={reports.settings} projectId={projectId} />
      <HdTtView report={reports.hdTt} />
    </div>
  );
}
