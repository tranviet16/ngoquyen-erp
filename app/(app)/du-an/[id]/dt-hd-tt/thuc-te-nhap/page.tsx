import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { listCounterpartyOptions, listReceipts } from "@/lib/du-an/dt-hd-tt/receipt-service";
import { ThucTeNhapClient } from "./thuc-te-nhap-client";

/** Sổ Thực tế nhập: xem cần quyền đọc dự án; thêm dòng cần `create`, sửa / xóa cần `edit`. */
export default async function ThucTeNhapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [rows, counterparties, canCreate, canEdit] = await Promise.all([
    listReceipts(projectId),
    listCounterpartyOptions(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  return <ThucTeNhapClient projectId={projectId} rows={rows} counterparties={counterparties} canCreate={canCreate} canEdit={canEdit} />;
}
