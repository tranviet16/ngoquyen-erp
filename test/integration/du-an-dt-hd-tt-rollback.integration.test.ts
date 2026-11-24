/**
 * Integration test: hoàn tác run "Đối chiếu DT-HĐ-TT" (dự án xây dựng) trên Postgres thật.
 *
 * Seed bằng tay đúng trạng thái mà import để lại: run "bảng cân đối" cũ có dự toán + giao dịch; run
 * sổ mới đã thay (xóa mềm + supersededByRunId) các dòng đó, ghi sổ (đầu mối, hóa đơn) và giao dịch
 * HĐ sinh từ hóa đơn, lưu tập dòng bị thay ở reviewJson.expected.superseded. Kiểm:
 *   - hoàn tác run sổ khôi phục đúng tập dòng cũ và xóa sổ + giao dịch sinh ra;
 *   - từ chối hoàn tác run cũ khi còn bị thay (sẽ xóa cứng dự toán);
 *   - từ chối khi dòng bị thay đã bị sửa, khi dòng của run sửa sau commit, khi công trình có dòng sổ
 *     nhập tay, và khi một run "bảng cân đối" mới hơn đã ghi lại giao dịch (khôi phục sẽ nhân đôi);
 *   - tab Giao dịch không sửa / xóa được dòng bị thay hay dòng sinh từ hóa đơn.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { rollbackImportRun, getRollbackInfo } from "@/lib/import/import-engine";
import { RollbackBlockedError } from "@/lib/import/import-errors";
import { softDeleteTransaction } from "@/lib/du-an/transaction-service";

const T0 = new Date("2026-01-01T00:00:00Z"); // lúc ghi dòng
const T1 = new Date("2026-01-02T00:00:00Z"); // lúc commit run sổ
const T2 = new Date("2026-01-03T00:00:00Z"); // run "bảng cân đối" mới hơn

interface World {
  projectId: number;
  oldRunId: number;
  bookRunId: number;
  oldTxIds: number[];
  oldEstIds: number[];
  invoiceLineId: number;
  derivedTxId: number;
  counterpartyId: number;
}

async function makeRun(adapter: string, committedAt: Date, reviewJson: object | null = null) {
  const run = await prisma.importRun.create({
    data: { fileName: `${adapter}.xlsx`, fileHash: `${adapter}-${committedAt.getTime()}`, adapter, status: "committed", createdBy: "admin", committedAt, reviewJson: reviewJson ?? undefined },
  });
  return run.id;
}

async function seed(): Promise<World> {
  const project = await prisma.project.create({ data: { code: "MNTC-GD1", name: "Mầm Non Trại Chuối GĐ1", status: "active" } });
  const other = await prisma.project.create({ data: { code: "TC", name: "Trại Chuối", status: "active" } });
  const cat = await prisma.projectCategory.create({ data: { projectId: project.id, code: "HM1-VL", name: "Vật liệu" } });
  const supplier = await prisma.supplier.create({ data: { name: "Bê tông HP", taxCode: "0200758915" } });
  const oldRunId = await makeRun("bang-can-doi-vat-tu", new Date("2025-12-01T00:00:00Z"));

  const oldEstIds: number[] = [];
  const oldTxIds: number[] = [];
  for (const [i, amount] of [[1, 1_000_000], [2, 2_500_000]] as const) {
    const est = await prisma.projectEstimate.create({
      data: { projectId: project.id, categoryId: cat.id, itemCode: `VL-${i}`, itemName: `Vật tư ${i}`, unit: "m3", qty: 10, unitPrice: amount / 10, totalVnd: amount, importRunId: oldRunId },
    });
    oldEstIds.push(est.id);
    const tx = await prisma.projectTransaction.create({
      data: { projectId: project.id, date: T0, transactionType: "lay_hang", categoryId: cat.id, itemCode: `VL-${i}`, itemName: `Vật tư ${i}`, qty: 1, unit: "m3", amountHd: amount, importRunId: oldRunId },
    });
    oldTxIds.push(tx.id);
  }
  // Công trình khác không được đụng tới.
  await prisma.projectTransaction.create({
    data: { projectId: other.id, date: T0, transactionType: "lay_hang", categoryId: cat.id, itemCode: "X", itemName: "X", qty: 1, unit: "m3", amountHd: 7, importRunId: oldRunId },
  });

  const bookRunId = await makeRun("du-an-dt-hd-tt", T1, {
    expected: {
      superseded: {
        transactions: { ids: oldTxIds, sum: "3500000.00" },
        estimates: { ids: oldEstIds, sum: "3500000.00" },
      },
    },
  });
  await prisma.$executeRaw`UPDATE project_transactions SET "deletedAt" = ${T1}, "supersededByRunId" = ${bookRunId} WHERE id = ANY(${oldTxIds}::int[])`;
  await prisma.$executeRaw`UPDATE project_estimates SET "deletedAt" = ${T1}, "supersededByRunId" = ${bookRunId} WHERE id = ANY(${oldEstIds}::int[])`;

  const [cp] = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO project_counterparties ("projectId", name, kind, "actualBasis", "importRunId", "createdAt", "updatedAt")
    VALUES (${project.id}, 'Bê tông HP', 'ncc', 'receipts', ${bookRunId}, ${T0}, ${T0}) RETURNING id`;
  await prisma.$executeRaw`
    INSERT INTO project_counterparty_suppliers ("projectId", "counterpartyId", "supplierId", "importRunId", "createdAt", "updatedAt")
    VALUES (${project.id}, ${cp.id}, ${supplier.id}, ${bookRunId}, ${T0}, ${T0})`;
  const [line] = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO project_invoice_lines ("projectId", "supplierId", "invoiceNo", "itemName", unit, "itemKey", "amountVnd", "vatVnd", "importRunId", "createdAt", "updatedAt")
    VALUES (${project.id}, ${supplier.id}, '00000232', 'Bê tông M300', 'm3', 'be tong m300|m3', 4000000, 320000, ${bookRunId}, ${T0}, ${T0}) RETURNING id`;
  const derived = await prisma.projectTransaction.create({
    data: { projectId: project.id, date: T0, transactionType: "lay_hang", categoryId: cat.id, itemCode: "VL-1", itemName: "Bê tông M300", qty: 1, unit: "m3", amountHd: 4_000_000, importRunId: bookRunId, sourceInvoiceLineId: line.id },
  });
  return { projectId: project.id, oldRunId, bookRunId, oldTxIds, oldEstIds, invoiceLineId: line.id, derivedTxId: derived.id, counterpartyId: cp.id };
}

const liveTx = (projectId: number) => prisma.projectTransaction.count({ where: { projectId, deletedAt: null } });
const liveEst = (projectId: number) => prisma.projectEstimate.count({ where: { projectId, deletedAt: null } });

describe("hoàn tác run Đối chiếu DT-HĐ-TT", () => {
  let w: World;
  beforeEach(async () => {
    await truncateAll();
    w = await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("khôi phục đúng tập dòng đã thay và xóa sổ + giao dịch sinh từ hóa đơn", async () => {
    expect(await liveTx(w.projectId)).toBe(1); // chỉ giao dịch sinh từ hóa đơn
    expect(await liveEst(w.projectId)).toBe(0);
    expect((await getRollbackInfo(w.bookRunId)).duAnBook.total).toBe(3);

    const result = await rollbackImportRun(w.bookRunId);

    expect(result.duAnBook.restoredTransactions).toBe(2);
    expect(result.duAnBook.restoredEstimates).toBe(2);
    expect(result.duAnBook.deleted.project_invoice_lines).toBe(1);
    expect(result.projectTransactions).toBe(1);
    const tx = await prisma.projectTransaction.findMany({ where: { projectId: w.projectId, deletedAt: null }, orderBy: { id: "asc" } });
    expect(tx.map((t) => t.id)).toEqual(w.oldTxIds);
    expect(tx.every((t) => t.supersededByRunId === null)).toBe(true);
    expect(await liveEst(w.projectId)).toBe(2);
    expect(await prisma.projectCounterparty.count()).toBe(0);
    expect(await prisma.projectInvoiceLine.count()).toBe(0);
  });

  it("từ chối hoàn tác run cũ khi dòng của nó đang bị thay", async () => {
    await expect(rollbackImportRun(w.oldRunId)).rejects.toThrow(/đang bị một run "Đối chiếu DT-HĐ-TT" thay thế/);
    expect(await prisma.projectEstimate.count({ where: { importRunId: w.oldRunId } })).toBe(2);
  });

  it("từ chối khôi phục khi dòng bị thay đã bị sửa (tổng tiền khác lúc commit)", async () => {
    await prisma.$executeRaw`UPDATE project_transactions SET "amountHd" = 999 WHERE id = ${w.oldTxIds[0]}`;
    const err = await rollbackImportRun(w.bookRunId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RollbackBlockedError);
    expect((err as RollbackBlockedError).reasons.join(" ")).toMatch(/Tập giao dịch cũ đang bị thay/);
    expect(await prisma.projectInvoiceLine.count()).toBe(1); // không xóa gì
  });

  it("từ chối khi dòng của run đã sửa sau commit", async () => {
    await prisma.projectCounterparty.update({ where: { id: w.counterpartyId }, data: { actualManualVnd: 5 } });
    await expect(rollbackImportRun(w.bookRunId)).rejects.toThrow(/đã sửa hoặc xóa sau khi commit/);
  });

  it("từ chối khi công trình đã có dòng sổ nhập tay", async () => {
    await prisma.$executeRaw`
      INSERT INTO project_actual_receipts ("projectId", "itemName", unit, "itemKey", "amountVnd", "createdAt", "updatedAt")
      VALUES (${w.projectId}, 'Cát vàng', 'm3', 'cat vang|m3', 560000, NOW(), NOW())`;
    await expect(rollbackImportRun(w.bookRunId)).rejects.toThrow(/không thuộc run/);
  });

  it("từ chối khôi phục khi run bảng cân đối mới hơn đã ghi lại giao dịch (tránh nhân đôi)", async () => {
    const newerRun = await makeRun("bang-can-doi-vat-tu", T2);
    const cat = await prisma.projectCategory.findFirstOrThrow({ where: { projectId: w.projectId } });
    await prisma.projectTransaction.create({
      data: { projectId: w.projectId, date: T2, transactionType: "lay_hang", categoryId: cat.id, itemCode: "VL-1", itemName: "Vật tư 1", qty: 1, unit: "m3", amountHd: 1_000_000, importRunId: newerRun },
    });
    await expect(rollbackImportRun(w.bookRunId)).rejects.toThrow(/khôi phục sẽ nhân đôi/);
  });

  it("tab Giao dịch không sửa / xóa được dòng bị thay hay dòng sinh từ hóa đơn", async () => {
    await expect(softDeleteTransaction(w.oldTxIds[0], w.projectId)).rejects.toThrow("Forbidden");
    await expect(softDeleteTransaction(w.derivedTxId, w.projectId)).rejects.toThrow(/sinh từ sổ Hóa đơn/);
  });
});
