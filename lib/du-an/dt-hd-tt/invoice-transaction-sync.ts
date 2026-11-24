/**
 * Giữ giao dịch HĐ của các tab cũ (Cân đối VT, Định mức, Công nợ, Giao dịch) khớp sổ Hóa đơn sau mỗi
 * lần nhập tay: với từng dòng hóa đơn bị đụng tới, tính lại giao dịch sinh ra qua `deriveTransactions`
 * (cùng quy tắc với import) rồi
 *   - dòng còn sống, đã có giao dịch → cập nhật tại chỗ (giữ id, giữ importRunId);
 *   - dòng còn sống, chưa có → tạo mới;
 *   - dòng đã xóa mềm → xóa mềm giao dịch của nó.
 * Chạy trong CÙNG transaction với lần ghi hóa đơn, sau `lockProjectDtHdTt`. Ghi từng dòng qua
 * create / update có audit (không updateMany / upsert).
 */

import { buildBookIndex } from "./book-index";
import { deriveTransactions, type DerivedTransaction, type DtLinePrimary } from "./derive-transactions";
import { groupEstimatesByKey, kindOfCategoryCode } from "./keys";
import { DEFAULT_RATES, type AliasIn, type InvoiceLineIn, type ReportInputs } from "./report-inputs";
import type { prisma } from "@/lib/prisma";

export type InvoiceSyncClient = Pick<
  typeof prisma,
  "projectInvoiceLine" | "projectTransaction" | "projectItemAlias" | "projectEstimate" | "projectCategory" | "supplier"
>;

/** Ghi chú của giao dịch sinh từ sổ Hóa đơn (giống import). */
const DERIVED_NOTE = "Sinh từ sổ Hóa đơn (Đối chiếu DT-HĐ-TT)";

export interface InvoiceSyncResult {
  created: number;
  updated: number;
  removed: number;
}

const num = (v: { toNumber(): number }) => v.toNumber();

/** Chỉ mục tối thiểu để đặt dòng hóa đơn: dòng dự toán, alias dt / hd, tên NCC. */
async function loadPlacement(tx: InvoiceSyncClient, projectId: number, supplierIds: number[]) {
  const live = { projectId, deletedAt: null };
  const [categories, estimates, aliases, suppliers] = await Promise.all([
    tx.projectCategory.findMany({ where: live, select: { id: true, code: true }, orderBy: { id: "asc" } }),
    tx.projectEstimate.findMany({ where: live, select: { id: true, categoryId: true, itemCode: true, itemName: true, unit: true, qty: true, totalVnd: true } }),
    tx.projectItemAlias.findMany({ where: { ...live, source: { in: ["dt", "hd"] } } }),
    tx.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } }),
  ]);
  const codeOf = new Map(categories.map((c) => [c.id, c.code]));
  const dtLines = [...groupEstimatesByKey(estimates.map((e) => ({ ...e, categoryCode: codeOf.get(e.categoryId) ?? "" }))).values()];
  const inputs: ReportInputs = {
    settings: DEFAULT_RATES, dtLines, dtWithoutKindValue: 0, groupCodes: [], counterparties: [], counterpartySuppliers: [],
    suppliers, invoiceLines: [], receipts: [], payments: [],
    aliases: aliases.map((a) => ({
      source: a.source as AliasIn["source"], itemKey: a.itemKey, groupCodeId: a.groupCodeId, kind: a.kind as AliasIn["kind"],
      dtKey: a.dtKey, factor: a.factor === null ? null : num(a.factor), status: a.status as AliasIn["status"],
    })),
  };
  const primaryOf = new Map<string, DtLinePrimary>(dtLines.map((l) => [l.key, { categoryId: l.primary.categoryId, itemCode: l.primary.itemCode }]));
  return { index: buildBookIndex(inputs), primaryOf, categories };
}

/**
 * Kiểm TRƯỚC khi ghi dòng hóa đơn (để lần từ chối không để lại dòng audit "create" mồ côi — audit ghi
 * ngoài transaction): công trình phải có hạng mục VL / NC / MTC để đặt giao dịch HĐ, như `deriveTransactions`.
 */
export async function assertInvoiceCategories(tx: Pick<typeof prisma, "projectCategory">, projectId: number): Promise<void> {
  const categories = await tx.projectCategory.findMany({ where: { projectId, deletedAt: null }, select: { code: true } });
  if (!categories.some((c) => kindOfCategoryCode(c.code) !== null)) {
    throw new Error("Công trình chưa có hạng mục VL / NC / MTC nào để ghi giao dịch HĐ cho các tab cũ — tạo hạng mục trước.");
  }
}

