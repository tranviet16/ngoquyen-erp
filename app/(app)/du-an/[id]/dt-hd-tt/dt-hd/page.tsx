import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { DtHdView } from "@/components/du-an/dt-hd-tt/dt-hd-view";
import { loadReportPage } from "@/components/du-an/dt-hd-tt/load-report-page";
import { ReportToolbar, SettingsBanner } from "@/components/du-an/dt-hd-tt/report-bits";

export default async function DtHdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const { reports, projectLabel } = await loadReportPage(params);
  return (
    <div className="space-y-4">
      <ReportToolbar title="Đối chiếu dự toán – hóa đơn (DT-HĐ)" subtitle={projectLabel} projectId={projectId} report="dt-hd" />
      <SettingsBanner settings={reports.settings} projectId={projectId} />
      <DtHdView report={reports.dtHd} />
    </div>
  );
}
