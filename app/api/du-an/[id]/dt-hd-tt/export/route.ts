import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { ModuleRequestError, requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { getDtHdTtReports } from "@/lib/du-an/dt-hd-tt/report-service";
import { buildSheet, EXPORT_REPORTS, isExportReport, toWorkbook } from "@/lib/du-an/dt-hd-tt/export-sheets";

/**
 * Xuất một báo cáo "Đối chiếu DT-HĐ-TT" (?report=dt-hd|dt-tt|hd-tt) ra .xlsx — một sheet, số lấy từ
 * cùng service với màn hình nên tổng luôn khớp. Guard: quyền đọc du-an theo công trình.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const projectId = Number(id);
  const report = req.nextUrl.searchParams.get("report");
  if (!Number.isInteger(projectId) || projectId <= 0 || !isExportReport(report)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  } catch (err) {
    if (err instanceof ModuleRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.reason === "unauthorized" ? 401 : 403 });
    }
    throw err;
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { code: true, name: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const data = await getDtHdTtReports(projectId);
  const spec = buildSheet(report, data, `${project.code} — ${project.name}`, `${dd}/${mm}/${today.getFullYear()}`);
  const buf = XLSX.write(toWorkbook(spec), { type: "buffer", bookType: "xlsx" }) as Buffer;

  const safeCode = project.code.replace(/[^\w-]+/g, "-");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${EXPORT_REPORTS[report].file}-${safeCode}-${today.getFullYear()}${mm}${dd}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
