import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { DtHdPageContent } from "@/components/du-an/dt-hd-tt/dt-hd-page-content";
import { loadReportPage } from "@/components/du-an/dt-hd-tt/load-report-page";
import { splitPartB } from "@/lib/du-an/dt-hd-tt/dt-hd-screen-model";
import { toSearchParams } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { DT_HD_URL } from "@/lib/du-an/dt-hd-tt/screen-links";
import { prisma } from "@/lib/prisma";

/**
 * Báo cáo DT-HĐ: màn hình mới (tóm tắt theo đầu mối, mở / lọc trên URL) và bản in A4 giữ nguyên. Quyền đọc
 * dự án theo công trình kiểm trước mọi truy vấn. `mo` / `dauMoi` / `loc` / `hd` của URL đọc bằng parser
 * của screen-links — chỉ là bản cho lần render đầu, client giữ và ghi lại URL.
 */
export default async function DtHdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [{ reports, projectLabel }, query] = await Promise.all([loadReportPage(params), searchParams]);
  // Link "Gán ở Ánh xạ" của Phần B mở đúng khóa engine đã xếp: đọc khóa tên|ĐVT đang lưu của các dòng HĐ
  // chưa gán bằng một truy vấn theo id, trong công trình này (dòng báo cáo không mang khóa).
  const ids = splitPartB(reports.dtHd).chuaGan.map((l) => l.invoiceLineId);
  const keyRows = ids.length === 0
    ? []
    : await prisma.projectInvoiceLine.findMany({ where: { projectId, deletedAt: null, id: { in: ids } }, select: { id: true, itemKey: true } });

  return (
    <DtHdPageContent
      projectId={projectId}
      projectLabel={projectLabel}
      settings={reports.settings}
      report={reports.dtHd}
      initialParams={DT_HD_URL.parse(toSearchParams(query).toString())}
      partBKeys={Object.fromEntries(keyRows.map((r) => [r.id, r.itemKey]))}
    />
  );
}
