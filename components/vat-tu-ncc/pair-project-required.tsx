import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { listSupplierProjects } from "@/lib/vat-tu-ncc/project-overview-service";
import { PairProjectPicker } from "./pair-project-picker";

export { parseProjectIdParam } from "./project-id-param";

/** `?projectId=` của tab theo cặp phải trỏ tới công trình còn hoạt động; không thì 404. */
export async function requireActivePairProject(projectId: number) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, code: true, name: true, entityId: true },
  });
  if (!project) notFound();
  return project;
}

interface Props {
  supplierId: number;
  /** Đoạn đường dẫn đích dưới `/vat-tu-ncc/[supplierId]/`, ví dụ "chot-ky". */
  tab: string;
}

/**
 * Bộ chọn công trình cho tab theo cặp khi thiếu `?projectId=`: liệt kê công trình mà NCC đã có
 * phiếu, sổ vật tư, số dư ban đầu hoặc kỳ đối chiếu, kèm ô chọn công trình khác (cặp mới).
 * Server component — trang gọi đã kiểm quyền module.
 */
export async function PairProjectRequired({ supplierId, tab }: Props) {
  const [supplierProjects, allProjects] = await Promise.all([
    listSupplierProjects(supplierId),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return (
    <PairProjectPicker supplierId={supplierId} tab={tab} supplierProjects={supplierProjects} allProjects={allProjects} />
  );
}
