/**
 * LedgerService — engine shared by material (Phase 5) and labor (Phase 6) ledgers.
 * Plain TypeScript class — no "use server" here; wrappers add that.
 * All monetary arithmetic via Prisma.Decimal; never JS float.
 *
 * Sổ vật tư theo cặp NCC × công trình: mọi ghi bắt buộc `projectId`, Chủ thể (`entityId`)
 * luôn suy từ `Project.entityId` (giá trị client gửi bị thay), và kiểm khoá kỳ của cặp + guard
 * mốc chuyển đổi toàn cục dưới khoá NCC. Sổ nhân công giữ nguyên hành vi.
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
import { assertMaterialTypeWritable, assertPairOpeningEditable, lockSuppliers } from "@/lib/vat-tu-ncc/period-lock";
import {
  assertAfterMaterialCutover,
  requireProjectId,
  resolveMaterialEntityId,
  type MaterialWriteGuardOptions,
} from "@/lib/vat-tu-ncc/pair-scope";
import { ensureMonthlyPeriodFor } from "@/lib/vat-tu-ncc/auto-monthly-period";
import { AUTO_GENERATED_GUARD } from "./transaction-classification";
import { toBusinessDateFromInput } from "./business-date";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Client ghi sổ cái: `prisma` gốc hoặc client transaction. Cần `$executeRaw` để lấy khoá
 * advisory theo NCC, `supplierReconciliation` + `$queryRaw` để kiểm khoá kỳ / mốc chuyển đổi
 * và `project` / `$queryRaw` để suy Chủ thể (đọc công trình FOR SHARE) — tất cả trong cùng transaction.
 * `supplierDeliveryDaily`: tự tạo kỳ tháng thì ghi luôn phiếu chờ của tháng đó (auto-monthly-period.ts).
 */
export type LedgerWriteClient = Pick<
  typeof prisma,
  | "ledgerTransaction"
  | "ledgerOpeningBalance"
  | "supplierReconciliation"
  | "supplierDeliveryDaily"
  | "project"
  | "$queryRaw"
  | "$executeRaw"
>;

/** Đầu vào sinh event lay_hang từ phiếu ngày (chốt kỳ). Chủ thể suy từ công trình. */
export interface DeliveryEventInput {
  deliveryId: number;
  date: Date;
  partyId: number;
  projectId: number;
  itemId: number | null;
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  content?: string | null;
}

/** Compute vat + total from amount + vatPct */
function computeTotals(amount: Prisma.Decimal, vatPct: Prisma.Decimal) {
  const vat = amount.times(vatPct);
  const total = amount.plus(vat);
  return { vat, total };
}

export class LedgerService {
  /**
   * `materialGuard.cutoverImportRunId`: chỉ adapter import chuyển đổi truyền (bằng id của chính
   * run đang commit) để ghi của run không đi qua guard mốc chuyển đổi.
   */
  constructor(
    private ledgerType: LedgerType,
    private readonly materialGuard?: MaterialWriteGuardOptions,
  ) {}

  /**
   * Sổ vật tư: kỳ đã ký của cặp (NCC, công trình) là bất biến — chặn ghi các loại trong
   * PERIOD_LOCKED_TYPES có ngày rơi vào kỳ đã ký (dieu_chinh kỳ sau là lối ra duy nhất); mọi
   * loại (kể cả dieu_chinh) phải mang ngày sau mốc chuyển đổi.
   */
  private async assertMaterialPeriodOpen(
    transactionType: string,
    partyId: number,
    projectId: number | null | undefined,
    date: Date,
    client: LedgerWriteClient,
  ) {
    if (this.ledgerType !== "material") return;
    await assertMaterialTypeWritable(transactionType, partyId, requireProjectId(projectId), date, client, this.materialGuard);
  }

  /**
   * Sổ vật tư: phát sinh sau mốc rơi vào tháng chưa có kỳ của cặp → tự tạo kỳ tháng (chưa ký) và ghi
   * phiếu chờ của tháng đó (auto-monthly-period.ts). Run import chuyển đổi không tự tạo kỳ.
   */
  private async ensureMaterialMonth(partyId: number, projectId: number | null | undefined, date: Date, client: LedgerWriteClient) {
    if (this.ledgerType !== "material" || this.materialGuard?.cutoverImportRunId !== undefined) return;
    await ensureMonthlyPeriodFor(client, partyId, requireProjectId(projectId), date, (input) =>
      this.upsertFromDelivery(input, client),
    );
  }

