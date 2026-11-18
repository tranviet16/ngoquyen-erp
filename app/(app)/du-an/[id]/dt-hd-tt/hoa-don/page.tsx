import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { listInvoiceLines, listSupplierOptions } from "@/lib/du-an/dt-hd-tt/invoice-service";
import { HoaDonClient } from "./hoa-don-client";

/** Sổ Hóa đơn: xem cần quyền đọc dự án; thêm dòng cần `create`, sửa / xóa cần `edit`. */
export default async function HoaDonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [rows, suppliers, canCreate, canEdit] = await Promise.all([
    listInvoiceLines(projectId),
    listSupplierOptions(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  return <HoaDonClient projectId={projectId} rows={rows} suppliers={suppliers} canCreate={canCreate} canEdit={canEdit} />;
}
