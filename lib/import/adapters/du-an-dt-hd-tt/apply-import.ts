/**
 * Ghi import "Đối chiếu DT-HĐ-TT" trong transaction commit của engine (đã duyệt, đã khóa). Thứ tự:
 *   1. đồng bộ dự toán: xóa mềm + supersededByRunId các dòng thay, thêm dòng mới (importRunId);
 *   2. thay giao dịch HĐ cũ: đúng tập id đã xác nhận, số dòng phải khớp;
 *   3. sổ: mã nhóm → đầu mối → NCC của đầu mối → ánh xạ → hóa đơn → thực tế nhập → chi thực tế;
 *   4. giao dịch HĐ sinh từ hóa đơn cho các tab cũ (sourceInvoiceLineId, importRunId).
 * Ghi bằng SQL thô có importRunId (không qua audit extension). Lỗi nào cũng ném ngay → engine rollback.
 * Tập dòng bị thay lưu vào expected.superseded để hoàn tác khôi phục đúng tập đó.
 */

import { Prisma } from "@prisma/client";
import { buildBookIndex } from "@/lib/du-an/dt-hd-tt/book-index";
import { deriveTransactions } from "@/lib/du-an/dt-hd-tt/derive-transactions";
import { dtLineKeyOf, groupEstimatesByKey, itemKeyOf } from "@/lib/du-an/dt-hd-tt/keys";
import type { ImportSummary, ImportTx } from "../adapter-types";
import type { ImportPlan } from "./import-plan";
import type { DtHdTtWorkbook } from "./workbook-types";

type Tx = Pick<ImportTx, "$queryRaw" | "$executeRaw" | "projectEstimate">;

async function insertId(tx: Tx, sql: Prisma.Sql): Promise<number> {
  const [row] = await tx.$queryRaw<{ id: number }[]>(sql);
  return Number(row.id);
}

