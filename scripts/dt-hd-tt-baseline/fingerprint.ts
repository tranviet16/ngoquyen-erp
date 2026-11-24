/**
 * Dấu vân tay dữ liệu: SHA-256 của mọi dòng mà báo cáo DT-HĐ-TT và Dashboard đọc, để `compare` phân biệt
 * "dữ liệu đã đổi" với "code đã đổi". Chỉ đọc. Các truy vấn lặp lại đúng điều kiện của
 * `lib/du-an/dt-hd-tt/report-service.ts` và `lib/du-an/dashboard-service.ts` (trừ cảnh báo hợp đồng, vốn
 * phụ thuộc ngày hôm nay); đọc cả dòng để bất kỳ cột nào đổi cũng bị phát hiện.
 */

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { requireCopyDatabaseUrl } from "./guards";

export type Db = PrismaClient;

export function openCopyDb(): { db: Db; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: requireCopyDatabaseUrl() });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { db, close: () => db.$disconnect() };
}

/** JSON ổn định: khóa object xếp thứ tự, Decimal / bigint thành chuỗi, Date thành ISO. */
function stable(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // Prisma.Decimal (decimal.js): có toFixed và không phải object thường.
    if (typeof (v as { toFixed?: unknown }).toFixed === "function" && typeof (v as { toString?: unknown }).toString === "function") {
      return String(value);
    }
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  }
  return value;
}

const byId = <T extends { id: number | string }>(rows: T[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id), "en", { numeric: true }));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");

/** Mọi đầu vào của getDtHdTtReports(projectId), cộng mã / tên công trình (nhãn tiêu đề in). */
async function reportInputs(db: Db, projectId: number) {
  const live = { projectId, deletedAt: null };
  const [project, settings, categories, estimates, groupCodes, aliases, counterparties, links, invoiceLines, receipts, payments] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true } }),
    db.projectSettings.findUnique({ where: { projectId } }),
    db.projectCategory.findMany({ where: live }),
    db.projectEstimate.findMany({ where: live }),
    db.projectGroupCode.findMany({ where: live }),
    db.projectItemAlias.findMany({ where: live }),
    db.projectCounterparty.findMany({ where: live }),
    db.projectCounterpartySupplier.findMany({ where: live }),
    db.projectInvoiceLine.findMany({ where: live }),
    db.projectActualReceipt.findMany({ where: live }),
    db.projectCashPayment.findMany({ where: live }),
  ]);
  const supplierIds = [...new Set([...links.map((l) => l.supplierId), ...invoiceLines.map((l) => l.supplierId), ...payments.flatMap((p) => (p.supplierId === null ? [] : [p.supplierId]))])];
  const suppliers = await db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } });
  return {
    project, settings,
    categories: byId(categories), estimates: byId(estimates), groupCodes: byId(groupCodes), aliases: byId(aliases),
    counterparties: byId(counterparties), links: byId(links), invoiceLines: byId(invoiceLines), receipts: byId(receipts),
    payments: byId(payments), suppliers: byId(suppliers),
  };
}

/** Đầu vào của getProjectDashboard(projectId), trừ danh sách hợp đồng sắp hết hạn (phụ thuộc ngày). */
async function dashboardInputs(db: Db, projectId: number) {
  const [project, settings, schedule, estimateSum, transactionSum, cashflow] = await Promise.all([
    db.project.findUnique({ where: { id: projectId } }),
    db.projectSettings.findUnique({ where: { projectId } }),
    db.projectSchedule.groupBy({ by: ["status"], where: { projectId, deletedAt: null }, _count: { id: true }, orderBy: { status: "asc" } }),
    db.projectEstimate.aggregate({ where: { projectId, deletedAt: null }, _sum: { totalVnd: true } }),
    db.projectTransaction.aggregate({ where: { projectId, deletedAt: null }, _sum: { amountTt: true, amountHd: true } }),
    db.project3WayCashflow.groupBy({ by: ["flowDirection"], where: { projectId, deletedAt: null }, _sum: { amountVnd: true }, orderBy: { flowDirection: "asc" } }),
  ]);
  return { project, settings, schedule, estimateSum, transactionSum, cashflow };
}

export interface Fingerprint {
  /** Báo cáo + Dashboard của công trình đang đo. */
  project: string;
  /** Dashboard của công trình đối chứng (không có sổ). */
  control: string;
  projectCode: string | null;
}

export async function computeFingerprint(db: Db, projectId: number, controlId: number): Promise<Fingerprint> {
  const [report, dashboard, control] = await Promise.all([reportInputs(db, projectId), dashboardInputs(db, projectId), dashboardInputs(db, controlId)]);
  return { project: hash({ report, dashboard }), control: hash(control), projectCode: report.project?.code ?? null };
}
