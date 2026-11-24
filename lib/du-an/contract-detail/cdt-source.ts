/**
 * Nguồn số của hợp đồng CĐT: nghiệm thu có giá trị CĐT, sổ hóa đơn xuất CĐT, dòng tiền 3 bên chiều
 * CĐT ↔ công ty, và `Project.contractValue`. Không đọc chiều `cty_to_doi` (đã nằm trong thanh toán của
 * sổ nhân công).
 *
 * Cố ý KHÔNG nằm trong file "use server": hàm nội bộ của loader, không được lộ thành server action.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CdtInputs } from "./types";
import { CDT_CASH_IN_DIRECTION, CDT_CASH_OUT_DIRECTION } from "./cdt-figures";

export async function loadCdtInputs(projectId: number): Promise<Omit<CdtInputs, "cdtContractsValueDt">> {
  const [acceptances, invoices, cashflows, project] = await Promise.all([
    prisma.projectAcceptance.findMany({
      where: { projectId, deletedAt: null, amountCdtVnd: { not: 0 } },
      select: { id: true, checkItem: true, acceptanceBatch: true, acceptedAt: true, amountCdtVnd: true },
      orderBy: [{ acceptedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    }),
    prisma.projectCdtInvoice.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, invoiceDate: true, invoiceSymbol: true, invoiceNo: true, amountVnd: true, vatVnd: true },
      orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
    }),
    prisma.project3WayCashflow.findMany({
      where: { projectId, deletedAt: null, flowDirection: { in: [CDT_CASH_IN_DIRECTION, CDT_CASH_OUT_DIRECTION] } },
      select: { id: true, date: true, flowDirection: true, payerName: true, payeeName: true, amountVnd: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { contractValue: true } }),
  ]);
  return { acceptances, invoices, cashflows, projectContractValue: project?.contractValue ?? null };
}

/** A' (Σ nghiệm thu CĐT) và C' (CĐT trả ròng) của công trình, cộng bằng SQL — cho cột danh mục. */
export async function loadCdtTotals(projectId: number): Promise<{ nghiemThu: Prisma.Decimal; daNhan: Prisma.Decimal }> {
  const [row] = await prisma.$queryRaw<{ nghiemThu: Prisma.Decimal; daNhan: Prisma.Decimal }[]>`
    SELECT
      (SELECT COALESCE(SUM("amountCdtVnd"), 0) FROM project_acceptances
        WHERE "projectId" = ${projectId} AND "deletedAt" IS NULL) AS "nghiemThu",
      (SELECT COALESCE(SUM(CASE "flowDirection" WHEN ${CDT_CASH_IN_DIRECTION} THEN "amountVnd" ELSE -"amountVnd" END), 0)
         FROM project_3way_cashflows
        WHERE "projectId" = ${projectId} AND "deletedAt" IS NULL
          AND "flowDirection" IN (${CDT_CASH_IN_DIRECTION}, ${CDT_CASH_OUT_DIRECTION})) AS "daNhan"`;
  return { nghiemThu: new Prisma.Decimal(row.nghiemThu), daNhan: new Prisma.Decimal(row.daNhan) };
}
