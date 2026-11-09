/**
 * Đọc từ DB cho lớp lập kế hoạch: danh mục (Chủ thể, NCC, công trình, vật tư chưa xóa) và dữ kiện
 * của các NCC trong run — đọc SAU khi đã khóa NCC ("khóa rồi mới kiểm"): run chuyển đổi khác đã
 * ghi, dữ liệu đang có theo cặp (guard độc quyền), phiếu ERP, thanh toán ERP sau mốc, dòng đợt
 * `vat_tu` còn mở (draft / submitted / approved — mỗi đợt cần người dùng xác nhận).
 */

import type { ImportTx } from "../adapter-types";
import { MATERIAL_CUTOVER_ADAPTER } from "@/lib/vat-tu-ncc/pair-scope";
import { CUTOVER_DATE } from "./cutover-constants";
import { addDays } from "./day-utils";
import { POST_CUTOVER_DAY_TOLERANCE } from "./post-cutover-matching";
import type { Catalog, DbFacts, PairGuardFact } from "./plan-types";

const OPEN_ROUND_STATUSES = ["draft", "submitted", "approved"];

export async function loadCatalog(db: ImportTx): Promise<Catalog> {
  const entities = await db.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { id: "asc" } });
  const suppliers = await db.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { id: "asc" } });
  const projects = await db.project.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, code: true, entityId: true },
    orderBy: { id: "asc" },
  });
  const items = await db.item.findMany({ where: { deletedAt: null }, select: { id: true, name: true, unit: true }, orderBy: { id: "asc" } });
  return { entities, suppliers, projects, items };
}

interface GuardRow {
  s: number;
  p: number;
  ledger: number;
  openings: number;
  recons: number;
}

export async function loadDbFacts(db: ImportTx, supplierIds: readonly number[], runId: number): Promise<DbFacts> {
  const other = await db.importRun.findFirst({
    where: { adapter: MATERIAL_CUTOVER_ADAPTER, status: "committed", id: { not: runId } },
    select: { id: true },
    orderBy: { id: "desc" },
  });
  const ids = [...supplierIds];
  if (ids.length === 0) {
    return { otherCommittedRunId: other?.id ?? null, guard: [], erpDeliveries: [], erpPayments: [], openRoundItems: [] };
  }
  const cutoverEnd = addDays(CUTOVER_DATE, 1);
  const guardRows = await db.$queryRaw<GuardRow[]>`
    SELECT s, p, SUM(ledger)::int AS ledger, SUM(openings)::int AS openings, SUM(recons)::int AS recons FROM (
      SELECT "partyId" AS s, "projectId" AS p, COUNT(*) AS ledger, 0 AS openings, 0 AS recons
        FROM ledger_transactions
       WHERE "ledgerType" = 'material' AND "partyId" = ANY(${ids}::int[]) AND "projectId" IS NOT NULL
         AND "deletedAt" IS NULL AND date < ${cutoverEnd}
       GROUP BY 1, 2
      UNION ALL
      SELECT "partyId", "projectId", 0, COUNT(*), 0 FROM ledger_opening_balances
       WHERE "ledgerType" = 'material' AND "partyId" = ANY(${ids}::int[]) AND "projectId" IS NOT NULL
       GROUP BY 1, 2
      UNION ALL
      SELECT "supplierId", "projectId", 0, 0, COUNT(*) FROM supplier_reconciliations
       WHERE "supplierId" = ANY(${ids}::int[]) AND "deletedAt" IS NULL
       GROUP BY 1, 2
    ) x GROUP BY s, p`;
  const guard: PairGuardFact[] = guardRows.map((r) => ({
    supplierId: Number(r.s),
    projectId: Number(r.p),
    ledgerBeforeCutover: Number(r.ledger),
    openings: Number(r.openings),
    liveReconciliations: Number(r.recons),
  }));

  const deliveries = await db.supplierDeliveryDaily.findMany({
    where: { supplierId: { in: ids }, deletedAt: null, projectId: { not: null } },
    select: { id: true, supplierId: true, projectId: true, date: true, itemId: true, qty: true, unitPrice: true, totalAmount: true },
  });
  const payments = await db.ledgerTransaction.findMany({
    where: {
      ledgerType: "material",
      transactionType: "thanh_toan",
      partyId: { in: ids },
      projectId: { not: null },
      deletedAt: null,
      date: { gte: addDays(CUTOVER_DATE, -POST_CUTOVER_DAY_TOLERANCE + 1) },
    },
    select: { id: true, partyId: true, projectId: true, date: true, totalTt: true, paymentRoundItemId: true, content: true },
  });
  const roundItems = await db.paymentRoundItem.findMany({
    where: { category: "vat_tu", supplierId: { in: ids }, round: { status: { in: OPEN_ROUND_STATUSES }, deletedAt: null } },
    select: {
      id: true,
      roundId: true,
      supplierId: true,
      projectId: true,
      soDeNghi: true,
      soDuyet: true,
      round: { select: { month: true, sequence: true, status: true } },
    },
    orderBy: [{ roundId: "asc" }, { id: "asc" }],
  });

  return {
    otherCommittedRunId: other?.id ?? null,
    guard,
    erpDeliveries: deliveries.map((d) => {
      const qty = Number(d.qty);
      const amount = d.totalAmount !== null ? Number(d.totalAmount) : d.unitPrice !== null ? Number(d.unitPrice) * qty : null;
      return { id: d.id, supplierId: d.supplierId, projectId: d.projectId as number, date: d.date, itemId: d.itemId, qty, amount };
    }),
    erpPayments: payments.map((p) => ({
      id: p.id,
      supplierId: p.partyId,
      projectId: p.projectId as number,
      date: p.date,
      amountTt: Number(p.totalTt),
      paymentRoundItemId: p.paymentRoundItemId,
      content: p.content,
    })),
    openRoundItems: roundItems.map((i) => ({
      id: i.id,
      roundId: i.roundId,
      roundLabel: `${i.round.month}-${i.round.sequence}`,
      status: i.round.status,
      supplierId: i.supplierId,
      projectId: i.projectId,
      soDeNghi: Number(i.soDeNghi),
      soDuyet: i.soDuyet === null ? null : Number(i.soDuyet),
      amount: Number(i.soDuyet ?? i.soDeNghi),
    })),
  };
}
