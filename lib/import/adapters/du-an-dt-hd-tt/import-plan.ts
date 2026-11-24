/**
 * Kế hoạch import (dùng chung cho bước duyệt và bước ghi): công trình đích, NCC đã gắn, tập giao
 * dịch cũ sẽ thay, đồng bộ dự toán, các cổng kiểm và mục cần xác nhận. Lấy khóa công trình trước
 * khi đọc ("khóa rồi mới kiểm"). Chỉ đọc DB — không ghi.
 */

import { Prisma } from "@prisma/client";
import { lockProjectDtHdTt } from "@/lib/du-an/dt-hd-tt/project-lock";
import { itemKeyOf } from "@/lib/du-an/dt-hd-tt/keys";
import type { ReportInputs } from "@/lib/du-an/dt-hd-tt/report-inputs";
import type { ImportTx, ImportMapping } from "../adapter-types";
import { planDtSync, type DtSyncPlan, type ErpEstimate } from "./dt-sync-plan";
import { goldenGates, type GoldenGate } from "./golden-gates";
import { resolveSuppliers, supplierKey, type SupplierResolution } from "./supplier-resolution";
import { buildWorkbookInputs, workbookDtLines } from "./workbook-inputs";
import type { DtHdTtWorkbook } from "./workbook-types";

export const PROJECT_KEY = "project:target";
const BOOK_TABLES = ["project_group_codes", "project_item_aliases", "project_counterparties", "project_counterparty_suppliers", "project_invoice_lines", "project_actual_receipts", "project_cash_payments"];

export interface ImportPlan {
  projectId: number | null;
  projects: { id: number; code: string; name: string }[];
  suppliers: SupplierResolution[];
  supplierOptions: { id: number; name: string }[];
  replacement: { ids: number[]; sum: string; otherRows: number } | null;
  dtSync: DtSyncPlan | null;
  inputs: ReportInputs | null;
  gates: GoldenGate[];
  categories: { id: number; code: string }[];
  blocking: string[];
  requiredAcks: { code: string; label: string }[];
}

const rateLabel = (r: number) => `${(r * 100).toLocaleString("vi-VN")}%`;