/**
 * Chặn cộng hai lần ở các tab cũ: công trình còn giao dịch HĐ cũ (nhập ở tab Giao dịch hoặc từ import
 * "Bảng cân đối vật tư") chưa bị sổ Hóa đơn thay thì không thêm hóa đơn tay — import sổ trước để thay
 * đúng các dòng đó (dòng nhập tay trước cũng làm import sổ bị chặn vĩnh viễn).
 */
export async function assertNoLegacyInvoiceTransactions(tx: Pick<typeof prisma, "projectTransaction">, projectId: number): Promise<void> {
  const legacy = await tx.projectTransaction.count({
    where: { projectId, deletedAt: null, supersededByRunId: null, sourceInvoiceLineId: null, amountHd: { not: 0 } },
  });
  if (legacy > 0) {
    throw new Error(
      `Công trình còn ${legacy} giao dịch HĐ cũ (tab Giao dịch / import "Bảng cân đối vật tư") chưa được sổ Hóa đơn thay. ` +
        `Import file "Cân đối vật tư" vào Đối chiếu DT-HĐ-TT trước để thay các dòng này, rồi mới nhập hóa đơn tay — nếu không, tiền HĐ ở các tab cũ bị cộng hai lần.`,
    );
  }
}

function transactionFields(d: DerivedTransaction) {
  return {
    transactionType: d.transactionType, categoryId: d.categoryId, itemCode: d.itemCode, itemName: d.itemName, partyName: d.partyName,
    qty: d.qty, qtyHd: null, unit: d.unit, unitPriceHd: d.unitPriceHd, unitPriceTt: 0, amountHd: d.amountHd, amountTt: 0,
    invoiceNo: d.invoiceNo, status: "approved", note: DERIVED_NOTE,
  };
}

export async function syncDerivedTransactions(tx: InvoiceSyncClient, projectId: number, lineIds: readonly number[]): Promise<InvoiceSyncResult> {
  const result: InvoiceSyncResult = { created: 0, updated: 0, removed: 0 };
  const ids = [...new Set(lineIds)];
  if (ids.length === 0) return result;

  const [lines, existing] = await Promise.all([
    tx.projectInvoiceLine.findMany({ where: { projectId, id: { in: ids } } }),
    tx.projectTransaction.findMany({
      where: { projectId, sourceInvoiceLineId: { in: ids }, deletedAt: null },
      select: { id: true, sourceInvoiceLineId: true },
      orderBy: { id: "asc" },
    }),
  ]);
  if (lines.length !== ids.length) throw new Error("Có dòng hóa đơn không thuộc công trình này");

  const liveLines: InvoiceLineIn[] = lines
    .filter((l) => l.deletedAt === null)
    .map((l) => ({
      id: l.id, supplierId: l.supplierId, invoiceNo: l.invoiceNo, invoiceDate: l.invoiceDate, itemName: l.itemName, unit: l.unit,
      itemKey: l.itemKey, qty: l.qty === null ? null : num(l.qty), amountVnd: num(l.amountVnd), vatVnd: num(l.vatVnd),
    }));
  const derived = new Map<number, DerivedTransaction>();
  if (liveLines.length > 0) {
    const { index, primaryOf, categories } = await loadPlacement(tx, projectId, [...new Set(liveLines.map((l) => l.supplierId))]);
    for (const d of deriveTransactions(liveLines, index, primaryOf, categories)) derived.set(d.sourceInvoiceLineId, d);
  }

  const byLine = new Map<number, number[]>();
  for (const t of existing) byLine.set(t.sourceInvoiceLineId!, [...(byLine.get(t.sourceInvoiceLineId!) ?? []), t.id]);

  // Dòng chưa có ngày: giao dịch lấy lúc dòng vào sổ — import dùng lúc commit (= createdAt của dòng
  // import), nên hai đường cho cùng ngày; xóa ngày ở dòng đã có ngày cũng đưa giao dịch về ngày đó.
  const enteredAt = new Map(lines.map((l) => [l.id, l.createdAt]));
  const now = new Date();
  for (const lineId of ids) {
    const d = derived.get(lineId);
    const date = d?.date ?? enteredAt.get(lineId) ?? now;
    const current = byLine.get(lineId) ?? [];
    const [keep, ...extra] = current;
    // Dòng đã xóa mềm → bỏ mọi giao dịch của nó; dòng sống chỉ giữ một giao dịch.
    for (const txId of d ? extra : current) {
      await tx.projectTransaction.update({ where: { id: txId }, data: { deletedAt: now, updatedAt: now } });
      result.removed++;
    }
    if (!d) continue;
    if (keep !== undefined) {
      await tx.projectTransaction.update({
        where: { id: keep },
        data: { ...transactionFields(d), date, updatedAt: now },
      });
      result.updated++;
    } else {
      await tx.projectTransaction.create({
        data: { projectId, date, ...transactionFields(d), sourceInvoiceLineId: lineId, createdAt: now, updatedAt: now },
      });
      result.created++;
    }
  }
  return result;
}
