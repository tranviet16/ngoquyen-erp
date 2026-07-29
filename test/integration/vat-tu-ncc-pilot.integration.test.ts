/**
 * Integration test: pilot Nam Hương — tái hiện 2 kỳ gần nhất từ Excel
 * "Gạch Nam Hương.xlsx" (sheet Đối chiếu công nợ) trên DB test thật.
 *
 * Chuỗi số Excel đã xác minh:
 *   Kỳ 5/2026 (Excel 28/4→26/5): A=310.605.120, B=44.400.000 (3×8.000 viên @1.850),
 *     C=100.000.000 → Tổng nợ 255.005.120
 *   Kỳ 6/2026 (Excel 26/5→26/6): A=255.005.120, B=30.460.000
 *     (8.000@1.850 + 2×5.400@1.450), C=0 → Tổng nợ 285.465.120
 * Kỳ ERP chuẩn hóa 27→26 bao trùm đúng các ngày phiếu trên.
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
import { periodRange } from "@/lib/vat-tu-ncc/period";
import { previewPeriodClose, commitPeriodClose } from "@/lib/vat-tu-ncc/period-close-service";
import {
  listReconciliationsDerived,
  getReconciliationView,
  signReconciliation,
  unsignReconciliation,
} from "@/lib/vat-tu-ncc/reconciliation-derive-service";
import { createDelivery } from "@/lib/vat-tu-ncc/delivery-service";
import { checkPeriodConsistency } from "@/lib/vat-tu-ncc/period-recon-check-service";
import { LedgerService } from "@/lib/ledger/ledger-service";
import { querySummary } from "@/lib/ledger/ledger-aggregations";
import { syncClosedRoundToLedger } from "@/lib/payment/payment-ledger-sync";

const EXCEL = {
  openingPeriod5: 310_605_120, // A kỳ 5 = Tổng nợ hết 27/4/2026
  totalInPeriod5: 44_400_000,
  paidPeriod5: 100_000_000,
  closingPeriod5: 255_005_120,
  totalInPeriod6: 30_460_000,
  closingPeriod6: 285_465_120,
};

async function seedMasterData() {
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

  // A kỳ 5 = dư nợ hết 27/4/2026 (Excel gộp nhiều công trình — nhập 1 dòng gộp)
  await prisma.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: entity.id,
      partyId: supplier.id,
      projectId: null,
      balanceTt: EXCEL.openingPeriod5,
      balanceHd: 0,
      asOfDate: new Date("2026-04-27"),
    },
  });

  return { entity, supplier, project, item };
}

async function seedDelivery(
  supplierId: number,
  projectId: number,
  itemId: number,
  date: string,
  qty: number,
) {
  return prisma.supplierDeliveryDaily.create({
    data: { supplierId, projectId, date: new Date(date), itemId, qty, unit: "viên" },
  });
}

/** Phiếu 2 kỳ đúng theo sheet Đối chiếu Nam Hương (ngày đã chuẩn hóa dd/mm). */
async function seedTwoPeriods(ids: Awaited<ReturnType<typeof seedMasterData>>) {
  const { supplier, project, item } = ids;
  // Kỳ 5/2026: 04/5, 09/5, 13/5 — 8.000 viên/lần
  for (const d of ["2026-05-04", "2026-05-09", "2026-05-13"]) {
    await seedDelivery(supplier.id, project.id, item.id, d, 8000);
  }
  // Kỳ 6/2026: 05/6 8.000 viên; 25/6 ×2 5.400 viên
  await seedDelivery(supplier.id, project.id, item.id, "2026-06-05", 8000);
  await seedDelivery(supplier.id, project.id, item.id, "2026-06-25", 5400);
  await seedDelivery(supplier.id, project.id, item.id, "2026-06-25", 5400);
}

async function closePeriod5(supplierId: number) {
  const preview = await previewPeriodClose(supplierId, 2026, 5);
  return commitPeriodClose(
    supplierId,
    2026,
    5,
    preview.deliveries.map((d) => ({ deliveryId: d.id, unitPrice: 1850 })),
  );
}

async function closePeriod6(supplierId: number) {
  const preview = await previewPeriodClose(supplierId, 2026, 6);
  return commitPeriodClose(
    supplierId,
    2026,
    6,
    preview.deliveries.map((d) => ({
      deliveryId: d.id,
      unitPrice: d.qty === 8000 ? 1850 : 1450,
    })),
  );
}

async function payPeriod5(entityId: number, supplierId: number) {
  // Chuyển khoản 100tr trong kỳ 5 — nhập tay ngoài đợt (đường cong-no-vt/nhap-lieu)
  const ledger = new LedgerService("material");
  await ledger.create({
    date: "2026-05-20",
    transactionType: "thanh_toan",
    entityId,
    partyId: supplierId,
    projectId: null,
    amountTt: String(EXCEL.paidPeriod5),
    amountHd: "0",
    content: "Chuyển khoản kỳ 5",
  });
}

