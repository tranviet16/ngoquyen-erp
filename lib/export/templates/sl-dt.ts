/**
 * Export template: Báo cáo SL-DT (Sản lượng / Doanh thu)
 * Data source: lib/sl-dt/report-service.ts → getSlDtReport
 */

import { createWorkbook, addSheet, workbookToBuffer, type SheetColumn } from "../excel-exporter";
import { getSlDtReport } from "@/lib/sl-dt/report-service";
import { prisma } from "@/lib/prisma";

const COLUMNS: SheetColumn[] = [
  { header: "Dự án", key: "projectName", width: 30 },
  { header: "Năm", key: "year", width: 8 },
  { header: "Tháng", key: "month", width: 8 },
  { header: "SL Kế hoạch", key: "slTarget", width: 18, numFmt: "#,##0" },
  { header: "SL Thực hiện", key: "slActual", width: 18, numFmt: "#,##0" },
  { header: "Chênh lệch SL", key: "slDiff", width: 18, numFmt: "#,##0" },
  { header: "% SL", key: "slPct", width: 10, numFmt: "0.0%" },
  { header: "DT Kế hoạch", key: "dtTarget", width: 18, numFmt: "#,##0" },
  { header: "DT Thực hiện", key: "dtActual", width: 18, numFmt: "#,##0" },
  { header: "Chênh lệch DT", key: "dtDiff", width: 18, numFmt: "#,##0" },
  { header: "% DT", key: "dtPct", width: 10, numFmt: "0.0%" },
];

export async function buildSlDtExcel(params: {
  year: number;
  month?: number;
  projectId?: number;
}): Promise<Buffer> {
  const [rows, projects] = await Promise.all([
    getSlDtReport(params),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true } }),
  ]);

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const wb = createWorkbook();
  addSheet(
    wb,
    "Báo cáo SL-DT",
    COLUMNS,
    rows.map((r) => {
      const proj = projectMap.get(r.projectId);
      return {
        projectName: proj ? `[${proj.code}] ${proj.name}` : `#${r.projectId}`,
        year: r.year,
        month: r.month,
        slTarget: r.slTarget.toNumber(),
        slActual: r.slActual.toNumber(),
        slDiff: r.slDiff.toNumber(),
        slPct: r.slPct,
        dtTarget: r.dtTarget.toNumber(),
        dtActual: r.dtActual.toNumber(),
        dtDiff: r.dtDiff.toNumber(),
        dtPct: r.dtPct,
      };
    }),
    { title: `Báo cáo Sản lượng - Doanh thu — Năm ${params.year}` }
  );

  return workbookToBuffer(wb);
}
