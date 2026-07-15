import { prisma } from "@/lib/prisma";
import { cleanHierarchyLabel } from "@/lib/sl-dt/hierarchy";
import { LotCatalogClient } from "./lot-catalog-client";
import type { LotCatalogRow } from "./actions";

export default async function SlDtLotCatalogPage() {
  const [rows, labels] = await Promise.all([
    prisma.slDtLot.findMany({
      where: { deletedAt: null },
      orderBy: [{ phaseCode: "asc" }, { groupCode: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.slDtSubtotalLabel.findMany(),
  ]);
  const orderMap = new Map(labels.map((label) => [`${label.scope}:${label.key}`, label.sortOrder]));

  const data: LotCatalogRow[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    lotName: row.lotName,
    phaseCode: cleanHierarchyLabel(row.phaseCode),
    groupCode: cleanHierarchyLabel(row.groupCode),
    sortOrder: row.sortOrder,
    activeFromYear: row.activeFromYear,
    activeFromMonth: row.activeFromMonth,
    phaseSortOrder: orderMap.get(`phase:${row.phaseCode}`) ?? 0,
    groupSortOrder: orderMap.get(`group:${row.phaseCode}/${row.groupCode}`) ?? 0,
    showInSanLuong: row.showInSanLuong,
    showInDoanhThu: row.showInDoanhThu,
    showInChiTieu: row.showInChiTieu,
    showInTienDoXd: row.showInTienDoXd,
    showInNopTien: row.showInNopTien,
    estimateValue: Number(row.estimateValue),
    contractValue: row.contractValue == null ? null : Number(row.contractValue),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Danh mục lô SL-DT</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý nhóm lớn, nhóm nhỏ, lô và kỳ bắt đầu áp dụng. Lô mới chỉ hiển thị từ kỳ bắt đầu trở đi.
        </p>
      </div>

      <LotCatalogClient rows={data} />
    </div>
  );
}
