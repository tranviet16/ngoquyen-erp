import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { toSearchParams } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { listInvoiceLines, listSupplierOptions } from "@/lib/du-an/dt-hd-tt/invoice-service";
import { HOA_DON_URL } from "@/lib/du-an/dt-hd-tt/screen-links";
import { HoaDonClient } from "./hoa-don-client";

/**
 * Sổ Hóa đơn: xem cần quyền đọc dự án; thêm dòng cần `create`, sửa / xóa cần `edit`. Bộ lọc đọc từ
 * `filter.<cột>` của URL (screen-links) — chỉ là bản cho lần render đầu, client giữ và ghi lại URL.
 */
export default async function HoaDonPage({
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

  const [rows, suppliers, canCreate, canEdit, query] = await Promise.all([
    listInvoiceLines(projectId),
    listSupplierOptions(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
    searchParams,
  ]);
  const initialFilters = HOA_DON_URL.parse(toSearchParams(query).toString());

  return (
    <HoaDonClient projectId={projectId} rows={rows} suppliers={suppliers} canCreate={canCreate} canEdit={canEdit} initialFilters={initialFilters} />
  );
}
