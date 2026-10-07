/**
 * LedgerService — engine shared by material (Phase 5) and labor (Phase 6) ledgers.
 * Plain TypeScript class — no "use server" here; wrappers add that.
 * All monetary arithmetic via Prisma.Decimal; never JS float.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  LedgerType,
  LedgerTransactionInput,
  LedgerTransactionFilter,
  SummaryRow,
  MonthlyByPartyRow,
  CurrentBalance,
  MatrixRow,
  OpeningBalanceInput,
} from "./ledger-types";
import {
  querySummary,
  queryMonthlyByParty,
  queryWindowByParty,
  queryCurrentBalance,
  queryDebtMatrix,
} from "./ledger-aggregations";
import { assertPeriodOpen, lockSuppliers } from "@/lib/vat-tu-ncc/period-lock";
import { AUTO_GENERATED_GUARD, isPeriodLockedType } from "./transaction-classification";
import { toBusinessDateFromInput } from "./business-date";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Client ghi sổ cái: `prisma` gốc hoặc client transaction. Cần `$executeRaw` để lấy khoá
 * advisory theo NCC và `supplierReconciliation` để kiểm khoá kỳ trong cùng transaction.
 */
export type LedgerWriteClient = Pick<
  typeof prisma,
  "ledgerTransaction" | "ledgerOpeningBalance" | "supplierReconciliation" | "$executeRaw"
>;

/** Compute vat + total from amount + vatPct */
function computeTotals(amount: Prisma.Decimal, vatPct: Prisma.Decimal) {
  const vat = amount.times(vatPct);
  const total = amount.plus(vat);
  return { vat, total };
}

export class LedgerService {
  constructor(private ledgerType: LedgerType) {}

  /**
   * Sổ vật tư: kỳ NCC đã ký đối chiếu là bất biến — chặn ghi các loại trong
   * PERIOD_LOCKED_TYPES có ngày rơi vào kỳ đã ký (dieu_chinh kỳ sau là lối ra duy nhất).
   */
  private async assertMaterialPeriodOpen(
    transactionType: string,
    partyId: number,
    date: Date,
    client: LedgerWriteClient,
  ) {
    if (this.ledgerType !== "material") return;
    if (!isPeriodLockedType(transactionType)) return;
    await assertPeriodOpen(partyId, date, client);
  }

  /**
   * Sổ vật tư: mọi ghi chạy trong transaction để khoá NCC + kiểm khoá kỳ + ghi là nguyên tử.
   * Caller truyền `prisma` gốc → tự bọc `prisma.$transaction`; caller truyền client transaction
   * → chạy trên client đó (khoá xact giữ tới khi transaction của caller kết thúc).
   * Sổ nhân công giữ nguyên hành vi cũ (không transaction, không khoá).
   */
  private inMaterialTx<T>(client: LedgerWriteClient, fn: (c: LedgerWriteClient) => Promise<T>): Promise<T> {
    if (this.ledgerType !== "material" || client !== prisma) return fn(client);
    return prisma.$transaction((tx) => fn(tx));
  }

  /** Khoá advisory theo NCC (chỉ sổ vật tư); tái nhập được trong cùng transaction. */
  private async lockParties(client: LedgerWriteClient, partyIds: number[]) {
    if (this.ledgerType !== "material") return;
    await lockSuppliers(client, partyIds);
  }

  /**
   * Số dư ban đầu của NCC trở thành chỉ-đọc khi NCC đã có bất kỳ kỳ đối chiếu nào được ký:
   * số dư ban đầu là gốc của mọi số đầu kỳ nên sửa sau khi ký sẽ làm lệch kỳ đã đông cứng.
   */
  async assertSupplierOpeningEditable(
    partyId: number,
    client: Pick<typeof prisma, "supplierReconciliation"> = prisma,
  ) {
    if (this.ledgerType !== "material") return;
    const signed = await client.supplierReconciliation.findFirst({
      where: { supplierId: partyId, signedBySupplier: true, deletedAt: null },
      select: { id: true },
    });
    if (signed) {
      throw new Error("NCC đã có kỳ đối chiếu được ký — số dư ban đầu không thể sửa/xoá. Dùng bút toán điều chỉnh.");
    }
  }

