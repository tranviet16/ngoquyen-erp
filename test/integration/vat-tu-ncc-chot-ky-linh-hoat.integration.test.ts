/**
 * Integration test: chốt kỳ theo tháng 27→26 (kỳ lẻ đầu tiên sau số dư ban đầu) + khoá advisory theo NCC.
 * Fixture Nam Hương (Excel "Gạch Nam Hương.xlsx"):
 *   Số dư ban đầu 189.805.120 tại 31/3/2026.
 *   Kỳ lẻ đầu 01/4→26/4: 8 phiếu × 8.000 viên (6 @1.900 + 2 @1.850) = 120.800.000 → 310.605.120
 *   Kỳ 27/4→26/5: 3 × 8.000 @1.850 = 44.400.000, chuyển khoản 100.000.000 → 255.005.120
 *   Kỳ 27/5→26/6 (nhãn Excel "26/5→26/6" chồng 1 ngày): 8.000 @1.850 + 2 × 5.400 @1.450
 *     = 30.460.000 → 285.465.120
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
import { previewPeriodClose, commitPeriodClose } from "@/lib/vat-tu-ncc/period-close-service";
import { createReconciliation } from "@/lib/vat-tu-ncc/reconciliation-service";
import {
  listReconciliationsDerived,
  signReconciliation,
} from "@/lib/vat-tu-ncc/reconciliation-derive-service";
import { createDelivery, updateDelivery, softDeleteDelivery } from "@/lib/vat-tu-ncc/delivery-service";
import { createMaterialTransaction } from "@/lib/cong-no-vt/material-ledger-service";

const K1 = { from: "2026-04-01", to: "2026-04-26" };
const K2 = { from: "2026-04-27", to: "2026-05-26" };
const K3 = { from: "2026-05-27", to: "2026-06-26" };
const K3_EXCEL_LABEL = { from: "2026-05-26", to: "2026-06-26" };

async function seed() {
  const entity = await prisma.entity.create({ data: { name: "Công ty CP Xây dựng Ngô Quyền", type: "company" } });
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
      projectId: project.id,
      balanceTt: 189_805_120,
      balanceHd: 0,
      asOfDate: new Date("2026-03-31"),
    },
  });

  const delivery = (date: string, qty: number) =>
    prisma.supplierDeliveryDaily.create({
      data: { supplierId: supplier.id, projectId: project.id, date: new Date(date), itemId: item.id, qty, unit: "viên" },
    });
  for (const d of ["2026-04-01", "2026-04-04", "2026-04-08", "2026-04-11", "2026-04-15", "2026-04-18", "2026-04-22", "2026-04-26"]) {
    await delivery(d, 8000);
  }
  for (const d of ["2026-05-04", "2026-05-09", "2026-05-13"]) await delivery(d, 8000);
  await delivery("2026-06-05", 8000);
  await delivery("2026-06-25", 5400);
  await delivery("2026-06-25", 5400);

  return { entity, supplier, project, item };
}

/** Giá theo Excel: kỳ 1 sáu phiếu đầu @1.900, còn lại @1.850; phiếu 5.400 viên @1.450. */
async function close(supplierId: number, projectId: number, range: { from: string; to: string }) {
  const preview = await previewPeriodClose(supplierId, projectId, range);
  return commitPeriodClose(
    supplierId,
    projectId,
    range,
    preview.deliveries.map((d, i) => ({
      deliveryId: d.id,
      unitPrice: d.qty === 5400 ? 1450 : range === K1 && i < 6 ? 1900 : 1850,
    })),
  );
}

async function reconFor(supplierId: number, projectId: number, from: string) {
  const list = await listReconciliationsDerived(supplierId, projectId);
  const row = list.find((r) => r.periodFrom === from);
  if (!row) throw new Error(`Không thấy kỳ từ ${from}`);
  return row;
}

async function payK2(entityId: number, supplierId: number, projectId: number) {
  await createMaterialTransaction({
    date: "2026-05-20",
    transactionType: "thanh_toan",
    entityId,
    partyId: supplierId,
    projectId,
    amountTt: "100000000",
    amountHd: "0",
    vatPctTt: "0",
    vatPctHd: "0",
    status: "approved",
    content: "Chuyển khoản kỳ 27/4→26/5",
  });
}

