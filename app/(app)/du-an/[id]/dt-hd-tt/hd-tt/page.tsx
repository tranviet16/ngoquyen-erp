import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { HdTtView } from "@/components/du-an/dt-hd-tt/hd-tt-view";
import { loadReportPage } from "@/components/du-an/dt-hd-tt/load-report-page";
import { ReportToolbar, SettingsBanner } from "@/components/du-an/dt-hd-tt/report-bits";

export default async function HdTtPage({ params }: { params: Promise<{ id: string }> }) {
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
      <ReportToolbar title="Đối chiếu hóa đơn – thực tế (HĐ-TT)" subtitle={projectLabel} projectId={projectId} report="hd-tt" />
      <SettingsBanner settings={reports.settings} projectId={projectId} />
      <HdTtView report={reports.hdTt} />
    </div>
  );
}
