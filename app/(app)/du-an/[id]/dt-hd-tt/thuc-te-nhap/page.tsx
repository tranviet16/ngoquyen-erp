import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { toSearchParams } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { listCounterpartyOptions, listReceipts } from "@/lib/du-an/dt-hd-tt/receipt-service";
import { THUC_TE_NHAP_URL } from "@/lib/du-an/dt-hd-tt/screen-links";
import { ThucTeNhapClient } from "./thuc-te-nhap-client";

/**
 * Sổ Thực tế nhập: xem cần quyền đọc dự án; thêm dòng cần `create`, sửa / xóa cần `edit`. Bộ lọc đọc từ
 * `filter.<cột>` của URL — chỉ là bản cho lần render đầu, client giữ và ghi lại URL.
 */
export default async function ThucTeNhapPage({
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

  const [rows, counterparties, canCreate, canEdit, query] = await Promise.all([
    listReceipts(projectId),
    listCounterpartyOptions(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
    searchParams,
  ]);
  const initialFilters = THUC_TE_NHAP_URL.parse(toSearchParams(query).toString());

  return (
    <ThucTeNhapClient
      projectId={projectId}
      rows={rows}
      counterparties={counterparties}
      canCreate={canCreate}
      canEdit={canEdit}
      initialFilters={initialFilters}
    />
  );
}
