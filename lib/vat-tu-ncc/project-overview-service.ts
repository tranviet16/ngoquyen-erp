"use server";

/**
 * Tổng quan công nợ vật tư theo công trình — cửa vào "Theo công trình" của module vat-tu-ncc
 * (kế toán làm theo nếp Excel: công trình → NCC → các sheet).
 *
 * Cặp NCC × công trình "có hoạt động vật tư" = có phiếu, dòng sổ vật tư, số dư ban đầu vật tư
 * hoặc kỳ đối chiếu (chưa xoá).
 *
 * Số nợ TT/HĐ lấy từ `queryDetailReport` (cùng nguồn với báo cáo công nợ lũy kế — không viết lại
 * SQL báo cáo) và CHỈ được trả khi người dùng có quyền đọc module `cong-no-vt` và module đó đã
 * phát hành (giống điều kiện layout NCC dùng để hiện tab Thanh toán). `includeDebt` chỉ là yêu
 * cầu của trang gọi; quyền luôn được kiểm lại ở đây vì hàm là server action gọi được từ client.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { canAccess } from "@/lib/acl/effective";
import { queryDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { requireProjectId } from "./pair-scope";

// ─── Kiểu trả về ──────────────────────────────────────────────────────────────

export interface MaterialProjectRow {
  id: number;
  code: string;
  name: string;
  status: string;
  entityName: string | null;
  /** Số NCC có hoạt động vật tư ở công trình. */
  supplierCount: number;
  deliveryCount: number;
  /** Ngày phiếu gần nhất "YYYY-MM-DD" hoặc null. */
  lastDeliveryDate: string | null;
}

export type PairPeriodStatus = "cutover" | "signed" | "unsigned";

export interface PairLatestPeriod {
  id: number;
  periodFrom: string;
  periodTo: string;
  status: PairPeriodStatus;
}

export interface ProjectPairRow {
  supplierId: number;
  supplierName: string;
  deliveryCount: number;
  lastDeliveryDate: string | null;
  latestPeriod: PairLatestPeriod | null;
  /** Còn nợ đến hôm nay (TT/HĐ, chuỗi số nguyên đồng). null khi người dùng không được xem số nợ. */
  debt: { tt: string; hd: string } | null;
}

export interface ProjectPairsResult {
  project: { id: number; code: string; name: string; entityId: number | null; entityName: string | null };
  /** true khi số nợ được tính và trả về (có quyền đọc cong-no-vt). */
  debtVisible: boolean;
  /** Ngày "đến" của cột nợ ("YYYY-MM-DD", ngày nghiệp vụ hôm nay). */
  debtAsOf: string;
  pairs: ProjectPairRow[];
}

export interface SupplierProjectOption {
  id: number;
  code: string;
  name: string;
}

// ─── Nội bộ ───────────────────────────────────────────────────────────────────

