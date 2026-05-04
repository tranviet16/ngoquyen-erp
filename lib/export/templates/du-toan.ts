/**
 * Export template: Dự toán (Project Estimate)
 * Data source: project_estimates + project_categories
 */

import { createWorkbook, addSheet, workbookToBuffer, type SheetColumn } from "../excel-exporter";
import { prisma } from "@/lib/prisma";

const COLUMNS: SheetColumn[] = [
  { header: "Hạng mục", key: "categoryName", width: 25 },
  { header: "Mã VT", key: "itemCode", width: 12 },
  { header: "Tên vật tư / công việc", key: "itemName", width: 35 },
  { header: "ĐVT", key: "unit", width: 8 },
  { header: "Khối lượng", key: "qty", width: 14, numFmt: "#,##0.00" },
  { header: "Đơn giá (VNĐ)", key: "unitPrice", width: 18, numFmt: "#,##0" },
  { header: "Thành tiền (VNĐ)", key: "totalVnd", width: 20, numFmt: "#,##0" },
  { header: "Ghi chú", key: "note", width: 25 },
];

export async function buildDuToanExcel(projectId: number): Promise<Buffer> {
  const [project, categories, estimates] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { code: true, name: true } }),
    prisma.projectCategory.findMany({ where: { projectId, deletedAt: null }, orderBy: { sortOrder: "asc" } }),
    prisma.projectEstimate.findMany({ where: { projectId, deletedAt: null }, orderBy: [{ categoryId: "asc" }, { itemCode: "asc" }] }),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  let totalVnd = 0;
  const rows = estimates.map((e) => {
    const total = parseFloat(e.totalVnd.toString());
    totalVnd += total;
    return {
      categoryName: catMap.get(e.categoryId) ?? `#${e.categoryId}`,
      itemCode: e.itemCode,
      itemName: e.itemName,
      unit: e.unit,
      qty: parseFloat(e.qty.toString()),
      unitPrice: parseFloat(e.unitPrice.toString()),
      totalVnd: total,
      note: e.note ?? "",
    };
  });

  const wb = createWorkbook();
  addSheet(
    wb,
    "Dự toán",
    COLUMNS,
    rows,
    {
      title: `Dự toán — ${project?.name ?? `Dự án #${projectId}`} [${project?.code ?? ""}]`,
      footerLabel: "TỔNG CỘNG",
      footerValues: { totalVnd },
    }
  );

  return workbookToBuffer(wb);
}
