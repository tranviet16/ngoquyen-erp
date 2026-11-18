import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { listCounterparties } from "@/lib/du-an/dt-hd-tt/counterparty-service";
import { listSupplierOptions } from "@/lib/du-an/dt-hd-tt/invoice-service";
import { getDtHdTtReports } from "@/lib/du-an/dt-hd-tt/report-service";
import { DauMoiClient } from "./dau-moi-client";
import { DauMoiSuppliers, type SupplierFigures } from "./dau-moi-suppliers";

/**
 * Đầu mối: xem cần quyền đọc dự án; thêm đầu mối / NCC cần `create`; sửa, xóa và các ô HĐ-TT nhập
 * tay H / S / X / Z cần `edit`. Số thực tế / HĐ / đã trả lấy từ báo cáo để thấy ngay tác động.
 */
export default async function DauMoiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  const { userId } = await requireModuleAccess("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [{ counterparties, links }, suppliers, reports, canCreate, canEdit] = await Promise.all([
    listCounterparties(projectId),
    listSupplierOptions(projectId),
    getDtHdTtReports(projectId),
    canAccessEntitlement(userId, "du-an", { minLevel: "create", scope: { kind: "project", projectId } }),
    canAccessEntitlement(userId, "du-an", { minLevel: "edit", scope: { kind: "project", projectId } }),
  ]);

  const { a, b, c } = reports.dtTt.phanII;
  const actualOf: Record<number, number | null> = Object.fromEntries([...a, ...b, ...c].map((r) => [r.counterpartyId, r.actual]));
  const figures: Record<number, SupplierFigures> = Object.fromEntries(
    reports.hdTt.rows.map((r) => [r.supplierId, { invoiceTotal: r.invoiceTotal, paid: r.paid, actual: r.actual, temporary: r.actualIsTemporary }]),
  );
  const linked = new Set(links.map((l) => l.supplierId));
  const withoutRow = reports.hdTt.rows.filter((r) => !linked.has(r.supplierId)).map((r) => r.supplierName);

  return (
    <div className="space-y-6">
      <DauMoiClient projectId={projectId} rows={counterparties} actualOf={actualOf} canCreate={canCreate} canEdit={canEdit} />
      <DauMoiSuppliers
        projectId={projectId}
        links={links}
        counterparties={counterparties.map((cp) => ({ id: cp.id, name: cp.name }))}
        suppliers={suppliers}
        figures={figures}
        withoutRow={withoutRow}
        canCreate={canCreate}
        canEdit={canEdit}
      />
    </div>
  );
}
