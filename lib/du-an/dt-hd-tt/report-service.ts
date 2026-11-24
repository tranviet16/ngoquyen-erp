"use server";

/**
 * Đọc sổ "Đối chiếu DT-HĐ-TT" của một công trình và tính ba báo cáo. Quyền: đọc dự án theo công
 * trình. Mỗi bảng một truy vấn, chỉ dòng chưa xóa mềm; công trình chưa lưu Cài đặt → tỷ lệ mặc định.
 */

import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { groupEstimatesByKey, kindOfCategoryCode } from "./keys";
import { buildReports, type DtHdTtReports } from "./reports";
import { DEFAULT_RATES, type AliasIn, type ReportInputs } from "./report-inputs";

const num = (v: { toNumber(): number } | number | null | undefined): number => (v == null ? 0 : typeof v === "number" ? v : v.toNumber());
const numOrNull = (v: { toNumber(): number } | null | undefined): number | null => (v == null ? null : v.toNumber());

export async function getDtHdTtReports(projectId: number): Promise<DtHdTtReports> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const live = { projectId, deletedAt: null };
  const [settings, categories, estimates, groupCodes, aliases, counterparties, links, invoiceLines, receipts, payments] = await Promise.all([
    prisma.projectSettings.findUnique({ where: { projectId } }),
    prisma.projectCategory.findMany({ where: live, select: { id: true, code: true } }),
    prisma.projectEstimate.findMany({ where: live, select: { id: true, categoryId: true, itemCode: true, itemName: true, unit: true, qty: true, totalVnd: true } }),
    prisma.projectGroupCode.findMany({ where: live }),
    prisma.projectItemAlias.findMany({ where: live }),
    prisma.projectCounterparty.findMany({ where: live }),
    prisma.projectCounterpartySupplier.findMany({ where: live }),
    prisma.projectInvoiceLine.findMany({ where: live, orderBy: [{ invoiceDate: "asc" }, { id: "asc" }] }),
    prisma.projectActualReceipt.findMany({ where: live, select: { id: true, itemKey: true, qty: true, amountVnd: true, counterpartyId: true } }),
    prisma.projectCashPayment.findMany({ where: live, select: { id: true, bankVnd: true, cashVnd: true, section: true, counterpartyId: true, supplierId: true } }),
  ]);

  const categoryCode = new Map(categories.map((c) => [c.id, c.code]));
  const estimateRows = estimates.map((e) => ({ ...e, categoryCode: categoryCode.get(e.categoryId) ?? "" }));
  const supplierIds = [...new Set([...links.map((l) => l.supplierId), ...invoiceLines.map((l) => l.supplierId), ...payments.flatMap((p) => (p.supplierId === null ? [] : [p.supplierId]))])];
  const suppliers = await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } });

  const inputs: ReportInputs = {
    settings: settings
      ? {
          vatPct: num(settings.vatPct), generalCostPct: num(settings.generalCostPct), tempHousingPct: num(settings.tempHousingPct),
          unmeasuredPct: num(settings.unmeasuredPct), presumptiveIncomePct: num(settings.presumptiveIncomePct), missing: false,
        }
      : DEFAULT_RATES,
    dtLines: [...groupEstimatesByKey(estimateRows).values()],
    dtWithoutKindValue: estimateRows.filter((e) => kindOfCategoryCode(e.categoryCode) === null).reduce((a, e) => a + num(e.totalVnd), 0),
    groupCodes: groupCodes.map((g) => ({ id: g.id, code: g.code, name: g.name, counterpartyId: g.counterpartyId, isMainMaterial: g.isMainMaterial, sortOrder: g.sortOrder })),
    aliases: aliases.map((a) => ({
      source: a.source as AliasIn["source"], itemKey: a.itemKey, groupCodeId: a.groupCodeId, kind: a.kind as AliasIn["kind"],
      dtKey: a.dtKey, factor: numOrNull(a.factor), status: a.status as AliasIn["status"],
    })),
    counterparties: counterparties.map((c) => ({
      id: c.id, name: c.name, kind: c.kind as ReportInputs["counterparties"][number]["kind"], sortGroup: c.sortGroup, sortOrder: c.sortOrder,
      actualBasis: c.actualBasis as ReportInputs["counterparties"][number]["actualBasis"], actualManualVnd: numOrNull(c.actualManualVnd), paymentSection: c.paymentSection,
    })),
    counterpartySuppliers: links.map((l) => ({
      id: l.id, counterpartyId: l.counterpartyId, supplierId: l.supplierId, splitActualVnd: numOrNull(l.splitActualVnd),
      paidOverrideVnd: numOrNull(l.paidOverrideVnd), recoveredVnd: numOrNull(l.recoveredVnd), todoNote: l.todoNote,
    })),
    suppliers,
    invoiceLines: invoiceLines.map((l) => ({
      id: l.id, supplierId: l.supplierId, invoiceNo: l.invoiceNo, invoiceDate: l.invoiceDate, itemName: l.itemName, unit: l.unit,
      itemKey: l.itemKey, qty: numOrNull(l.qty), amountVnd: num(l.amountVnd), vatVnd: num(l.vatVnd),
    })),
    receipts: receipts.map((r) => ({ id: r.id, itemKey: r.itemKey, qty: numOrNull(r.qty), amountVnd: num(r.amountVnd), counterpartyId: r.counterpartyId })),
    payments: payments.map((p) => ({ id: p.id, bankVnd: num(p.bankVnd), cashVnd: num(p.cashVnd), section: p.section, counterpartyId: p.counterpartyId, supplierId: p.supplierId })),
  };
  return buildReports(inputs);
}