  /**
   * Sổ vật tư: bắt buộc công trình và thay `entityId` bằng Chủ thể của công trình (bất biến I2).
   * Sổ nhân công trả nguyên đầu vào.
   */
  private async scopeMaterialInput<T extends { entityId: number; projectId?: number | null }>(
    input: T,
    client: LedgerWriteClient,
  ): Promise<T> {
    if (this.ledgerType !== "material") return input;
    const projectId = requireProjectId(input.projectId);
    const entityId = await resolveMaterialEntityId(client, projectId);
    return { ...input, projectId, entityId };
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
   * Số dư ban đầu vật tư của cặp (NCC, công trình) sửa/xoá được khi: cặp chưa có kỳ đối chiếu
   * nào được ký (assertPairOpeningEditable) và ngày số dư sau mốc chuyển đổi. Sổ nhân công: không kiểm.
   * Một hàm dùng chung cho mọi đường ghi số dư vật tư (set, xoá, patch/bulk của cong-no-vt).
   */
  async assertOpeningEditable(
    partyId: number,
    projectId: number | null | undefined,
    asOfDate: Date,
    client: Pick<typeof prisma, "supplierReconciliation" | "$queryRaw">,
  ) {
    if (this.ledgerType !== "material") return;
    await assertPairOpeningEditable(partyId, requireProjectId(projectId), client);
    await assertAfterMaterialCutover(asOfDate, client, this.materialGuard);
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
      const scoped = await this.scopeMaterialInput(input, c);
      await this.assertMaterialPeriodOpen(
        scoped.transactionType,
        scoped.partyId,
        scoped.projectId,
        toBusinessDateFromInput(scoped.date),
        c,
      );
      await this.ensureMaterialMonth(scoped.partyId, scoped.projectId, toBusinessDateFromInput(scoped.date), c);
      return this.createRow(scoped, c);
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
        select: {
          transactionType: true,
          partyId: true,
          projectId: true,
          date: true,
          paymentRoundItemId: true,
          deliveryId: true,
        },
      });
      if (current) {
        await this.lockParties(c, [current.partyId]); // no-op nếu NCC không đổi giữa hai lần đọc
        AUTO_GENERATED_GUARD.assertManualEditable(current);
        // Chặn cả trạng thái cũ lẫn mới — không cho kéo sự kiện ra/vào kỳ đã ký của cặp nào
        await this.assertMaterialPeriodOpen(current.transactionType, current.partyId, current.projectId, current.date, c);
      }
      const scoped = await this.scopeMaterialInput(input, c);
      await this.assertMaterialPeriodOpen(
        scoped.transactionType,
        scoped.partyId,
        scoped.projectId,
        toBusinessDateFromInput(scoped.date),
        c,
      );
      await this.ensureMaterialMonth(scoped.partyId, scoped.projectId, toBusinessDateFromInput(scoped.date), c);
      return this.updateRow(id, scoped, c);
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
      const select = {
        transactionType: true,
        partyId: true,
        projectId: true,
        date: true,
        paymentRoundItemId: true,
        deliveryId: true,
      } as const;
      let current = await c.ledgerTransaction.findUnique({ where: { id }, select });
      if (current && this.ledgerType === "material") {
        await this.lockParties(c, [current.partyId]);
        // Đọc lại dưới khoá; khoá thêm nếu NCC vừa bị đổi (tái nhập nếu không đổi).
        current = await c.ledgerTransaction.findUnique({ where: { id }, select });
        if (current) await this.lockParties(c, [current.partyId]);
      }
      if (current) {
        AUTO_GENERATED_GUARD.assertManualEditable(current);
        await this.assertMaterialPeriodOpen(current.transactionType, current.partyId, current.projectId, current.date, c);
      }
      await c.ledgerTransaction.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  /**
   * Sinh/đồng bộ sự kiện lay_hang từ một phiếu vật tư ngày (chốt kỳ của cặp NCC × công trình).
   * Idempotent theo deliveryId: 1 phiếu ↔ tối đa 1 event. Chạy lại chốt kỳ chỉ
   * cập nhật giá/tiền của event đã có (kể cả event từng bị xóa mềm — revive).
   * Giá thực tế (TT), VAT = 0; cột HĐ để 0 (bảng đối chiếu NCC không dùng HĐ).
   * Chủ thể của event suy từ công trình. Chỉ dành cho sổ vật tư.
   */
  async upsertFromDelivery(input: DeliveryEventInput, client: LedgerWriteClient = prisma) {
    if (this.ledgerType !== "material") throw new Error("Sự kiện từ phiếu vật tư ngày chỉ ghi vào sổ vật tư");
    return this.inMaterialTx(client, async (c) => {
      await this.lockParties(c, [input.partyId]);
      const projectId = requireProjectId(input.projectId, `Phiếu #${input.deliveryId}`);
      const entityId = await resolveMaterialEntityId(c, projectId);
      await this.assertMaterialPeriodOpen("lay_hang", input.partyId, projectId, input.date, c);
      return this.upsertDeliveryRow({ ...input, projectId }, entityId, c);
    });
  }