export async function planImport(wb: DtHdTtWorkbook, mapping: ImportMapping, db: ImportTx): Promise<ImportPlan> {
  const blocking: string[] = [];
  const requiredAcks: { code: string; label: string }[] = [];
  const projects = await db.project.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
  const erpSuppliers = await db.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true, taxCode: true }, orderBy: { name: "asc" } });
  const suppliers = resolveSuppliers(wb, mapping, erpSuppliers);
  const plan: ImportPlan = {
    projectId: null, projects, suppliers, supplierOptions: erpSuppliers.map(({ id, name }) => ({ id, name })),
    replacement: null, dtSync: null, inputs: null, gates: [], categories: [], blocking, requiredAcks,
  };
  for (const s of suppliers.filter((x) => x.supplierId === null)) {
    blocking.push(`Chưa chọn NCC trong ERP cho «${s.name}»${s.mst ? ` (MST ${s.mst})` : ""}. Tạo NCC ở Dữ liệu nền tảng nếu chưa có.`);
  }
  const collisions = new Map<string, string>();
  for (const a of wb.aliases) {
    const key = `${a.source}|${itemKeyOf(a.name, a.unit)}`;
    const target = `${a.groupCode ?? ""}/${a.sttDt ?? ""}/${a.factor ?? ""}/${a.status}`;
    const prev = collisions.get(key);
    if (prev !== undefined && prev !== target) blocking.push(`Ánh xạ ${a.source.toUpperCase()} dòng ${a.row} «${a.name}» trùng khóa với dòng khác nhưng gán khác (${prev} ≠ ${target}).`);
    else collisions.set(key, target);
  }
  if (wb.issues.length > 0) requiredAcks.push({ code: `cells:v1:${wb.issues.length}`, label: `Đã xem ${wb.issues.length} ô ngày / tiền không đọc được (nhập với ngày trống, giữ chữ gốc).` });

  const projectId = mapping[PROJECT_KEY];
  if (typeof projectId !== "number" || !projects.some((p) => p.id === projectId)) {
    blocking.push("Chọn công trình nhận dữ liệu (công trình phải có sẵn — import không tạo công trình).");
    return plan;
  }
  plan.projectId = projectId;
  await lockProjectDtHdTt(db, [projectId]);

  const existing = await Promise.all(BOOK_TABLES.map((t) => db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM ${Prisma.raw(`"${t}"`)} WHERE "projectId" = ${projectId} AND "deletedAt" IS NULL`));
  const derived = await db.projectTransaction.count({ where: { projectId, deletedAt: null, sourceInvoiceLineId: { not: null } } });
  const bookRows = existing.reduce((a, [r]) => a + Number(r.n), 0) + derived;
  if (bookRows > 0) blocking.push(`Công trình đã có ${bookRows} dòng sổ Đối chiếu DT-HĐ-TT — hoàn tác lần import trước (hoặc sửa trên màn hình) thay vì import lại.`);

  const replaced = await db.$queryRaw<{ id: number; amount: Prisma.Decimal }[]>`
    SELECT t.id, t."amountHd" AS amount FROM project_transactions t JOIN import_runs r ON r.id = t."importRunId"
     WHERE t."projectId" = ${projectId} AND t."deletedAt" IS NULL AND t."sourceInvoiceLineId" IS NULL
       AND r.adapter IN ('bang-can-doi-vat-tu', 'du-an-xay-dung') AND r.status = 'committed' ORDER BY t.id`;
  const otherRows = await db.projectTransaction.count({ where: { projectId, deletedAt: null, sourceInvoiceLineId: null, id: { notIn: replaced.map((r) => Number(r.id)) } } });
  const sum = replaced.reduce((a, r) => a.add(new Prisma.Decimal(r.amount)), new Prisma.Decimal(0)).toFixed(2);
  plan.replacement = { ids: replaced.map((r) => Number(r.id)), sum, otherRows };
  if (replaced.length > 0) {
    requiredAcks.push({ code: `replace-ptx:v1:${projectId}:${replaced.length}:${sum}`, label: `Thay ${replaced.length} giao dịch hóa đơn cũ (Σ HĐ ${Number(sum).toLocaleString("vi-VN")}) bằng giao dịch sinh từ sổ Hóa đơn của file.` });
  }

  plan.categories = await db.projectCategory.findMany({ where: { projectId, deletedAt: null }, select: { id: true, code: true }, orderBy: { id: "asc" } });
  const codeOf = new Map(plan.categories.map((c) => [c.id, c.code]));
  const estimates = await db.projectEstimate.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, categoryId: true, itemCode: true, itemName: true, unit: true, qty: true, totalVnd: true, materialGroupId: true, remainingInvoiceOverrideVnd: true },
  });
  const erp: ErpEstimate[] = estimates.map((e) => ({ ...e, categoryCode: codeOf.get(e.categoryId) ?? "" }));
  const fileLines = workbookDtLines(wb);
  plan.dtSync = planDtSync(fileLines, erp, plan.categories);
  if (plan.dtSync.ops.length > 0) {
    const delta = Math.round(plan.dtSync.fileTotal - plan.dtSync.erpTotal);
    requiredAcks.push({ code: `dt-sync:v1:${projectId}:${plan.dtSync.ops.length}:${delta}`, label: `Đồng bộ dự toán theo file: ${plan.dtSync.ops.length} thay đổi, chênh ${delta.toLocaleString("vi-VN")} đ.` });
  }

  const settings = await db.projectSettings.findUnique({ where: { projectId } });
  const rates = wb.goldens.rates;
  const want: [string, number, number | undefined][] = [
    ["VAT", rates.vatPct, settings?.vatPct.toNumber()],
    ["chi phí chung", rates.generalCostPct, settings?.generalCostPct.toNumber()],
    ["nhà tạm", rates.tempHousingPct, settings?.tempHousingPct.toNumber()],
    ["việc không xác định KL", rates.unmeasuredPct, settings?.unmeasuredPct.toNumber()],
    ["thu nhập chịu thuế tính trước", rates.presumptiveIncomePct, settings?.presumptiveIncomePct.toNumber()],
  ];
  const wrong = want.filter(([, w, h]) => h === undefined || Math.abs(w - h) > 1e-6);
  if (wrong.length > 0) {
    blocking.push(`Lưu Cài đặt của công trình trước khi import: ${wrong.map(([n, w]) => `${n} ${rateLabel(w)}`).join(", ")} (theo file).`);
  }

  if (suppliers.every((s) => s.supplierId !== null)) {
    const idOf = new Map(suppliers.map((s) => [s.key, s.supplierId!]));
    plan.inputs = buildWorkbookInputs(wb, ({ mst, name }) => idOf.get(supplierKey(mst, name)) ?? null, fileLines);
    plan.gates = goldenGates(wb, plan.inputs);
    for (const g of plan.gates.filter((x) => !x.ok)) {
      blocking.push(`Tính lại không khớp file — ${g.label}: file ${g.expected.toLocaleString("vi-VN")}, tính ${g.actual.toLocaleString("vi-VN")}.`);
    }
  }
  return plan;
}