describe("vat-tu-ncc pilot Nam Hương (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("periodRange chuẩn 27→26 bao trùm đúng ngày phiếu Excel", () => {
    const p5 = periodRange(2026, 5);
    expect(p5.from.toISOString().slice(0, 10)).toBe("2026-04-27");
    expect(p5.to.toISOString().slice(0, 10)).toBe("2026-05-26");
    const p1 = periodRange(2027, 1); // cuộn năm
    expect(p1.from.toISOString().slice(0, 10)).toBe("2026-12-27");
    expect(p1.to.toISOString().slice(0, 10)).toBe("2027-01-26");
  });

  it("khớp 100% chuỗi A/B/C/Tổng nợ Excel qua 2 kỳ + carry-over + parity sổ cái", async () => {
    const ids = await seedMasterData();
    await seedTwoPeriods(ids);

    await closePeriod5(ids.supplier.id);
    await payPeriod5(ids.entity.id, ids.supplier.id);
    await closePeriod6(ids.supplier.id);

    const list = await listReconciliationsDerived(ids.supplier.id);
    expect(list).toHaveLength(2);
    const [p6, p5] = list; // orderBy periodFrom desc

    // Kỳ 5/2026 khớp Excel
    expect(p5.opening).toBe(EXCEL.openingPeriod5);
    expect(p5.totalIn).toBe(EXCEL.totalInPeriod5);
    expect(p5.totalPaid).toBe(EXCEL.paidPeriod5);
    expect(p5.closing).toBe(EXCEL.closingPeriod5);

    // Carry-over: closing kỳ 5 = opening kỳ 6 (không lưu, cùng đọc 1 sổ cái)
    expect(p6.opening).toBe(p5.closing);

    // Kỳ 6/2026 khớp Excel
    expect(p6.totalIn).toBe(EXCEL.totalInPeriod6);
    expect(p6.totalPaid).toBe(0);
    expect(p6.closing).toBe(EXCEL.closingPeriod6);

    // Parity với quản lý công nợ vật tư: tổng balance mọi (entity, project) của NCC
    const summary = await querySummary("material", { partyId: ids.supplier.id });
    const ledgerBalance = summary.reduce((s, r) => s + Number(r.balanceTt), 0);
    expect(ledgerBalance).toBe(EXCEL.closingPeriod6);

    // Lưới an toàn: 0 mồ côi, 0 chênh trên cả 2 kỳ
    const check = await checkPeriodConsistency(ids.supplier.id, "2026-04-27", "2026-06-26");
    expect(check.orphanDeliveries).toHaveLength(0);
    expect(check.orphanEvents).toHaveLength(0);
    expect(check.mismatches).toHaveLength(0);
  });

  it("chốt kỳ idempotent: chạy lại đổi giá → vẫn 1 event/phiếu, số cập nhật", async () => {
    const ids = await seedMasterData();
    await seedTwoPeriods(ids);
    await closePeriod5(ids.supplier.id);
    await closePeriod5(ids.supplier.id); // lần 2 cùng payload

    const events = await prisma.ledgerTransaction.findMany({
      where: { transactionType: "lay_hang", partyId: ids.supplier.id, deletedAt: null },
    });
    expect(events).toHaveLength(3);
    expect(events.every((e) => Number(e.totalTt) === 14_800_000)).toBe(true);

    // Đổi giá 1 phiếu rồi chốt lại → event cập nhật, không nhân đôi
    const preview = await previewPeriodClose(ids.supplier.id, 2026, 5);
    await commitPeriodClose(ids.supplier.id, 2026, 5, [
      { deliveryId: preview.deliveries[0].id, unitPrice: 1900 },
    ]);
    const updated = await prisma.ledgerTransaction.findMany({
      where: { transactionType: "lay_hang", partyId: ids.supplier.id, deletedAt: null },
      orderBy: { date: "asc" },
    });
    expect(updated).toHaveLength(3);
    expect(Number(updated[0].totalTt)).toBe(8000 * 1900);
  });

  it("chốt kỳ chặn phiếu thiếu công trình / công trình chưa gán Chủ Thể", async () => {
    const ids = await seedMasterData();
    const orphanProject = await prisma.project.create({
      data: { code: "NO-ENT", name: "Chưa gán chủ thể", status: "active" },
    });
    await seedDelivery(ids.supplier.id, orphanProject.id, ids.item.id, "2026-05-10", 100);
    await prisma.supplierDeliveryDaily.create({
      data: { supplierId: ids.supplier.id, projectId: null, date: new Date("2026-05-11"), itemId: ids.item.id, qty: 50, unit: "viên" },
    });

    const preview = await previewPeriodClose(ids.supplier.id, 2026, 5);
    expect(preview.violations).toHaveLength(2);
    expect(preview.violations.map((v) => v.reason).sort()).toEqual([
      "missing_entity",
      "missing_project",
    ]);
    await expect(
      commitPeriodClose(ids.supplier.id, 2026, 5, preview.deliveries.map((d) => ({ deliveryId: d.id, unitPrice: 1000 }))),
    ).rejects.toThrow(/chưa đủ điều kiện/);
    // Không ghi partial
    expect(await prisma.ledgerTransaction.count({ where: { partyId: ids.supplier.id } })).toBe(0);
  });

  it("ký kỳ → đông cứng snapshot, khóa ghi trong kỳ; gỡ ký chỉ từ kỳ mới nhất", async () => {
    const ids = await seedMasterData();
    await seedTwoPeriods(ids);
    await closePeriod5(ids.supplier.id);
    await payPeriod5(ids.entity.id, ids.supplier.id);
    await closePeriod6(ids.supplier.id);

    const list = await listReconciliationsDerived(ids.supplier.id);
    const p5 = list.find((r) => r.periodFrom === "2026-04-27")!;
    const p6 = list.find((r) => r.periodFrom === "2026-05-27")!;

    await signReconciliation(p5.id);
    await signReconciliation(p6.id);

    // Snapshot đông cứng đúng số
    const view5 = await getReconciliationView(p5.id);
    expect(view5.fromSnapshot).toBe(true);
    expect(view5.closing).toBe(EXCEL.closingPeriod5);
    expect(view5.layHangRows).toHaveLength(3);

    // Khóa ghi: phiếu mới trong kỳ đã ký bị chặn
    await expect(
      createDelivery({
        supplierId: ids.supplier.id,
        projectId: ids.project.id,
        date: "2026-05-10",
        itemId: ids.item.id,
        qty: 1,
        unit: "viên",
      }),
    ).rejects.toThrow(/đã được NCC ký/);

    // Khóa ghi: thanh_toan nhập tay trong kỳ đã ký bị chặn
    const ledger = new LedgerService("material");
    await expect(
      ledger.create({
        date: "2026-06-01",
        transactionType: "thanh_toan",
        entityId: ids.entity.id,
        partyId: ids.supplier.id,
        amountTt: "1",
        amountHd: "0",
      }),
    ).rejects.toThrow(/đã được NCC ký/);

    // Khóa ghi: chốt lại kỳ đã ký bị chặn
    await expect(closePeriod5(ids.supplier.id)).rejects.toThrow();

    // dieu_chinh không bị khóa (lối ra duy nhất cho chênh lệch)
    await ledger.create({
      date: "2026-06-30",
      transactionType: "dieu_chinh",
      entityId: ids.entity.id,
      partyId: ids.supplier.id,
      amountTt: "-5000",
      amountHd: "0",
      content: "Điều chỉnh sau ký",
    });

    // Gỡ ký kỳ cũ khi kỳ sau còn ký → chặn; gỡ kỳ mới nhất → được
    await expect(unsignReconciliation(p5.id)).rejects.toThrow(/kỳ sau/);
    await unsignReconciliation(p6.id);
    const after = await prisma.supplierReconciliation.findUnique({ where: { id: p6.id } });
    expect(after?.signedBySupplier).toBe(false);
    expect(after?.signedSnapshotJson).toBeNull();
  });

  it("đóng đợt thanh toán chỉ sinh thanh_toan cho vat_tu, idempotent", async () => {
    const ids = await seedMasterData();
    const user = await prisma.user.create({
      data: { id: "u-pilot", name: "Pilot", email: "pilot@test.local", role: "admin" },
    });
    const round = await prisma.paymentRound.create({
      data: { month: "2026-06", sequence: 1, status: "approved", createdById: user.id },
    });
    const mk = (category: string, soDuyet: number) =>
      prisma.paymentRoundItem.create({
        data: {
          roundId: round.id,
          entityId: ids.entity.id,
          supplierId: ids.supplier.id,
          projectId: ids.project.id,
          category,
          soDeNghi: soDuyet,
          soDuyet: new Prisma.Decimal(soDuyet),
        },
      });
    await mk("vat_tu", 30_000_000);
    await mk("vat_tu", 20_000_000);
    await mk("nhan_cong", 99_000_000);
    await mk("dich_vu", 88_000_000);

    const closedAt = new Date("2026-06-30");
    await syncClosedRoundToLedger(round.id, prisma, closedAt);
    await syncClosedRoundToLedger(round.id, prisma, closedAt); // idempotent

    const events = await prisma.ledgerTransaction.findMany({
      where: { transactionType: "thanh_toan", partyId: ids.supplier.id, deletedAt: null },
    });
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.ledgerType === "material")).toBe(true);
    expect(events.reduce((s, e) => s + Number(e.totalTt), 0)).toBe(50_000_000);
  });
});
