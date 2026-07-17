import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { getChiTieuReport } from "@/lib/sl-dt/report-service";
import { bypassAudit } from "@/lib/async-context";
import { writeAuditLog } from "@/lib/audit";

export type FinancePrSource = "material_ledger" | "labor_ledger" | "sl_dt" | "manual";
export type FinancePrType = "payable" | "receivable";

export interface FinancePrRow {
  id: string;
  source: FinancePrSource;
  sourceLineId: number | null;
  partyName: string;
  partyType: string;
  entityId: number | null;
  entityName: string | null;
  type: FinancePrType;
  amountVnd: Prisma.Decimal;
  sourceAmountVnd: Prisma.Decimal | null;
  overrideAmountVnd: Prisma.Decimal | null;
  periodYear: number | null;
  periodMonth: number | null;
  dueDate: Date | null;
  status: string;
  note: string | null;
  isExcluded: boolean;
  isStale: boolean;
}

interface PayableSourceRow {
  entity_id: number;
  entity_name: string;
  party_id: number;
  party_name: string;
  balance_tt: Prisma.Decimal;
}

interface PeriodRef {
  year: number;
  month: number;
}

export interface PayableSyncEntityOption {
  entityId: number;
  entityName: string;
  rowCount: number;
  amountVnd: Prisma.Decimal;
  sourceModules: Array<"material_ledger" | "labor_ledger">;
}

function refreshPrPages() {
  revalidatePath("/tai-chinh/phai-thu-tra");
  revalidatePath("/tai-chinh");
}

function effectiveAmount(source: Prisma.Decimal, override: Prisma.Decimal | null) {
  return override ?? source;
}

function addDecimal(a: Prisma.Decimal, b: Prisma.Decimal) {
  return a.plus(b);
}

