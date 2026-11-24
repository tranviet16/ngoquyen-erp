import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { HdTtScreen } from "@/components/du-an/dt-hd-tt/hd-tt-screen";
import { HdTtView } from "@/components/du-an/dt-hd-tt/hd-tt-view";
import { loadReportPage } from "@/components/du-an/dt-hd-tt/load-report-page";
import { ReportPageLayout, ReportToolbar, SettingsBanner } from "@/components/du-an/dt-hd-tt/report-bits";
import { toSearchParams } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { canEditFrom } from "@/lib/du-an/dt-hd-tt/hd-tt-screen-model";
import { HD_TT_URL } from "@/lib/du-an/dt-hd-tt/screen-links";

/**
 * Báo cáo HĐ-TT: màn hình mới (13 cột tiền trong hộp cuộn dính ba trục, lọc `loc`, nhập H / S / X / Z cho người có
 * quyền `edit`) và bản in A4 giữ nguyên là con cuối (`ReportPageLayout`). Quyền đọc dự án theo công trình kiểm trước
 * mọi truy vấn; quyền sửa hỏi cho đúng người dùng đó trong cùng công trình (`canEditFrom`). `loc` của URL chỉ là bản
 * cho lần render đầu — client giữ và ghi lại URL.
 */
export default async function HdTtPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [{ reports, projectLabel }, query, canEdit] = await Promise.all([
    loadReportPage(params),
    searchParams,
    canEditFrom(canAccessEntitlement, userId, projectId),
  ]);
  return (
    <ReportPageLayout
      toolbar={<ReportToolbar title="Đối chiếu hóa đơn – thực tế (HĐ-TT)" subtitle={projectLabel} projectId={projectId} report="hd-tt" />}
      banner={<SettingsBanner settings={reports.settings} projectId={projectId} />}
      screen={<HdTtScreen projectId={projectId} report={reports.hdTt} initialParams={HD_TT_URL.parse(toSearchParams(query).toString())} canEdit={canEdit} />}
      print={<HdTtView report={reports.hdTt} />}
    />
  );
}