  async list(filter: LedgerTransactionFilter = {}) {
    const { entityId, partyId, projectId, dateFrom, dateTo, transactionType, transactionTypes, page = 1, pageSize = 50 } = filter;
    const where: Prisma.LedgerTransactionWhereInput = {
      ledgerType: this.ledgerType,
      deletedAt: null,
      ...(entityId ? { entityId } : {}),
      ...(partyId ? { partyId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(transactionType ? { transactionType } : {}),
      ...(transactionTypes && transactionTypes.length > 0 ? { transactionType: { in: [...transactionTypes] } } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: toBusinessDateFromInput(dateFrom) } : {}),
              // Cận trên loại trừ (< to + 1 ngày) để dòng trong ngày `to` luôn được tính.
              ...(dateTo ? { lt: new Date(toBusinessDateFromInput(dateTo).getTime() + DAY_MS) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.ledgerTransaction.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ledgerTransaction.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async create(input: LedgerTransactionInput, client: LedgerWriteClient = prisma) {
    return this.inMaterialTx(client, async (c) => {
      await this.lockParties(c, [input.partyId]);
      await this.assertMaterialPeriodOpen(input.transactionType, input.partyId, toBusinessDateFromInput(input.date), c);
      return this.createRow(input, c);
    });
  }

  private createRow(input: LedgerTransactionInput, client: LedgerWriteClient) {
    const amountTt = new Prisma.Decimal(input.amountTt);
    const vatPctTt = new Prisma.Decimal(input.vatPctTt ?? "0");
    const { vat: vatTt, total: totalTt } = computeTotals(amountTt, vatPctTt);

    const amountHd = new Prisma.Decimal(input.amountHd);
    const vatPctHd = new Prisma.Decimal(input.vatPctHd ?? "0");
    const { vat: vatHd, total: totalHd } = computeTotals(amountHd, vatPctHd);

    return client.ledgerTransaction.create({
      data: {
        ledgerType: this.ledgerType,
        date: toBusinessDateFromInput(input.date),
        transactionType: input.transactionType,
        entityId: input.entityId,
        partyId: input.partyId,
        projectId: input.projectId ?? null,
        itemId: input.itemId ?? null,
        amountTt,
        vatPctTt,
        vatTt,
        totalTt,
        amountHd,
        vatPctHd,
        vatHd,
        totalHd,
        invoiceNo: input.invoiceNo ?? null,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
        content: input.content ?? null,
        status: input.status ?? "pending",
        note: input.note ?? null,
      },
    });
  }

  async update(id: number, input: LedgerTransactionInput, client: LedgerWriteClient = prisma) {
    return this.inMaterialTx(client, async (c) => {
      const before = await c.ledgerTransaction.findUnique({ where: { id }, select: { partyId: true } });
      await this.lockParties(c, before ? [before.partyId, input.partyId] : [input.partyId]);
      // Đọc lại sau khi giữ khoá: trạng thái được kiểm là trạng thái sẽ bị ghi đè.
      const current = await c.ledgerTransaction.findUnique({
        where: { id },
        select: { transactionType: true, partyId: true, date: true, paymentRoundItemId: true, deliveryId: true },
      });
      if (current) {
        await this.lockParties(c, [current.partyId]); // no-op nếu NCC không đổi giữa hai lần đọc
        AUTO_GENERATED_GUARD.assertManualEditable(current);
        // Chặn cả trạng thái cũ lẫn mới — không cho kéo sự kiện ra/vào kỳ đã ký
        await this.assertMaterialPeriodOpen(current.transactionType, current.partyId, current.date, c);
      }
      await this.assertMaterialPeriodOpen(input.transactionType, input.partyId, toBusinessDateFromInput(input.date), c);
      return this.updateRow(id, input, c);
    });
  }

  private updateRow(id: number, input: LedgerTransactionInput, client: LedgerWriteClient) {
    const amountTt = new Prisma.Decimal(input.amountTt);
    const vatPctTt = new Prisma.Decimal(input.vatPctTt ?? "0");
    const { vat: vatTt, total: totalTt } = computeTotals(amountTt, vatPctTt);

    const amountHd = new Prisma.Decimal(input.amountHd);
    const vatPctHd = new Prisma.Decimal(input.vatPctHd ?? "0");
    const { vat: vatHd, total: totalHd } = computeTotals(amountHd, vatPctHd);

    return client.ledgerTransaction.update({
      where: { id },
      data: {
        date: toBusinessDateFromInput(input.date),
        transactionType: input.transactionType,
        entityId: input.entityId,
        partyId: input.partyId,
        projectId: input.projectId ?? null,
        itemId: input.itemId ?? null,
        amountTt,
        vatPctTt,
        vatTt,
        totalTt,
        amountHd,
        vatPctHd,
        vatHd,
        totalHd,
        invoiceNo: input.invoiceNo ?? null,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
        content: input.content ?? null,
        status: input.status ?? "pending",
        note: input.note ?? null,
      },
    });
  }

  async softDelete(id: number, client: LedgerWriteClient = prisma) {
    await this.inMaterialTx(client, async (c) => {
      const select = { transactionType: true, partyId: true, date: true, paymentRoundItemId: true, deliveryId: true } as const;
      let current = await c.ledgerTransaction.findUnique({ where: { id }, select });
      if (current && this.ledgerType === "material") {
        await this.lockParties(c, [current.partyId]);
        // Đọc lại dưới khoá; khoá thêm nếu NCC vừa bị đổi (tái nhập nếu không đổi).
        current = await c.ledgerTransaction.findUnique({ where: { id }, select });
        if (current) await this.lockParties(c, [current.partyId]);
      }
      if (current) {
        AUTO_GENERATED_GUARD.assertManualEditable(current);
        await this.assertMaterialPeriodOpen(current.transactionType, current.partyId, current.date, c);
      }
      await c.ledgerTransaction.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  /**
   * Sinh/đồng bộ sự kiện lay_hang từ một phiếu vật tư ngày (chốt kỳ NCC).
   * Idempotent theo deliveryId: 1 phiếu ↔ tối đa 1 event. Chạy lại chốt kỳ chỉ
   * cập nhật giá/tiền của event đã có (kể cả event từng bị xóa mềm — revive).
   * Giá thực tế (TT), VAT = 0; cột HĐ để 0 (bảng đối chiếu NCC không dùng HĐ).
   */
  async upsertFromDelivery(
    input: {
      deliveryId: number;
      date: Date;
      entityId: number;
      partyId: number;
      projectId: number | null;
      itemId: number | null;
      qty: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      content?: string | null;
    },
    client: LedgerWriteClient = prisma
  ) {
    return this.inMaterialTx(client, async (c) => {
      await this.lockParties(c, [input.partyId]);
      await this.assertMaterialPeriodOpen("lay_hang", input.partyId, input.date, c);
      return this.upsertDeliveryRow(input, c);
    });
  }

  private async upsertDeliveryRow(
    input: Parameters<LedgerService["upsertFromDelivery"]>[0],
    client: LedgerWriteClient,
  ) {
    const amountTt = input.qty.times(input.unitPrice);
    const zero = new Prisma.Decimal(0);
    const data = {
      ledgerType: this.ledgerType,
      date: input.date,
      transactionType: "lay_hang" as const,
      entityId: input.entityId,
      partyId: input.partyId,
      projectId: input.projectId,
      itemId: input.itemId,
      amountTt,
      vatPctTt: zero,
      vatTt: zero,
      totalTt: amountTt,
      amountHd: zero,
      vatPctHd: zero,
      vatHd: zero,
      totalHd: zero,
      qty: input.qty,
      unitPriceSnapshot: input.unitPrice,
      content: input.content ?? null,
      status: "approved",
      deletedAt: null,
    };

    const existing = await client.ledgerTransaction.findFirst({
      where: { deliveryId: input.deliveryId },
      select: { id: true, date: true, partyId: true, deletedAt: true },
    });
    if (existing) {
      // Ghi đè event sống sẽ dời/đổi số của một dòng có thể đang nằm trong kỳ đã ký → kiểm cả
      // ngày + NCC CŨ của event (không chỉ ngày mới). Event đã xoá mềm không nằm trong snapshot
      // nào nên không chặn (revive về ngày mới đã được kiểm ở caller).
      if (!existing.deletedAt) {
        await this.lockParties(client, [existing.partyId]);
        await this.assertMaterialPeriodOpen("lay_hang", existing.partyId, existing.date, client);
      }
      return client.ledgerTransaction.update({ where: { id: existing.id }, data });
    }
    return client.ledgerTransaction.create({ data: { ...data, deliveryId: input.deliveryId } });
  }

  async summary(filter: { entityId?: number; partyId?: number; projectId?: number } = {}): Promise<SummaryRow[]> {
    return querySummary(this.ledgerType, filter);
  }

  async monthlyByParty(
    year: number,
    month: number,
    entityId: number
  ): Promise<Omit<MonthlyByPartyRow, "partyName">[]> {
    return queryMonthlyByParty(this.ledgerType, year, month, entityId);
  }

  /** Báo cáo theo NCC trên cửa sổ `[from, to]` (null = không giới hạn). */
  async windowByParty(
    window: { from: Date | null; to: Date | null },
    entityId: number
  ): Promise<Omit<MonthlyByPartyRow, "partyName">[]> {
    return queryWindowByParty(this.ledgerType, { ...window, entityId });
  }

  async firstEntityWithActivity(year: number, month: number): Promise<number | null> {
    const r = await prisma.$queryRaw<{ entityId: number }[]>`
      SELECT "entityId" FROM ledger_transactions
      WHERE "ledgerType" = ${this.ledgerType}
        AND "deletedAt" IS NULL
        AND EXTRACT(YEAR FROM date) = ${year}
        AND EXTRACT(MONTH FROM date) = ${month}
      GROUP BY "entityId"
      ORDER BY MIN(date) ASC
      LIMIT 1
    `;
    if (r[0]) return Number(r[0].entityId);
    const ob = await prisma.ledgerOpeningBalance.findFirst({
      where: { ledgerType: this.ledgerType },
      orderBy: { entityId: "asc" },
      select: { entityId: true },
    });
    return ob?.entityId ?? null;
  }

  async currentBalance(
    entityId: number,
    partyId: number,
    projectId?: number | null,
    asOf?: Date
  ): Promise<CurrentBalance> {
    return queryCurrentBalance(this.ledgerType, entityId, partyId, projectId, asOf);
  }

  async detailedDebtMatrix(
    filter: { entityIds?: number[]; partyIds?: number[]; from?: Date | null; to?: Date | null } = {}
  ): Promise<MatrixRow[]> {
    return queryDebtMatrix(this.ledgerType, filter);
  }

  // ── Opening Balance ────────────────────────────────────────────────────────

  async listOpeningBalances(filter: { entityId?: number; partyId?: number } = {}) {
    return prisma.ledgerOpeningBalance.findMany({
      where: {
        ledgerType: this.ledgerType,
        ...(filter.entityId ? { entityId: filter.entityId } : {}),
        ...(filter.partyId ? { partyId: filter.partyId } : {}),
      },
      orderBy: [{ entityId: "asc" }, { partyId: "asc" }],
    });
  }

  async setOpeningBalance(input: OpeningBalanceInput, client: LedgerWriteClient = prisma) {
    return this.inMaterialTx(client, async (c) => {
      await this.lockParties(c, [input.partyId]);
      await this.assertSupplierOpeningEditable(input.partyId, c);
      return this.setOpeningRow(input, c);
    });
  }

  private async setOpeningRow(input: OpeningBalanceInput, client: LedgerWriteClient) {
    // No soft-delete on opening balances — use native update or create
    const existing = await client.ledgerOpeningBalance.findFirst({
      where: {
        ledgerType: this.ledgerType,
        entityId: input.entityId,
        partyId: input.partyId,
        projectId: input.projectId ?? null,
      },
    });

    const data = {
      balanceTt: new Prisma.Decimal(input.balanceTt),
      balanceHd: new Prisma.Decimal(input.balanceHd),
      asOfDate: new Date(input.asOfDate),
      note: input.note ?? null,
    };

    if (existing) {
      return client.ledgerOpeningBalance.update({ where: { id: existing.id }, data });
    }

    return client.ledgerOpeningBalance.create({
      data: {
        ledgerType: this.ledgerType,
        entityId: input.entityId,
        partyId: input.partyId,
        projectId: input.projectId ?? null,
        ...data,
      },
    });
  }

  async deleteOpeningBalance(id: number, client: LedgerWriteClient = prisma) {
    await this.inMaterialTx(client, async (c) => {
      const current = await c.ledgerOpeningBalance.findUnique({ where: { id }, select: { partyId: true } });
      if (current) {
        await this.lockParties(c, [current.partyId]);
        await this.assertSupplierOpeningEditable(current.partyId, c);
      }
      try {
        await c.ledgerOpeningBalance.delete({ where: { id } });
      } catch (e) {
        if ((e as { code?: string })?.code !== "P2025") throw e;
      }
    });
  }
}