/** Mọi cặp (NCC, công trình) có hoạt động vật tư. Dùng làm subquery, lọc ở ngoài. */
const ACTIVE_PAIRS_SQL = Prisma.sql`
  SELECT "supplierId" AS supplier_id, "projectId" AS project_id
    FROM supplier_delivery_daily
   WHERE "deletedAt" IS NULL AND "projectId" IS NOT NULL
  UNION
  SELECT "partyId", "projectId"
    FROM ledger_transactions
   WHERE "ledgerType" = 'material' AND "deletedAt" IS NULL AND "projectId" IS NOT NULL
  UNION
  SELECT "partyId", "projectId"
    FROM ledger_opening_balances
   WHERE "ledgerType" = 'material' AND "projectId" IS NOT NULL
  UNION
  SELECT "supplierId", "projectId"
    FROM supplier_reconciliations
   WHERE "deletedAt" IS NULL
`;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function assertPositiveInt(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} không hợp lệ`);
  }
}

function periodStatus(r: { importRunId: number | null; signedBySupplier: boolean }): PairPeriodStatus {
  if (r.importRunId != null) return "cutover";
  return r.signedBySupplier ? "signed" : "unsigned";
}

// ─── Server actions ───────────────────────────────────────────────────────────

/** Công trình có hoạt động vật tư (phiếu, sổ, số dư ban đầu hoặc kỳ đối chiếu), sắp theo mã. */
export async function listProjectsWithMaterial(): Promise<MaterialProjectRow[]> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  const pairCounts = await prisma.$queryRaw<{ project_id: number; supplier_count: number }[]>`
    SELECT p.project_id, COUNT(DISTINCT p.supplier_id)::int AS supplier_count
      FROM (${ACTIVE_PAIRS_SQL}) p
      JOIN suppliers s ON s.id = p.supplier_id AND s."deletedAt" IS NULL
     GROUP BY p.project_id
  `;
  if (pairCounts.length === 0) return [];
  const projectIds = pairCounts.map((r) => Number(r.project_id));

  const [projects, deliveries] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds }, deletedAt: null },
      select: { id: true, code: true, name: true, status: true, entity: { select: { name: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.supplierDeliveryDaily.groupBy({
      by: ["projectId"],
      where: { deletedAt: null, projectId: { in: projectIds } },
      _count: { id: true },
      _max: { date: true },
    }),
  ]);
  const supplierCount = new Map(pairCounts.map((r) => [Number(r.project_id), Number(r.supplier_count)]));
  const deliveryStats = new Map(deliveries.map((d) => [d.projectId, d]));

  return projects.map((p) => {
    const stats = deliveryStats.get(p.id);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      entityName: p.entity?.name ?? null,
      supplierCount: supplierCount.get(p.id) ?? 0,
      deliveryCount: stats?._count.id ?? 0,
      lastDeliveryDate: stats?._max.date ? isoDate(stats._max.date) : null,
    };
  });
}

/**
 * Các NCC của một công trình: số phiếu, kỳ gần nhất (chuyển đổi / chưa ký / đã ký) và — khi
 * được yêu cầu VÀ người dùng có quyền đọc cong-no-vt — còn nợ TT/HĐ đến hôm nay theo
 * `queryDetailReport`. Trả null khi công trình không tồn tại hoặc đã xoá.
 */
export async function listPairsOfProject(
  projectId: number,
  opts?: { includeDebt?: boolean },
): Promise<ProjectPairsResult | null> {
  const { userId } = await requireReleasedModuleRequest("vat-tu-ncc");
  const pid = requireProjectId(projectId);
  const project = await prisma.project.findFirst({
    where: { id: pid, deletedAt: null },
    select: { id: true, code: true, name: true, entityId: true, entity: { select: { name: true } } },
  });
  if (!project) return null;

  const today = toBusinessDateUtc(new Date());
  const debtVisible =
    opts?.includeDebt === true && (await canAccess(userId, "cong-no-vt", { minLevel: "read", scope: "module" }));

  const supplierRows = await prisma.$queryRaw<{ supplier_id: number }[]>`
    SELECT DISTINCT p.supplier_id FROM (${ACTIVE_PAIRS_SQL}) p WHERE p.project_id = ${pid}
  `;
  const supplierIds = supplierRows.map((r) => Number(r.supplier_id));
  const base: Omit<ProjectPairsResult, "pairs"> = {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      entityId: project.entityId,
      entityName: project.entity?.name ?? null,
    },
    debtVisible,
    debtAsOf: isoDate(today),
  };
  if (supplierIds.length === 0) return { ...base, pairs: [] };

  const [suppliers, deliveries, recons, report] = await Promise.all([
    prisma.supplier.findMany({
      where: { id: { in: supplierIds }, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.supplierDeliveryDaily.groupBy({
      by: ["supplierId"],
      where: { deletedAt: null, projectId: pid, supplierId: { in: supplierIds } },
      _count: { id: true },
      _max: { date: true },
    }),
    prisma.supplierReconciliation.findMany({
      where: { projectId: pid, supplierId: { in: supplierIds }, deletedAt: null },
      orderBy: [{ periodTo: "desc" }, { id: "desc" }],
      select: { id: true, supplierId: true, periodFrom: true, periodTo: true, signedBySupplier: true, importRunId: true },
    }),
    debtVisible
      ? queryDetailReport({ ledgerType: "material", projectIds: [pid], to: today, showZero: true })
      : Promise.resolve(null),
  ]);

  const deliveryStats = new Map(deliveries.map((d) => [d.supplierId, d]));
  const latestPeriod = new Map<number, PairLatestPeriod>();
  for (const r of recons) {
    if (latestPeriod.has(r.supplierId)) continue; // đã sắp periodTo giảm dần → dòng đầu là kỳ gần nhất
    latestPeriod.set(r.supplierId, {
      id: r.id,
      periodFrom: isoDate(r.periodFrom),
      periodTo: isoDate(r.periodTo),
      status: periodStatus(r),
    });
  }
  // Một cặp có thể có nhiều dòng báo cáo nếu dữ liệu cũ mang Chủ thể khác → cộng theo NCC.
  const debtByParty = new Map<number, { tt: Prisma.Decimal; hd: Prisma.Decimal }>();
  for (const row of report?.rows ?? []) {
    const acc = debtByParty.get(row.partyId) ?? { tt: new Prisma.Decimal(0), hd: new Prisma.Decimal(0) };
    acc.tt = acc.tt.plus(row.cuoiKyTt);
    acc.hd = acc.hd.plus(row.cuoiKyHd);
    debtByParty.set(row.partyId, acc);
  }

  const pairs = suppliers
    .map((s): ProjectPairRow => {
      const stats = deliveryStats.get(s.id);
      const debt = debtByParty.get(s.id);
      return {
        supplierId: s.id,
        supplierName: s.name,
        deliveryCount: stats?._count.id ?? 0,
        lastDeliveryDate: stats?._max.date ? isoDate(stats._max.date) : null,
        latestPeriod: latestPeriod.get(s.id) ?? null,
        debt: debtVisible ? { tt: (debt?.tt ?? new Prisma.Decimal(0)).toFixed(0), hd: (debt?.hd ?? new Prisma.Decimal(0)).toFixed(0) } : null,
      };
    })
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName, "vi"));

  return { ...base, pairs };
}

/** Công trình mà NCC đã có hoạt động vật tư — nguồn của bộ chọn công trình ở các tab theo cặp. */
export async function listSupplierProjects(supplierId: number): Promise<SupplierProjectOption[]> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  assertPositiveInt(supplierId, "Mã NCC");
  const rows = await prisma.$queryRaw<{ project_id: number }[]>`
    SELECT DISTINCT p.project_id FROM (${ACTIVE_PAIRS_SQL}) p WHERE p.supplier_id = ${supplierId}
  `;
  if (rows.length === 0) return [];
  return prisma.project.findMany({
    where: { id: { in: rows.map((r) => Number(r.project_id)) }, deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}
