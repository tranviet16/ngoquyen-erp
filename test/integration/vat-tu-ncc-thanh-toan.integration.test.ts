/**
 * Integration test: tab Thanh toán của NCC — ghi chuyển khoản / thuế hoá đơn qua cổng sổ cái
 * `cong-no-vt` và đọc lại ở bảng đối chiếu.
 *
 * Fixture Nam Hương kỳ 28/4→26/5 (Excel "Gạch Nam Hương.xlsx"):
 *   Nợ đầu kỳ (hết 27/4)  310.605.120
 *   B: 3 phiếu × 14.800.000 = 44.400.000 (04/5, 09/5, 13/5)
 *   C: chuyển khoản 100.000.000 ngày 20/5 → Tổng nợ 255.005.120
 *   Thuế HĐ 11.448.000 ngày 26/5 → Tổng nợ 266.453.120
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
import { Prisma } from "@prisma/client";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { LedgerService } from "@/lib/ledger/ledger-service";
import {
  createMaterialTransaction,
  patchMaterialTransaction,
  softDeleteMaterialTransaction,
  listMaterialTransactions,
} from "@/lib/cong-no-vt/material-ledger-service";
import {
  getReconciliationView,
  listReconciliationsDerived,
  signReconciliation,
} from "@/lib/vat-tu-ncc/reconciliation-derive-service";
import { supplierBalanceAsOf } from "@/lib/vat-tu-ncc/supplier-balance";
import { syncClosedRoundToLedger } from "@/lib/payment/payment-ledger-sync";
import type { TransactionInput } from "@/lib/cong-no-vt/schemas";

const EXPECTED = {
  opening: 310_605_120,
  totalIn: 44_400_000,
  paid: 100_000_000,
  closingAfterPayment: 255_005_120,
  tax: 11_448_000,
  closingAfterTax: 266_453_120,
};

async function seed() {
  const entity = await prisma.entity.create({
    data: { name: "Công ty CP Xây dựng Ngô Quyền", type: "company" },
  });
  const supplier = await prisma.supplier.create({ data: { name: "Công ty TNHH Nam Hương" } });
  const project = await prisma.project.create({
    data: { code: "TC", name: "Trại Chuối", status: "active", entityId: entity.id },
  });
  const item = await prisma.item.create({
    data: { code: "GD-A1", name: "Gạch đặc A1", unit: "viên", type: "material" },
  });

  await prisma.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: entity.id,
      partyId: supplier.id,
      projectId: null,
      balanceTt: EXPECTED.opening,
      balanceHd: 0,
      asOfDate: new Date("2026-04-27"),
    },
  });

  // B: 3 phiếu lấy hàng (sinh trực tiếp như kết quả chốt kỳ)
  const ledger = new LedgerService("material");
  for (const date of ["2026-05-04", "2026-05-09", "2026-05-13"]) {
    await ledger.create({
      date,
      transactionType: "lay_hang",
      entityId: entity.id,
      partyId: supplier.id,
      projectId: project.id,
      itemId: item.id,
      amountTt: "14800000",
      amountHd: "0",
    });
  }

  // Marker kỳ đối chiếu 28/4→26/5 (số tổng dẫn xuất từ sổ cái)
  const recon = await prisma.supplierReconciliation.create({
    data: {
      supplierId: supplier.id,
      periodFrom: new Date("2026-04-28"),
      periodTo: new Date("2026-05-26"),
    },
  });

  return { entity, supplier, project, item, recon };
}

function txInput(
  ids: { entity: { id: number }; supplier: { id: number } },
  overrides: Partial<TransactionInput>,
): TransactionInput {
  return {
    date: "2026-05-20",
    transactionType: "thanh_toan",
    entityId: ids.entity.id,
    partyId: ids.supplier.id,
    projectId: null,
    amountTt: "0",
    vatPctTt: "0",
    amountHd: "0",
    vatPctHd: "0",
    status: "pending",
    ...overrides,
  };
}

async function recon(supplierId: number, reconId: number) {
  const list = await listReconciliationsDerived(supplierId);
  const row = list.find((r) => r.id === reconId);
  if (!row) throw new Error("Không thấy kỳ đối chiếu");
  return row;
}

describe("vat-tu-ncc tab Thanh toán (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("chuyển khoản 100tr ngày 20/5 vào đúng kỳ: tổng trả và dư cuối khớp Excel", async () => {
    const ids = await seed();
    const before = await recon(ids.supplier.id, ids.recon.id);
    expect(before.opening).toBe(EXPECTED.opening);
    expect(before.totalIn).toBe(EXPECTED.totalIn);

    await createMaterialTransaction(
      txInput(ids, { date: "2026-05-20", amountTt: String(EXPECTED.paid), content: "CK ngày 20/05/2026" }),
    );

    const after = await recon(ids.supplier.id, ids.recon.id);
    expect(after.totalPaid).toBe(EXPECTED.paid);
    expect(after.closing).toBe(EXPECTED.closingAfterPayment);
  });

  it("thuế HĐ 11.448.000 ngày 26/5 tăng nợ, hiện ở khối thuế với đúng số hoá đơn", async () => {
    const ids = await seed();
    await createMaterialTransaction(txInput(ids, { amountTt: String(EXPECTED.paid) }));
    await createMaterialTransaction(
      txInput(ids, {
        date: "2026-05-26",
        transactionType: "thue_hd",
        amountTt: String(EXPECTED.tax),
        invoiceNo: "00000232",
        invoiceDate: "2026-05-29",
        content: "Thuế HĐ: 00000232 ngày 29/05/2026",
      }),
    );

    const row = await recon(ids.supplier.id, ids.recon.id);
    expect(row.closing).toBe(EXPECTED.closingAfterTax);

    const view = await getReconciliationView(ids.recon.id);
    expect(view.taxRows).toHaveLength(1);
    expect(view.taxRows[0].invoiceNo).toBe("00000232");
    expect(view.totalTax).toBe(EXPECTED.tax);

    expect(await supplierBalanceAsOf(ids.supplier.id, new Date("2026-05-26"))).toBe(EXPECTED.closingAfterTax);
  });

  it("thuế HĐ thiếu số hoá đơn bị từ chối và không ghi sổ", async () => {
    const ids = await seed();
    await expect(
      createMaterialTransaction(
        txInput(ids, { date: "2026-05-26", transactionType: "thue_hd", amountTt: String(EXPECTED.tax), invoiceNo: "  " }),
      ),
    ).rejects.toThrow();
    await expect(
      createMaterialTransaction(
        txInput(ids, { date: "2026-05-26", transactionType: "thue_hd", amountTt: String(EXPECTED.tax) }),
      ),
    ).rejects.toThrow();
    expect(await prisma.ledgerTransaction.count({ where: { transactionType: "thue_hd" } })).toBe(0);
  });

  it("listMaterialTransactions({ transactionTypes }) chỉ trả thanh_toan và thue_hd của NCC", async () => {
    const ids = await seed();
    await createMaterialTransaction(txInput(ids, { amountTt: String(EXPECTED.paid) }));
    await createMaterialTransaction(
      txInput(ids, {
        date: "2026-05-26",
        transactionType: "thue_hd",
        amountTt: String(EXPECTED.tax),
        invoiceNo: "00000232",
      }),
    );

    const result = await listMaterialTransactions({
      partyId: ids.supplier.id,
      transactionTypes: ["thanh_toan", "thue_hd"],
      pageSize: 500,
    });
    expect(result.total).toBe(2);
    expect(result.items.map((t) => t.transactionType).sort()).toEqual(["thanh_toan", "thue_hd"]);
  });

  it("sau khi NCC ký: tạo, sửa, xoá trong kỳ đều bị từ chối", async () => {
    const ids = await seed();
    const pay = await createMaterialTransaction(txInput(ids, { amountTt: String(EXPECTED.paid) }));
    await signReconciliation(ids.recon.id);

    await expect(
      createMaterialTransaction(txInput(ids, { date: "2026-05-21", amountTt: "1" })),
    ).rejects.toThrow(/đã được NCC ký/);
    await expect(patchMaterialTransaction(pay.id, { amountTt: "2" })).rejects.toThrow(/đã được NCC ký/);
    await expect(softDeleteMaterialTransaction(pay.id)).rejects.toThrow(/đã được NCC ký/);

    // Số liệu đã ký không đổi
    const after = await recon(ids.supplier.id, ids.recon.id);
    expect(after.totalPaid).toBe(EXPECTED.paid);
    expect(after.closing).toBe(EXPECTED.closingAfterPayment);
  });

  it("dòng sinh từ đợt thanh toán không sửa/xoá tay được", async () => {
    const ids = await seed();
    const user = await prisma.user.create({
      data: { id: "u-thanh-toan", name: "Kế toán", email: "kt@test.local", role: "admin" },
    });
    const round = await prisma.paymentRound.create({
      data: { month: "2026-06", sequence: 1, status: "approved", createdById: user.id },
    });
    await prisma.paymentRoundItem.create({
      data: {
        roundId: round.id,
        entityId: ids.entity.id,
        supplierId: ids.supplier.id,
        projectId: ids.project.id,
        category: "vat_tu",
        soDeNghi: 30_000_000,
        soDuyet: new Prisma.Decimal(30_000_000),
      },
    });
    await syncClosedRoundToLedger(round.id, prisma, new Date("2026-06-30"));

    const fromRound = await prisma.ledgerTransaction.findFirstOrThrow({
      where: { partyId: ids.supplier.id, transactionType: "thanh_toan", paymentRoundItemId: { not: null } },
    });
    await expect(patchMaterialTransaction(fromRound.id, { amountTt: "1" })).rejects.toThrow(/sinh tự động/);
    await expect(softDeleteMaterialTransaction(fromRound.id)).rejects.toThrow(/sinh tự động/);
  });
});