function toBangkokPeriod(date: Date): PeriodRef {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

function latestDate(dates: Array<Date | null | undefined>) {
  return dates.filter((d): d is Date => d instanceof Date).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}

function formatLotPartyName(code: string, lotName: string) {
  const normalizedCode = code.trim();
  const normalizedLotName = lotName.trim();
  if (!normalizedCode) return normalizedLotName;
  if (!normalizedLotName || normalizedCode.toLowerCase() === normalizedLotName.toLowerCase()) {
    return normalizedCode;
  }
  return `${normalizedCode} - ${normalizedLotName}`;
}

async function getLatestLedgerPeriod(ledgerType: "material" | "labor"): Promise<PeriodRef | null> {
  const [latestTx, latestOpening] = await Promise.all([
    prisma.ledgerTransaction.findFirst({
      where: { ledgerType, deletedAt: null },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.ledgerOpeningBalance.findFirst({
      where: { ledgerType },
      orderBy: { asOfDate: "desc" },
      select: { asOfDate: true },
    }),
  ]);
  const date = latestDate([latestTx?.date, latestOpening?.asOfDate]);
  return date ? toBangkokPeriod(date) : null;
}

async function getLatestReceivablePeriod(): Promise<PeriodRef> {
  const latest = await prisma.slDtMonthlyInput.findFirst({
    where: { dtKeHoachKy: { gt: 0 } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { year: true, month: true },
  });
  if (!latest) {
    throw new Error("Chưa có dữ liệu Chỉ tiêu doanh thu SL-DT để đồng bộ phải thu.");
  }
  return latest;
}

async function queryPayableRows(sourceModule: "material_ledger" | "labor_ledger") {
  const ledgerType = sourceModule === "material_ledger" ? "material" : "labor";
  const table = sourceModule === "material_ledger" ? Prisma.sql`suppliers` : Prisma.sql`contractors`;
  const fallback = sourceModule === "material_ledger" ? "NCC" : "Đội";
  return prisma.$queryRaw<PayableSourceRow[]>`
    WITH ob AS (
      SELECT "entityId", "partyId", COALESCE(SUM("balanceTt"), 0) AS opening_tt
      FROM ledger_opening_balances
      WHERE "ledgerType" = ${ledgerType}
      GROUP BY "entityId", "partyId"
    ),
    tx AS (
      SELECT "entityId", "partyId",
        COALESCE(SUM(CASE WHEN "transactionType" = 'thanh_toan' THEN -"totalTt" ELSE "totalTt" END), 0) AS tx_tt
      FROM ledger_transactions
      WHERE "ledgerType" = ${ledgerType} AND "deletedAt" IS NULL
      GROUP BY "entityId", "partyId"
    ),
    bal AS (
      SELECT COALESCE(ob."entityId", tx."entityId") AS entity_id,
        COALESCE(ob."partyId", tx."partyId") AS party_id,
        COALESCE(ob.opening_tt, 0) + COALESCE(tx.tx_tt, 0) AS balance_tt
      FROM ob FULL OUTER JOIN tx
        ON ob."entityId" = tx."entityId" AND ob."partyId" = tx."partyId"
    )
    SELECT bal.entity_id, COALESCE(e.name, 'Chủ thể #' || bal.entity_id) AS entity_name,
      bal.party_id, COALESCE(p.name, ${fallback} || ' #' || bal.party_id) AS party_name, bal.balance_tt
    FROM bal
    LEFT JOIN entities e ON e.id = bal.entity_id
    LEFT JOIN ${table} p ON p.id = bal.party_id
    WHERE bal.balance_tt > 0
    ORDER BY entity_name, bal.balance_tt DESC
  `;
}

export async function listPayableSyncEntityOptions(): Promise<PayableSyncEntityOption[]> {
  await requireActiveAdmin();
  const sources: Array<"material_ledger" | "labor_ledger"> = ["material_ledger", "labor_ledger"];
  const byEntity = new Map<number, PayableSyncEntityOption>();

  for (const sourceModule of sources) {
    const rows = await queryPayableRows(sourceModule);
    for (const row of rows) {
      const entityId = Number(row.entity_id);
      const current = byEntity.get(entityId);
      if (current) {
        current.rowCount += 1;
        current.amountVnd = addDecimal(current.amountVnd, new Prisma.Decimal(row.balance_tt));
        if (!current.sourceModules.includes(sourceModule)) current.sourceModules.push(sourceModule);
      } else {
        byEntity.set(entityId, {
          entityId,
          entityName: row.entity_name,
          rowCount: 1,
          amountVnd: new Prisma.Decimal(row.balance_tt),
          sourceModules: [sourceModule],
        });
      }
    }
  }

  return [...byEntity.values()].sort((a, b) => a.entityName.localeCompare(b.entityName, "vi"));
}

export async function listFinancePrRows(): Promise<FinancePrRow[]> {
  const [synced, manual] = await Promise.all([
    prisma.financePrLine.findMany({
      where: { deletedAt: null, isExcluded: false, isStale: false },
      orderBy: [{ type: "asc" }, { sourceModule: "asc" }, { partyName: "asc" }],
    }),
    prisma.payableReceivableAdjustment.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
    }),
  ]);

  return [
    ...synced.map((r) => ({
      id: `sync-${r.id}`,
      source: r.sourceModule as FinancePrSource,
      sourceLineId: r.id,
      partyName: r.partyName,
      partyType: r.partyType,
      entityId: r.entityId,
      entityName: r.entityName,
      type: r.type as FinancePrType,
      amountVnd: effectiveAmount(r.sourceAmountVnd, r.overrideAmountVnd),
      sourceAmountVnd: r.sourceAmountVnd,
      overrideAmountVnd: r.overrideAmountVnd,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      dueDate: r.dueDate,
      status: r.status,
      note: r.note,
      isExcluded: r.isExcluded,
      isStale: r.isStale,
    })),
    ...manual.map((r) => ({
      id: `manual-${r.id}`,
      source: "manual" as const,
      sourceLineId: null,
      partyName: r.partyName,
      partyType: r.partyType,
      entityId: null,
      entityName: null,
      type: r.type as FinancePrType,
      amountVnd: r.amountVnd,
      sourceAmountVnd: null,
      overrideAmountVnd: null,
      periodYear: null,
      periodMonth: null,
      dueDate: r.dueDate,
      status: r.status,
      note: r.note,
      isExcluded: false,
      isStale: false,
    })),
  ];
}

export async function getFinancePrTotals(): Promise<Record<FinancePrType, Prisma.Decimal>> {
  const rows = await listFinancePrRows();
  return rows.reduce<Record<FinancePrType, Prisma.Decimal>>(
    (totals, row) => ({
      ...totals,
      [row.type]: totals[row.type].plus(row.amountVnd),
    }),
    { payable: new Prisma.Decimal(0), receivable: new Prisma.Decimal(0) },
  );
}

async function getActiveExclusions(sourceModule: string) {
  const rows = await prisma.financeSyncExclusion.findMany({
    where: { sourceModule, active: true },
    select: { partyType: true, partyId: true },
  });
  return {
    parties: new Set(rows.filter((r) => r.partyType !== "entity").map((r) => `${r.partyType}:${r.partyId ?? "null"}`)),
    entities: new Set(rows.filter((r) => r.partyType === "entity").map((r) => r.partyId).filter((id): id is number => id != null)),
  };
}

export async function syncPayablesFromLedgers(options: { excludedEntityIds?: number[] } = {}) {
  const userId = await requireActiveAdmin();
  const excludedEntityIds = new Set(options.excludedEntityIds ?? []);
  const sources: Array<["material_ledger" | "labor_ledger", string]> = [
    ["material_ledger", "supplier"],
    ["labor_ledger", "contractor"],
  ];
  let upserted = 0;
  let excluded = 0;
  const periods: Record<string, PeriodRef> = {};

  for (const [sourceModule, partyType] of sources) {
    const ledgerType = sourceModule === "material_ledger" ? "material" : "labor";
    const period = await getLatestLedgerPeriod(ledgerType);
    if (!period) continue;
    periods[sourceModule] = period;
    const batch = await prisma.financePrSyncBatch.create({
      data: { sourceModule, periodYear: period.year, periodMonth: period.month, createdByUserId: userId },
    });
    const rows = await queryPayableRows(sourceModule);
    const activeExclusions = await getActiveExclusions(sourceModule);
    const sourceKeys = rows.map((r) => `${period.year}-${period.month}:${r.entity_id}:${r.party_id}`);
    let sourceExcluded = 0;

    for (const r of rows) {
      const amount = new Prisma.Decimal(r.balance_tt);
      const rowExcluded = excludedEntityIds.has(Number(r.entity_id))
        || activeExclusions.entities.has(Number(r.entity_id))
        || activeExclusions.parties.has(`${partyType}:${Number(r.party_id)}`);
      if (rowExcluded) {
        excluded += 1;
        sourceExcluded += 1;
      }
      await bypassAudit(() =>
        prisma.financePrLine.upsert({
          where: { sourceModule_sourceKey: { sourceModule, sourceKey: `${period.year}-${period.month}:${r.entity_id}:${r.party_id}` } },
          create: {
            type: "payable", sourceModule, sourceKey: `${period.year}-${period.month}:${r.entity_id}:${r.party_id}`,
            partyType, partyId: Number(r.party_id), partyName: r.party_name,
            entityId: Number(r.entity_id), entityName: r.entity_name,
            periodYear: period.year, periodMonth: period.month, sourceAmountVnd: amount,
            isExcluded: rowExcluded, isStale: false, note: sourceModule === "material_ledger" ? "Sync công nợ vật tư" : "Sync công nợ nhân công",
            syncBatchId: batch.id,
          },
          update: {
            partyName: r.party_name, entityId: Number(r.entity_id), entityName: r.entity_name,
            periodYear: period.year, periodMonth: period.month,
            sourceAmountVnd: amount, isExcluded: rowExcluded,
            isStale: false, deletedAt: null, syncBatchId: batch.id,
          },
        })
      );
      upserted += 1;
    }
    await bypassAudit(() =>
      prisma.financePrLine.updateMany({
        where: { sourceModule, sourceKey: { notIn: sourceKeys } },
        data: { isStale: true },
      })
    );
    await prisma.financePrSyncBatch.update({
      where: { id: batch.id },
      data: { finishedAt: new Date(), summaryJson: { upserted: rows.length, excluded: sourceExcluded, excludedEntityIds: [...excludedEntityIds] } },
    });
    await writeAuditLog({
      tableName: "finance_pr_lines",
      recordId: `batch:${batch.id}`,
      action: "sync_payables",
      userId,
      after: { sourceModule, year: period.year, month: period.month, upserted: rows.length, excluded: sourceExcluded, excludedEntityIds: [...excludedEntityIds] },
    });
  }
  if (Object.keys(periods).length === 0) {
    throw new Error("Chưa có dữ liệu công nợ vật tư/nhân công để đồng bộ phải trả.");
  }
  refreshPrPages();
  return { upserted, excluded, periods };
}

export async function syncReceivablesFromSlDt() {
  const userId = await requireActiveAdmin();
  const period = await getLatestReceivablePeriod();
  const batch = await prisma.financePrSyncBatch.create({
    data: { sourceModule: "sl_dt", periodYear: period.year, periodMonth: period.month, createdByUserId: userId },
  });
  const rows = (await getChiTieuReport(period.year, period.month)).filter((r) => r.kind === "lot" && r.lotId && r.dtKeHoachKy > 0);
  const activeExclusions = await getActiveExclusions("sl_dt");
  const sourceKeys = rows.map((r) => `${period.year}-${period.month}:${r.lotId}`);

  for (const r of rows) {
    const rowExcluded = activeExclusions.parties.has(`lot:${r.lotId}`);
    const partyName = formatLotPartyName(r.code, r.lotName);
    await bypassAudit(() =>
      prisma.financePrLine.upsert({
        where: { sourceModule_sourceKey: { sourceModule: "sl_dt", sourceKey: `${period.year}-${period.month}:${r.lotId}` } },
        create: {
          type: "receivable", sourceModule: "sl_dt", sourceKey: `${period.year}-${period.month}:${r.lotId}`,
          partyType: "lot", partyId: r.lotId, partyName,
          entityId: null, entityName: null,
          periodYear: period.year, periodMonth: period.month, sourceAmountVnd: new Prisma.Decimal(r.dtKeHoachKy),
          isExcluded: rowExcluded, note: "Sync doanh thu chỉ tiêu SL-DT", syncBatchId: batch.id,
        },
        update: {
          partyName, sourceAmountVnd: new Prisma.Decimal(r.dtKeHoachKy),
          periodYear: period.year, periodMonth: period.month,
          isExcluded: rowExcluded, isStale: false, deletedAt: null, syncBatchId: batch.id,
        },
      })
    );
  }
  await bypassAudit(() =>
    prisma.financePrLine.updateMany({
      where: { sourceModule: "sl_dt", sourceKey: { notIn: sourceKeys } },
      data: { isStale: true },
    })
  );
  await prisma.financePrSyncBatch.update({
    where: { id: batch.id },
    data: { finishedAt: new Date(), summaryJson: { upserted: rows.length } },
  });
  await writeAuditLog({
    tableName: "finance_pr_lines",
    recordId: `batch:${batch.id}`,
    action: "sync_receivables",
    userId,
    after: { sourceModule: "sl_dt", year: period.year, month: period.month, upserted: rows.length },
  });
  refreshPrPages();
  return { upserted: rows.length, period };
}

export async function undoLatestFinancePrSync(kind: "payable" | "receivable") {
  const userId = await requireActiveAdmin();
  const sourceModules = kind === "payable" ? ["material_ledger", "labor_ledger"] : ["sl_dt"];
  const latestBatches = await Promise.all(sourceModules.map((sourceModule) =>
    prisma.financePrSyncBatch.findFirst({
      where: { sourceModule, status: "completed" },
      orderBy: { startedAt: "desc" },
      select: { id: true, sourceModule: true, periodYear: true, periodMonth: true },
    }),
  ));
  const batches = latestBatches.filter((b): b is NonNullable<typeof b> => b != null);
  if (batches.length === 0) throw new Error("Không có batch sync nào để undo.");
  const batchIds = batches.map((b) => b.id);
  const deleted = await bypassAudit(() =>
    prisma.financePrLine.deleteMany({ where: { syncBatchId: { in: batchIds } } }),
  );
  await bypassAudit(() =>
    prisma.financePrSyncBatch.updateMany({
      where: { id: { in: batchIds } },
      data: { status: "undone", finishedAt: new Date() },
    }),
  );
  await writeAuditLog({
    tableName: "finance_pr_lines",
    recordId: `undo:${batchIds.join(",")}`,
    action: kind === "payable" ? "undo_sync_payables" : "undo_sync_receivables",
    userId,
    after: { kind, batchIds, deleted: deleted.count, batches },
  });
  refreshPrPages();
  return { deleted: deleted.count, batches };
}

export async function updateFinancePrLineOverride(id: number, amountVnd: string | null) {
  await requireActiveAdmin();
  await prisma.financePrLine.update({
    where: { id },
    data: { overrideAmountVnd: amountVnd ? new Prisma.Decimal(amountVnd) : null },
  });
  refreshPrPages();
}

export async function excludeFinancePrLine(id: number, reason?: string) {
  await requireActiveAdmin();
  const line = await prisma.financePrLine.update({ where: { id }, data: { isExcluded: true } });
  await prisma.financeSyncExclusion.create({
    data: {
      sourceModule: line.sourceModule, partyType: line.partyType, partyId: line.partyId,
      partyName: line.partyName, reason: reason ?? null,
    },
  });
  refreshPrPages();
}

export async function excludeFinancePrLineEntity(id: number, reason?: string) {
  await requireActiveAdmin();
  const line = await prisma.financePrLine.findUniqueOrThrow({ where: { id } });
  if (!line.entityId) throw new Error("Dòng này không có chủ thể để loại trừ");
  await prisma.financeSyncExclusion.create({
    data: {
      sourceModule: line.sourceModule, partyType: "entity", partyId: line.entityId,
      partyName: line.entityName, reason: reason ?? null,
    },
  });
  await bypassAudit(() =>
    prisma.financePrLine.updateMany({
      where: { sourceModule: line.sourceModule, entityId: line.entityId },
      data: { isExcluded: true },
    })
  );
  refreshPrPages();
}

function parseFinancePrRowIds(rowIds: string[]) {
  const syncIds: number[] = [];
  const manualIds: number[] = [];
  for (const rowId of rowIds) {
    const [prefix, rawId] = rowId.split("-");
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (prefix === "sync") syncIds.push(id);
    if (prefix === "manual") manualIds.push(id);
  }
  return { syncIds, manualIds };
}

export async function deleteFinancePrRows(rowIds: string[]) {
  const userId = await requireActiveAdmin();
  const { syncIds, manualIds } = parseFinancePrRowIds(rowIds);
  const now = new Date();
  let deleted = 0;

  if (syncIds.length > 0) {
    const lines = await prisma.financePrLine.findMany({ where: { id: { in: syncIds }, deletedAt: null } });
    for (const line of lines) {
      await prisma.financeSyncExclusion.create({
        data: {
          sourceModule: line.sourceModule,
          partyType: line.partyType,
          partyId: line.partyId,
          partyName: line.partyName,
          reason: "Xóa dòng từ màn Phải thu / Phải trả",
        },
      });
    }
    const result = await bypassAudit(() =>
      prisma.financePrLine.updateMany({ where: { id: { in: syncIds }, deletedAt: null }, data: { deletedAt: now, isExcluded: true } }),
    );
    deleted += result.count;
  }

  if (manualIds.length > 0) {
    const result = await bypassAudit(() =>
      prisma.payableReceivableAdjustment.updateMany({ where: { id: { in: manualIds }, deletedAt: null }, data: { deletedAt: now } }),
    );
    deleted += result.count;
  }

  await writeAuditLog({
    tableName: "finance_pr_lines",
    recordId: rowIds.join(","),
    action: "delete_pr_rows",
    userId,
    after: { rowIds, syncIds, manualIds, deleted },
  });
  refreshPrPages();
  return { deleted };
}

export async function deleteAllFinancePrRows() {
  const rows = await listFinancePrRows();
  return deleteFinancePrRows(rows.map((row) => row.id));
}
