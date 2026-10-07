/**
 * Integration test: thuế hoá đơn NCC (`thue_hd`) trên DB test thật.
 *
 * Fixture Bê tông Hải Phòng (một Chủ thể, một công trình để mọi hạt gộp so sánh được):
 *   Số dư ban đầu 315.648.111 (asOf 26/4/2026)
 *   lay_hang 27/4: 20.880.000 + 2.900.000 = 23.780.000
 *   thue_hd ghi sổ 26/5 (HĐ 00000232 ngày 29/5): TT 11.448.000, HĐ 0
 *   → Tổng nợ 350.876.111 ở mọi đường đọc.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn().mockResolvedValue({
    userId: "integration-admin",
    role: "admin",
  }),
}));
vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: vi.fn().mockResolvedValue("integration-admin"),
}));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { LedgerService } from "@/lib/ledger/ledger-service";
import {
  querySummary,
  queryCurrentBalance,
  queryDebtMatrix,
} from "@/lib/ledger/ledger-aggregations";
import { getOutstandingDebt } from "@/lib/ledger/balance-service";
import { queryDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import {
  createMaterialTransaction,
  patchMaterialTransaction,
  softDeleteMaterialTransaction,
  setMaterialOpeningBalance,
} from "@/lib/cong-no-vt/material-ledger-service";
import { createLaborTransaction } from "@/lib/cong-no-nc/labor-ledger-service";
import {
  getReconciliationView,
  listReconciliationsDerived,
  signReconciliation,
} from "@/lib/vat-tu-ncc/reconciliation-derive-service";

const EXPECTED = {
  opening: 315_648_111,
  totalIn: 23_780_000,
  totalTax: 11_448_000,
  closing: 350_876_111,
  phatSinh: 35_228_000,
};

async function seed() {
  const entity = await prisma.entity.create({ data: { name: "Cty Thuế HĐ", type: "company" } });
  const supplier = await prisma.supplier.create({ data: { name: "Bê tông Hải Phòng" } });
  const project = await prisma.project.create({
    data: { code: "P-THUE", name: "Dự án Thuế HĐ", status: "active", entityId: entity.id },
  });

  await prisma.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: entity.id,
      partyId: supplier.id,
      projectId: project.id,
      balanceTt: EXPECTED.opening,
      balanceHd: 0,
      asOfDate: new Date("2026-04-26"),
    },
  });

  const ledger = new LedgerService("material");
  const common = {
    entityId: entity.id,
    partyId: supplier.id,
    projectId: project.id,
    amountHd: "0",
  };
  await ledger.create({ ...common, date: "2026-04-27", transactionType: "lay_hang", amountTt: "20880000" });
  await ledger.create({ ...common, date: "2026-04-27", transactionType: "lay_hang", amountTt: "2900000" });
  await ledger.create({
    ...common,
    date: "2026-05-26",
    transactionType: "thue_hd",
    amountTt: String(EXPECTED.totalTax),
    invoiceNo: "00000232",
    invoiceDate: "2026-05-29",
    content: "Thuế HĐ: 00000232 ngày 29/5/2026",
  });

  const recon = await prisma.supplierReconciliation.create({
    data: {
      supplierId: supplier.id,
      periodFrom: new Date("2026-04-27"),
      periodTo: new Date("2026-05-26"),
    },
  });

  return { entity, supplier, project, recon };
}

describe("cong-no thue_hd (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("đối chiếu: totalIn chỉ gồm hàng, thuế tách dòng, closing 350.876.111", async () => {
    const { recon } = await seed();
    const view = await getReconciliationView(recon.id);
    expect(view.opening).toBe(EXPECTED.opening);
    expect(view.totalIn).toBe(EXPECTED.totalIn);
    expect(view.totalTax).toBe(EXPECTED.totalTax);
    expect(view.taxRows).toHaveLength(1);
    expect(view.taxRows[0].invoiceNo).toBe("00000232");
    expect(view.taxRows[0].invoiceDate).toBe("2026-05-29");
    expect(view.closing).toBe(EXPECTED.closing);

    const [row] = await listReconciliationsDerived(recon.supplierId);
    expect(row.totalIn).toBe(EXPECTED.totalIn);
    expect(row.otherAmount).toBe(EXPECTED.totalTax);
  });

  it("5 đường đọc cùng 350.876.111 và Phát sinh TT 35.228.000", async () => {
    const { entity, supplier, project } = await seed();

    const summary = await querySummary("material", { partyId: supplier.id });
    expect(summary).toHaveLength(1);
    expect(Number(summary[0].balanceTt)).toBe(EXPECTED.closing);
    expect(Number(summary[0].layHangTt)).toBe(EXPECTED.totalIn + EXPECTED.totalTax);
    expect(Number(summary[0].layHangHd)).toBe(0);

    const current = await queryCurrentBalance("material", entity.id, supplier.id, project.id);
    expect(current.tt.toNumber()).toBe(EXPECTED.closing);

    const outstanding = await getOutstandingDebt({
      ledgerType: "material",
      entityId: entity.id,
      partyId: supplier.id,
      projectId: project.id,
    });
    expect(outstanding.toNumber()).toBe(EXPECTED.closing);

    const matrix = await queryDebtMatrix("material", { partyIds: [supplier.id] });
    expect(matrix[0].totals.closeTt).toBe(EXPECTED.closing);
    expect(matrix[0].totals.layHd).toBe(0);

    const detail = await queryDetailReport({ ledgerType: "material", year: 2026, month: 5, showZero: false });
    const line = detail.rows.find((r) => r.partyId === supplier.id)!;
    expect(Number(line.phatSinhTt)).toBe(EXPECTED.phatSinh);
    expect(Number(line.cuoiKyTt)).toBe(EXPECTED.closing);
    expect(Number(line.phatSinhHd)).toBe(0);
  });

  it("ký kỳ: totalIn = B, closingBalance đông cứng, JSON giữ totalTax; ghi thue_hd vào kỳ đã ký bị từ chối", async () => {
    const { entity, supplier, project, recon } = await seed();
    await signReconciliation(recon.id);

    const signed = await prisma.supplierReconciliation.findUniqueOrThrow({ where: { id: recon.id } });
    expect(Number(signed.totalIn)).toBe(EXPECTED.totalIn);
    expect(Number(signed.closingBalance)).toBe(EXPECTED.closing);
    const snapshot = signed.signedSnapshotJson as { totalTax: number; taxRows: unknown[] };
    expect(snapshot.totalTax).toBe(EXPECTED.totalTax);
    expect(snapshot.taxRows).toHaveLength(1);

    await expect(
      new LedgerService("material").create({
        date: "2026-05-10",
        transactionType: "thue_hd",
        entityId: entity.id,
        partyId: supplier.id,
        projectId: project.id,
        amountTt: "1000",
        amountHd: "0",
        invoiceNo: "X1",
      }),
    ).rejects.toThrow(/đã được NCC ký/);

    // Số dư ban đầu của NCC có kỳ ký là chỉ-đọc
    await expect(
      setMaterialOpeningBalance({
        entityId: entity.id,
        partyId: supplier.id,
        projectId: project.id,
        balanceTt: "1",
        balanceHd: "0",
        asOfDate: "2026-04-26",
      }),
    ).rejects.toThrow(/số dư ban đầu/);
    const ob = await prisma.ledgerOpeningBalance.findFirstOrThrow({ where: { partyId: supplier.id } });
    expect(Number(ob.balanceTt)).toBe(EXPECTED.opening);

    // Snapshot đã ký vẫn đọc đủ trường thuế
    const view = await getReconciliationView(recon.id);
    expect(view.fromSnapshot).toBe(true);
    expect(view.totalTax).toBe(EXPECTED.totalTax);
  });

  it("zod từ chối thue_hd thiếu số hoá đơn; nhân công không nhận thue_hd", async () => {
    const { entity, supplier, project } = await seed();
    const input = {
      date: "2026-06-01",
      transactionType: "thue_hd" as const,
      entityId: entity.id,
      partyId: supplier.id,
      projectId: project.id,
      amountTt: "1000",
      amountHd: "0",
      vatPctTt: "0",
      vatPctHd: "0",
      status: "pending" as const,
    };
    await expect(createMaterialTransaction(input)).rejects.toThrow();
    // Schema nhân công không có thue_hd: ép kiểu để đi qua compile, server phải từ chối.
    await expect(
      createLaborTransaction({ ...input, invoiceNo: "A1" } as unknown as Parameters<typeof createLaborTransaction>[0]),
    ).rejects.toThrow();
    // Có số hoá đơn thì ghi được và HĐ mặc định 0
    const ok = await createMaterialTransaction({ ...input, invoiceNo: "A1" });
    expect(Number(ok.totalHd)).toBe(0);
    expect(ok.transactionType).toBe("thue_hd");
  });

  it("dòng tự sinh (deliveryId) không sửa/xoá tay được", async () => {
    const { entity, supplier, project } = await seed();
    const item = await prisma.item.create({
      data: { code: "BT-M300", name: "Bê tông M300", unit: "m3", type: "material" },
    });
    const delivery = await prisma.supplierDeliveryDaily.create({
      data: { supplierId: supplier.id, projectId: project.id, date: new Date("2026-07-01"), itemId: item.id, qty: 10, unit: "m3" },
    });
    const auto = await prisma.ledgerTransaction.create({
      data: {
        ledgerType: "material",
        date: new Date("2026-07-01"),
        transactionType: "lay_hang",
        entityId: entity.id,
        partyId: supplier.id,
        projectId: project.id,
        totalTt: 1000,
        totalHd: 0,
        deliveryId: delivery.id,
      },
    });

    await expect(patchMaterialTransaction(auto.id, { amountTt: "5" })).rejects.toThrow(/tự động/);
    await expect(softDeleteMaterialTransaction(auto.id)).rejects.toThrow(/tự động/);
    const after = await prisma.ledgerTransaction.findUniqueOrThrow({ where: { id: auto.id } });
    expect(Number(after.totalTt)).toBe(1000);
    expect(after.deletedAt).toBeNull();
  });
});
