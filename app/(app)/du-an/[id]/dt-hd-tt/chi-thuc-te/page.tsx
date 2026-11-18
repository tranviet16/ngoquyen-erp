import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { listSupplierOptions } from "@/lib/du-an/dt-hd-tt/invoice-service";
import { listPayments } from "@/lib/du-an/dt-hd-tt/payment-service";
import { listCounterpartyOptions } from "@/lib/du-an/dt-hd-tt/receipt-service";
import { ChiThucTeClient } from "./chi-thuc-te-client";

/** Sổ Chi thực tế: xem cần quyền đọc dự án; thêm dòng cần `create`, sửa / xóa cần `edit`. */
export default async function ChiThucTePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [rows, counterparties, suppliers, canCreate, canEdit] = await Promise.all([
    listPayments(projectId),
    listCounterpartyOptions(projectId),
    listSupplierOptions(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  return (
    <ChiThucTeClient projectId={projectId} rows={rows} counterparties={counterparties} suppliers={suppliers} canCreate={canCreate} canEdit={canEdit} />
  );
}