describe("vat-tu-ncc chốt kỳ linh hoạt (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("gợi ý kỳ đầu sau mốc số dư ban đầu, chuỗi 3 kỳ khớp Excel, liền kề marker gần nhất", async () => {
    const { entity, supplier, project, item } = await seed();

    // Chưa có marker: gợi ý từ phiếu sớm nhất sau mốc số dư (01/4) tới ngày 26 kế tiếp.
    const first = await previewPeriodClose(supplier.id, project.id);
    expect(first.suggestedRange).toEqual({ from: "2026-04-01", to: "2026-04-26" });
    expect(first.latestMarker).toBeNull();
    expect(first.openingAsOf).toBe("2026-03-31");

    // Biên trước mốc số dư ban đầu bị từ chối.
    const early = await previewPeriodClose(supplier.id, project.id, { from: "2026-03-27", to: "2026-04-26" });
    expect(early.boundsError).toMatch(/01\/04\/2026/);

    const k1 = await close(supplier.id, project.id, K1);
    expect(k1.closedCount).toBe(8);
    expect(Number(k1.totalAmountTt)).toBe(120_800_000);
    expect((await reconFor(supplier.id, project.id, K1.from)).closing).toBe(310_605_120);

    // Kỳ 1 CHƯA ký vẫn chốt được kỳ 2 liền kề.
    const afterK1 = await previewPeriodClose(supplier.id, project.id);
    expect(afterK1.suggestedRange).toEqual(K2);
    expect(afterK1.latestMarker).toMatchObject({ from: K1.from, to: K1.to, signed: false });
    await close(supplier.id, project.id, K2);
    await payK2(entity.id, supplier.id, project.id);
    expect((await reconFor(supplier.id, project.id, K2.from)).closing).toBe(255_005_120);

    // Chốt lại đúng biên kỳ 1 chưa ký vẫn được (idempotent).
    await expect(close(supplier.id, project.id, K1)).resolves.toMatchObject({ closedCount: 8 });

    await signReconciliation((await reconFor(supplier.id, project.id, K1.from)).id);
    await signReconciliation((await reconFor(supplier.id, project.id, K2.from)).id);

    // Nhãn Excel lệch ngày 27 bị từ chối ở cả chốt kỳ lẫn tạo kỳ đối chiếu tay (kỳ phải theo tháng).
    await expect(commitPeriodClose(supplier.id, project.id, K3_EXCEL_LABEL, [])).rejects.toThrow(/theo tháng/);
    await expect(
      createReconciliation({
        supplierId: supplier.id,
        projectId: project.id,
        periodFrom: K3_EXCEL_LABEL.from,
        periodTo: K3_EXCEL_LABEL.to,
      }),
    ).rejects.toThrow(/theo tháng/);
    // Gộp hai tháng, hoặc bỏ trống cả một tháng, cũng bị từ chối.
    await expect(
      commitPeriodClose(supplier.id, project.id, { from: "2026-05-27", to: "2026-07-26" }, []),
    ).rejects.toThrow(/theo tháng/);
    await expect(
      commitPeriodClose(supplier.id, project.id, { from: "2026-06-27", to: "2026-07-26" }, []),
    ).rejects.toThrow(/phải bắt đầu 27\/05\/2026/);

    await close(supplier.id, project.id, K3);
    const k3 = await reconFor(supplier.id, project.id, K3.from);
    expect(k3.opening).toBe(255_005_120);
    expect(k3.totalIn).toBe(30_460_000);
    expect(k3.closing).toBe(285_465_120);

    // Ký kỳ 3 khi còn phiếu 20/6 chưa chốt → từ chối; chốt lại rồi ký được.
    const late = await createDelivery({
      supplierId: supplier.id,
      projectId: project.id,
      date: "2026-06-20",
      itemId: item.id,
      qty: 100,
      unit: "viên",
    });
    await expect(signReconciliation(k3.id)).rejects.toThrow(/chưa được chốt vào sổ cái — #\d+ \(2026-06-20\)/);
    await close(supplier.id, project.id, K3);
    await signReconciliation(k3.id);
    const event = await prisma.ledgerTransaction.findFirst({ where: { deliveryId: late.id, deletedAt: null } });
    expect(event).not.toBeNull();
  });

  it("hai lần chốt song song cùng kỳ: khoá NCC tuần tự hoá, chỉ một marker", async () => {
    const { supplier, project } = await seed();
    // Kỳ theo tháng nên hai biên khác nhau mà chồng lấn không còn hợp lệ; còn lại là chốt trùng song song.
    const results = await Promise.allSettled([close(supplier.id, project.id, K1), close(supplier.id, project.id, K1)]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect(await prisma.supplierReconciliation.count({ where: { supplierId: supplier.id, deletedAt: null } })).toBe(1);
  });

  it("ghi thue_hd song song với ký kỳ: hoặc nằm trong snapshot, hoặc bị từ chối", async () => {
    const { entity, supplier, project } = await seed();
    await close(supplier.id, project.id, K1);
    await close(supplier.id, project.id, K2);
    const k2 = await reconFor(supplier.id, project.id, K2.from);

    const [write, sign] = await Promise.allSettled([
      createMaterialTransaction({
        date: "2026-05-10",
        transactionType: "thue_hd",
        entityId: entity.id,
        partyId: supplier.id,
        projectId: project.id,
        amountTt: "1000000",
        amountHd: "0",
        vatPctTt: "0",
        vatPctHd: "0",
        status: "approved",
        invoiceNo: "HD-RACE",
      }),
      signReconciliation(k2.id),
    ]);
    expect(sign.status).toBe("fulfilled");

    const signed = await prisma.supplierReconciliation.findUniqueOrThrow({ where: { id: k2.id } });
    const snapshot = signed.signedSnapshotJson as { totalTax: number; taxRows: { invoiceNo: string | null }[] };
    const taxRows = await prisma.ledgerTransaction.count({
      where: { partyId: supplier.id, transactionType: "thue_hd", deletedAt: null },
    });
    if (write.status === "fulfilled") {
      // Ghi xong trước khi ký lấy khoá → snapshot phải chứa dòng thuế.
      expect(taxRows).toBe(1);
      expect(snapshot.totalTax).toBe(1_000_000);
      expect(snapshot.taxRows.map((r) => r.invoiceNo)).toContain("HD-RACE");
    } else {
      // Ký xong trước → ghi bị khoá kỳ từ chối, không để lại dòng nào.
      expect(String(write.reason)).toMatch(/đã được NCC ký/);
      expect(taxRows).toBe(0);
      expect(snapshot.totalTax).toBe(0);
    }
  });

  it("dời phiếu đã chốt sang tháng chưa có kỳ: tự tạo kỳ đó, event đi theo phiếu; ký/chốt vẫn giữ closing(k) = opening(k+1)", async () => {
    const { supplier, project, item } = await seed();
    await close(supplier.id, project.id, K1);
    await close(supplier.id, project.id, K2);
    const k2 = await reconFor(supplier.id, project.id, K2.from);

    // Phiếu 09/05 (đã chốt trong K2) bị dời sang 05/06 (tháng K3 chưa có kỳ): kỳ K3 được tự tạo (chưa ký)
    // và event đi theo phiếu sang ngày mới trong cùng transaction — K2 không còn giữ phiếu này.
    const moved = await prisma.supplierDeliveryDaily.findFirstOrThrow({
      where: { supplierId: supplier.id, date: new Date("2026-05-09"), deletedAt: null },
    });
    await updateDelivery(moved.id, {
      supplierId: supplier.id,
      projectId: project.id,
      date: "2026-06-05",
      itemId: item.id,
      qty: 8000,
      unit: "viên",
    });
    const movedEvents = await prisma.ledgerTransaction.findMany({ where: { deliveryId: moved.id, deletedAt: null } });
    expect(movedEvents.map((e) => e.date.toISOString().slice(0, 10))).toEqual(["2026-06-05"]);
    expect((await reconFor(supplier.id, project.id, K3.from)).signedBySupplier).toBe(false);

    // K2 không còn phiếu 09/05 nên ký được; snapshot không chứa event đã gỡ.
    await signReconciliation(k2.id);
    const signedK2 = await reconFor(supplier.id, project.id, K2.from);

    // Chốt lại K3 (trùng khít kỳ tự tạo) vẫn được và giữ event ngày mới (05/06).
    await close(supplier.id, project.id, K3);
    const k3 = await reconFor(supplier.id, project.id, K3.from);
    expect(k3.opening).toBe(signedK2.closing);
  });

  it("phiếu vào công nợ ngay khi thêm / sửa: kỳ đã chốt (chưa ký) hoặc tháng chưa có kỳ (tự tạo); thiếu giá thì chưa", async () => {
    const { supplier, project, item } = await seed();
    await close(supplier.id, project.id, K1);
    await close(supplier.id, project.id, K2);
    const eventOf = (deliveryId: number) =>
      prisma.ledgerTransaction.findFirst({ where: { deliveryId, deletedAt: null } });
    const body = { supplierId: supplier.id, projectId: project.id, itemId: item.id, unit: "viên" };

    // Phiếu 09/05 (đã chốt trong K2 @1.850): sửa số lượng → dòng công nợ cập nhật ngay, không bị gỡ.
    const may9 = await prisma.supplierDeliveryDaily.findFirstOrThrow({
      where: { supplierId: supplier.id, date: new Date("2026-05-09"), deletedAt: null },
    });
    const edited = await updateDelivery(may9.id, { ...body, date: "2026-05-09", qty: 9000 });
    expect(edited.ledgerStatus).toBe("posted");
    expect(Number((await eventOf(may9.id))?.totalTt)).toBe(9000 * 1850);
    expect((await reconFor(supplier.id, project.id, K2.from)).totalIn).toBe(44_400_000 + 1000 * 1850);

    // Đổi đơn giá cũng đi thẳng vào công nợ.
    await updateDelivery(may9.id, { ...body, date: "2026-05-09", qty: 9000, unitPrice: 2000 });
    expect(Number((await eventOf(may9.id))?.totalTt)).toBe(18_000_000);

    // Thêm phiếu có giá vào K2 (đã chốt) → vào công nợ ngay; không giá → chờ nhập giá.
    const priced = await createDelivery({ ...body, date: "2026-05-20", qty: 100, unitPrice: 1850 });
    expect(priced.ledgerStatus).toBe("posted");
    expect(Number((await eventOf(priced.id))?.totalTt)).toBe(185_000);
    const unpriced = await createDelivery({ ...body, date: "2026-05-21", qty: 100 });
    expect(unpriced.ledgerStatus).toBe("missing_price");
    expect(await eventOf(unpriced.id)).toBeNull();

    // Tháng K3 chưa có kỳ: tự tạo kỳ K3 (chưa ký), phiếu có giá vào công nợ ngay.
    const later = await createDelivery({ ...body, date: "2026-06-10", qty: 100, unitPrice: 1850 });
    expect(later.ledgerStatus).toBe("posted");
    expect(Number((await eventOf(later.id))?.totalTt)).toBe(185_000);
    const k3 = await reconFor(supplier.id, project.id, K3.from);
    expect(k3).toMatchObject({ periodTo: K3.to, signedBySupplier: false, totalIn: 185_000 });

    // Phiếu ghi trước cho tháng sau tháng hiện tại: chưa tự tạo kỳ, chờ chốt kỳ.
    const future = await createDelivery({ ...body, date: "2099-01-10", qty: 1, unitPrice: 1850 });
    expect(future.ledgerStatus).toBe("awaiting_close");
    expect(await eventOf(future.id)).toBeNull();

    // Sửa ghi chú không đổi tiền → giữ nguyên dòng công nợ.
    const before = await eventOf(priced.id);
    const noted = await updateDelivery(priced.id, { ...body, date: "2026-05-20", qty: 100, unitPrice: 1850, note: "ghi chú" });
    expect(noted.ledgerStatus).toBe("posted");
    expect((await eventOf(priced.id))?.updatedAt).toEqual(before?.updatedAt);
  });

  it("admin xác nhận sửa phiếu kỳ đã ký: dòng công nợ cập nhật, các kỳ đã ký từ đó đông cứng lại, chuỗi đầu kỳ giữ đúng", async () => {
    const { supplier, project, item } = await seed();
    await close(supplier.id, project.id, K1);
    await close(supplier.id, project.id, K2);
    await signReconciliation((await reconFor(supplier.id, project.id, K1.from)).id);
    await signReconciliation((await reconFor(supplier.id, project.id, K2.from)).id);
    const k1Before = await reconFor(supplier.id, project.id, K1.from);

    // Phiếu 01/04 (K1 đã ký, 8.000 viên @1.900).
    const apr1 = await prisma.supplierDeliveryDaily.findFirstOrThrow({
      where: { supplierId: supplier.id, date: new Date("2026-04-01"), deletedAt: null },
    });
    const body = { supplierId: supplier.id, projectId: project.id, date: "2026-04-01", itemId: item.id, unit: "viên", unitPrice: 1900 };
    await expect(updateDelivery(apr1.id, { ...body, qty: 8100 })).rejects.toMatchObject({ code: "signed_period" });

    const edited = await updateDelivery(apr1.id, { ...body, qty: 8100 }, { overrideLocked: true });
    expect(edited.ledgerStatus).toBe("posted");
    const event = await prisma.ledgerTransaction.findFirstOrThrow({ where: { deliveryId: apr1.id, deletedAt: null } });
    expect(Number(event.totalTt)).toBe(8100 * 1900);

    const k1 = await reconFor(supplier.id, project.id, K1.from);
    const k2 = await reconFor(supplier.id, project.id, K2.from);
    expect(k1.closing).toBe(k1Before.closing + 100 * 1900);
    expect(k2.opening).toBe(k1.closing);
    expect(k1.signedDate).toBe(k1Before.signedDate);

    // Dời phiếu sang ngày trong K2 (cũng đã ký): dòng công nợ đi theo, tiền rời K1 vào K2,
    // số cuối K2 giữ nguyên, đầu K2 vẫn = cuối K1.
    const amount = 8100 * 1900;
    await expect(updateDelivery(apr1.id, { ...body, qty: 8100, date: "2026-05-13" })).rejects.toMatchObject({
      code: "signed_period",
    });
    await updateDelivery(apr1.id, { ...body, qty: 8100, date: "2026-05-13" }, { overrideLocked: true });
    const moved = await prisma.ledgerTransaction.findFirstOrThrow({ where: { deliveryId: apr1.id, deletedAt: null } });
    expect(moved.date.toISOString().slice(0, 10)).toBe("2026-05-13");
    const k1Moved = await reconFor(supplier.id, project.id, K1.from);
    const k2Moved = await reconFor(supplier.id, project.id, K2.from);
    expect(k1Moved.closing).toBe(k1.closing - amount);
    expect(k2Moved.opening).toBe(k1Moved.closing);
    expect(k2Moved.closing).toBe(k2.closing);

    // Admin xoá phiếu kỳ đã ký: dòng công nợ bị gỡ, cuối K2 giảm đúng số tiền phiếu.
    await expect(softDeleteDelivery(apr1.id, supplier.id)).rejects.toMatchObject({ code: "signed_period" });
    await softDeleteDelivery(apr1.id, supplier.id, { overrideLocked: true });
    expect(await prisma.ledgerTransaction.count({ where: { deliveryId: apr1.id, deletedAt: null } })).toBe(0);
    const k2Deleted = await reconFor(supplier.id, project.id, K2.from);
    expect(k2Deleted.closing).toBe(k2.closing - amount);
  });

  it("kỳ đã ký: sửa/xoá phiếu có event nằm trong kỳ bị chặn, kể cả khi ngày phiếu đã lệch khỏi event", async () => {
    const { supplier, project, item } = await seed();
    await close(supplier.id, project.id, K1);
    await close(supplier.id, project.id, K2);
    const k2 = await reconFor(supplier.id, project.id, K2.from);
    await signReconciliation(k2.id);

    const inK2 = await prisma.supplierDeliveryDaily.findFirstOrThrow({
      where: { supplierId: supplier.id, date: new Date("2026-05-13"), deletedAt: null },
    });
    const body = { supplierId: supplier.id, projectId: project.id, itemId: item.id, qty: 9000, unit: "viên" };
    await expect(updateDelivery(inK2.id, { ...body, date: "2026-05-13" })).rejects.toThrow(/đã được NCC ký/);
    await expect(softDeleteDelivery(inK2.id, supplier.id)).rejects.toThrow(/đã được NCC ký/);

    // Dựng trạng thái lệch (phiếu ngày 05/06 nhưng event vẫn ngày 13/05 trong kỳ đã ký) bằng ghi trực tiếp DB.
    await prisma.supplierDeliveryDaily.update({ where: { id: inK2.id }, data: { date: new Date("2026-06-05") } });
    await expect(softDeleteDelivery(inK2.id, supplier.id)).rejects.toThrow(/đã được NCC ký/);
    await expect(updateDelivery(inK2.id, { ...body, date: "2026-06-05" })).rejects.toThrow(/đã được NCC ký/);
    // Chốt K3 cũng không được ghi đè event nằm trong kỳ đã ký.
    await expect(close(supplier.id, project.id, K3)).rejects.toThrow(/đã được NCC ký/);
    const event = await prisma.ledgerTransaction.findFirstOrThrow({ where: { deliveryId: inK2.id, deletedAt: null } });
    expect(event.date.toISOString().slice(0, 10)).toBe("2026-05-13");
  });
});