export async function applyImport(wb: DtHdTtWorkbook, plan: ImportPlan, tx: Tx, runId: number): Promise<ImportSummary> {
  const projectId = plan.projectId!;
  const inputs = plan.inputs!;
  const sync = plan.dtSync!;
  const now = new Date();

  // 1. Dự toán.
  const estSum = await tx.$queryRaw<{ s: Prisma.Decimal | null }[]>`
    SELECT SUM("totalVnd") AS s FROM project_estimates WHERE id = ANY(${sync.supersedeEstimateIds}::int[])`;
  const estUpdated = await tx.$executeRaw`
    UPDATE project_estimates SET "deletedAt" = ${now}, "supersededByRunId" = ${runId}
     WHERE id = ANY(${sync.supersedeEstimateIds}::int[]) AND "projectId" = ${projectId} AND "deletedAt" IS NULL`;
  if (estUpdated !== sync.supersedeEstimateIds.length) throw new Error(`Dự toán đã đổi trong lúc import (${estUpdated}/${sync.supersedeEstimateIds.length} dòng) — tính lại rồi ghi lại.`);
  for (const e of sync.insert) {
    await tx.$executeRaw`
      INSERT INTO project_estimates ("projectId", "categoryId", "itemCode", "itemName", unit, qty, "unitPrice", "totalVnd", "materialGroupId", "remainingInvoiceOverrideVnd", "importRunId", "createdAt", "updatedAt")
      VALUES (${projectId}, ${e.categoryId}, ${e.itemCode}, ${e.itemName}, ${e.unit}, ${e.qty}, ${e.unitPrice}, ${e.totalVnd}, ${e.materialGroupId}, ${e.remainingInvoiceOverrideVnd}, ${runId}, ${now}, ${now})`;
  }

  // 2. Giao dịch HĐ cũ.
  const ptxIds = plan.replacement?.ids ?? [];
  const ptxUpdated = await tx.$executeRaw`
    UPDATE project_transactions SET "deletedAt" = ${now}, "supersededByRunId" = ${runId}
     WHERE id = ANY(${ptxIds}::int[]) AND "projectId" = ${projectId} AND "deletedAt" IS NULL`;
  if (ptxUpdated !== ptxIds.length) throw new Error(`Giao dịch cũ đã đổi trong lúc import (${ptxUpdated}/${ptxIds.length} dòng) — tính lại rồi ghi lại.`);

  // 3. Sổ (id trong inputs là số dòng của file → id thật).
  const cpId = new Map<number, number>();
  for (const c of inputs.counterparties) {
    cpId.set(c.id, await insertId(tx, Prisma.sql`
      INSERT INTO project_counterparties ("projectId", name, kind, "sortGroup", "sortOrder", "actualBasis", "actualManualVnd", "paymentSection", "importRunId", "createdAt", "updatedAt")
      VALUES (${projectId}, ${c.name}, ${c.kind}, ${c.sortGroup}, ${c.sortOrder}, ${c.actualBasis}, ${c.actualManualVnd}, ${c.paymentSection}, ${runId}, ${now}, ${now}) RETURNING id`));
  }
  const groupId = new Map<number, number>();
  for (const g of inputs.groupCodes) {
    groupId.set(g.id, await insertId(tx, Prisma.sql`
      INSERT INTO project_group_codes ("projectId", code, name, "counterpartyId", "isMainMaterial", "sortOrder", "importRunId", "createdAt", "updatedAt")
      VALUES (${projectId}, ${g.code}, ${g.name}, ${g.counterpartyId === null ? null : cpId.get(g.counterpartyId)}, ${g.isMainMaterial}, ${g.sortOrder}, ${runId}, ${now}, ${now}) RETURNING id`));
  }
  for (const l of inputs.counterpartySuppliers) {
    await tx.$executeRaw`
      INSERT INTO project_counterparty_suppliers ("projectId", "counterpartyId", "supplierId", "splitActualVnd", "paidOverrideVnd", "recoveredVnd", "todoNote", "importRunId", "createdAt", "updatedAt")
      VALUES (${projectId}, ${l.counterpartyId === null ? null : cpId.get(l.counterpartyId)}, ${l.supplierId}, ${l.splitActualVnd}, ${l.paidOverrideVnd}, ${l.recoveredVnd}, ${l.todoNote}, ${runId}, ${now}, ${now})`;
  }
  // Tên / ĐVT gốc của khóa (dòng đầu tiên của file có khóa đó) để màn Ánh xạ hiện đúng chữ.
  const display = new Map<string, { name: string; unit: string }>();
  for (const d of wb.dtLines) display.set(`dt|${dtLineKeyOf(d.name, d.unit, d.kind)}`, { name: d.name, unit: d.unit });
  for (const a of wb.aliases) {
    const k = `${a.source}|${itemKeyOf(a.name, a.unit)}`;
    if (!display.has(k)) display.set(k, { name: a.name, unit: a.unit });
  }
  for (const a of inputs.aliases) {
    const { name, unit } = display.get(`${a.source}|${a.itemKey}`) ?? { name: a.itemKey, unit: "" };
    await tx.$executeRaw`
      INSERT INTO project_item_aliases ("projectId", source, "itemKey", "itemName", unit, "groupCodeId", kind, "dtKey", factor, status, "importRunId", "createdAt", "updatedAt")
      VALUES (${projectId}, ${a.source}, ${a.itemKey}, ${name}, ${unit}, ${a.groupCodeId === null ? null : groupId.get(a.groupCodeId)}, ${a.kind}, ${a.dtKey}, ${a.factor}, ${a.status}, ${runId}, ${now}, ${now})`;
  }
  const lineId = new Map<number, number>();
  for (const [i, l] of inputs.invoiceLines.entries()) {
    const src = wb.invoices[i];
    lineId.set(l.id, await insertId(tx, Prisma.sql`
      INSERT INTO project_invoice_lines ("projectId", "supplierId", "invoiceNo", "invoiceDate", "invoiceDateText", "itemName", unit, "itemKey", qty, "unitPrice", "amountVnd", "vatPct", "vatVnd", "importRunId", "createdAt", "updatedAt")
      VALUES (${projectId}, ${l.supplierId}, ${l.invoiceNo}, ${l.invoiceDate}, ${src.dateText}, ${l.itemName}, ${l.unit}, ${l.itemKey}, ${l.qty}, ${src.unitPrice}, ${l.amountVnd}, ${src.vatPct}, ${l.vatVnd}, ${runId}, ${now}, ${now}) RETURNING id`));
  }
  for (const [i, r] of inputs.receipts.entries()) {
    const src = wb.receipts[i];
    await tx.$executeRaw`
      INSERT INTO project_actual_receipts ("projectId", date, "dateText", "itemName", unit, "itemKey", qty, "unitPrice", "amountVnd", "counterpartyId", "blockNo", note, "importRunId", "createdAt", "updatedAt")
      VALUES (${projectId}, ${src.date}, ${src.dateText}, ${src.itemName}, ${src.unit}, ${r.itemKey}, ${r.qty}, ${src.unitPrice}, ${r.amountVnd}, ${r.counterpartyId === null ? null : cpId.get(r.counterpartyId)}, ${src.blockNo}, ${src.note}, ${runId}, ${now}, ${now})`;
  }
  for (const [i, p] of inputs.payments.entries()) {
    const src = wb.payments[i];
    await tx.$executeRaw`
      INSERT INTO project_cash_payments ("projectId", date, "dateText", content, "bankVnd", "cashVnd", section, "counterpartyId", "supplierId", note, "importRunId", "createdAt", "updatedAt")
      VALUES (${projectId}, ${src.date}, ${src.dateText}, ${src.content}, ${p.bankVnd}, ${p.cashVnd}, ${p.section}, ${p.counterpartyId === null ? null : cpId.get(p.counterpartyId)}, ${p.supplierId}, ${src.note}, ${runId}, ${now}, ${now})`;
  }

  // 4. Giao dịch HĐ cho các tab cũ — gán vào dự toán ĐÃ đồng bộ.
  const codeOf = new Map(plan.categories.map((c) => [c.id, c.code]));
  const live = await tx.projectEstimate.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, categoryId: true, itemCode: true, itemName: true, unit: true, qty: true, totalVnd: true },
  });
  const primaryOf = new Map([...groupEstimatesByKey(live.map((e) => ({ ...e, categoryCode: codeOf.get(e.categoryId) ?? "" }))).values()].map((l) => [l.key, l.primary]));
  const derived = deriveTransactions(inputs.invoiceLines, buildBookIndex(inputs), primaryOf, plan.categories);
  for (const d of derived) {
    await tx.$executeRaw`
      INSERT INTO project_transactions ("projectId", date, "transactionType", "categoryId", "itemCode", "itemName", "partyName", qty, unit, "unitPriceHd", "amountHd", "invoiceNo", status, note, "sourceInvoiceLineId", "importRunId", "createdAt", "updatedAt")
      VALUES (${projectId}, ${d.date ?? now}, ${d.transactionType}, ${d.categoryId}, ${d.itemCode}, ${d.itemName}, ${d.partyName}, ${d.qty}, ${d.unit}, ${d.unitPriceHd}, ${d.amountHd}, ${d.invoiceNo}, 'approved', 'Sinh từ sổ Hóa đơn (Đối chiếu DT-HĐ-TT)', ${lineId.get(d.sourceInvoiceLineId)}, ${runId}, ${now}, ${now})`;
  }

  const rowsImported = inputs.counterparties.length + inputs.groupCodes.length + inputs.counterpartySuppliers.length + inputs.aliases.length
    + inputs.invoiceLines.length + inputs.receipts.length + inputs.payments.length + derived.length + sync.insert.length;
  return {
    rowsTotal: rowsImported, rowsImported, rowsSkipped: 0, errors: [],
    expected: {
      projectId,
      superseded: {
        transactions: { ids: ptxIds, sum: plan.replacement?.sum ?? "0.00" },
        estimates: { ids: sync.supersedeEstimateIds, sum: new Prisma.Decimal(estSum[0]?.s ?? 0).toFixed(2) },
      },
      counts: {
        estimatesInserted: sync.insert.length, estimatesSuperseded: sync.supersedeEstimateIds.length, transactionsSuperseded: ptxIds.length,
        invoiceLines: inputs.invoiceLines.length, receipts: inputs.receipts.length, payments: inputs.payments.length, derivedTransactions: derived.length,
      },
    },
  };
}