  private async upsertDeliveryRow(
    input: DeliveryEventInput,
    entityId: number,
    client: LedgerWriteClient,
  ) {
    const amountTt = input.qty.times(input.unitPrice);
    const zero = new Prisma.Decimal(0);
    const data = {
      ledgerType: this.ledgerType,
      date: input.date,
      transactionType: "lay_hang" as const,
      entityId,
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
      select: { id: true, date: true, partyId: true, projectId: true, deletedAt: true },
    });
    if (existing) {
      // Ghi đè event sống sẽ dời/đổi số của một dòng có thể đang nằm trong kỳ đã ký → kiểm cả
      // ngày + cặp CŨ của event (không chỉ ngày mới). Event đã xoá mềm không nằm trong snapshot
      // nào nên không chặn (revive về ngày mới đã được kiểm ở caller).
      if (!existing.deletedAt) {
        await this.lockParties(client, [existing.partyId]);
        await this.assertMaterialPeriodOpen("lay_hang", existing.partyId, existing.projectId, existing.date, client);
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

  /**
   * Sửa ĐÚNG dòng số dư `id` (không bao giờ tạo dòng mới — `setOpeningBalance` chỉ dành cho dòng mới).
   * Sổ vật tư: khoá NCC cũ + mới, đọc lại dòng dưới khoá, kiểm cặp cũ (khoá số dư / mốc theo ngày cũ)
   * lẫn cặp mới (theo ngày mới), Chủ thể suy từ công trình mới. Đổi sang bộ (Chủ thể, NCC, công
   * trình) đã có dòng khác → từ chối thay vì để unique của DB báo lỗi khó hiểu.
   */
  async updateOpeningBalance(id: number, input: OpeningBalanceInput, client: LedgerWriteClient = prisma) {
    return this.inMaterialTx(client, async (c) => {
      const before = await c.ledgerOpeningBalance.findUnique({ where: { id }, select: { partyId: true } });
      await this.lockParties(c, before ? [before.partyId, input.partyId] : [input.partyId]);
      const current = await c.ledgerOpeningBalance.findUnique({
        where: { id },
        select: { id: true, ledgerType: true, partyId: true, projectId: true, asOfDate: true },
      });
      if (!current || current.ledgerType !== this.ledgerType) throw new Error(`Số dư #${id} không tồn tại`);
      await this.lockParties(c, [current.partyId]); // tái nhập; bắt trường hợp NCC đổi giữa hai lần đọc
      await this.assertOpeningEditable(current.partyId, current.projectId, current.asOfDate, c);

      const scoped = await this.scopeMaterialInput(input, c);
      const asOfDate = toBusinessDateFromInput(scoped.asOfDate);
      await this.assertOpeningEditable(scoped.partyId, scoped.projectId, asOfDate, c);

      const projectId = scoped.projectId ?? null;
      const clash = await c.ledgerOpeningBalance.findFirst({
        where: {
          ledgerType: this.ledgerType,
          entityId: scoped.entityId,
          partyId: scoped.partyId,
          projectId,
          id: { not: id },
        },
        select: { id: true },
      });
      if (clash) {
        throw new Error(
          `Đã có số dư ban đầu #${clash.id} cho cùng Chủ thể × đối tác × công trình — sửa dòng đó thay vì đổi dòng #${id} trùng vào.`,
        );
      }

      return c.ledgerOpeningBalance.update({
        where: { id },
        data: {
          entityId: scoped.entityId,
          partyId: scoped.partyId,
          projectId,
          balanceTt: new Prisma.Decimal(scoped.balanceTt),
          balanceHd: new Prisma.Decimal(scoped.balanceHd),
          asOfDate,
          note: scoped.note ?? null,
        },
      });
    });
  }

  async setOpeningBalance(input: OpeningBalanceInput, client: LedgerWriteClient = prisma) {
    return this.inMaterialTx(client, async (c) => {
      await this.lockParties(c, [input.partyId]);
      const scoped = await this.scopeMaterialInput(input, c);
      if (this.ledgerType === "material") {
        await this.assertOpeningEditable(scoped.partyId, scoped.projectId, toBusinessDateFromInput(scoped.asOfDate), c);
      }
      return this.setOpeningRow(scoped, c);
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
      // Ghi đè dòng cũ: ngày số dư CŨ cũng phải sau mốc chuyển đổi (không sửa số dư đã chuyển đổi).
      if (this.ledgerType === "material") {
        await assertAfterMaterialCutover(existing.asOfDate, client, this.materialGuard);
      }
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
      const current = await c.ledgerOpeningBalance.findUnique({
        where: { id },
        select: { partyId: true, projectId: true, asOfDate: true },
      });
      if (current) {
        await this.lockParties(c, [current.partyId]);
        await this.assertOpeningEditable(current.partyId, current.projectId, current.asOfDate, c);
      }
      try {
        await c.ledgerOpeningBalance.delete({ where: { id } });
      } catch (e) {
        if ((e as { code?: string })?.code !== "P2025") throw e;
      }
    });
  }
}
