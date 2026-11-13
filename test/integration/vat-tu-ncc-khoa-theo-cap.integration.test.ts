/**
 * Integration test: chốt, ký, khoá kỳ theo cặp NCC × công trình.
 * Dữ liệu: NCC A (Bê tông HP), hai công trình X và Y cùng Chủ thể.
 *   X: phiếu 10/10 18 m³ × 1.610.000 = 28.980.000
 *   Y: phiếu 12/10 0,5 ca × 2.800.000 (+ phiếu 15/10 0,5 ca nhập sau khi X đã ký); số dư Y 1.000.000 hết 26/09
 * Kỳ 27/09 → 26/10/2026.
 *   (a) Ký A×X: phiếu A×X ngày 15/10 bị từ chối, A×Y vẫn được.
 *   (b) Chốt A×Y cùng biên tạo marker riêng.
 *   (c) Snapshot A×X chỉ có dòng của X; dư mang sang chỉ tính X.
 *   (d) Số dư ban đầu A×X chỉ đọc, A×Y sửa được.
 *   (e) Đợt thanh toán: dòng vat_tu thiếu công trình bị từ chối; đóng đợt rơi vào kỳ ký của X bị từ chối, của Y thì qua.
 *   (f) Công trình chưa có Chủ thể: ghi vật tư lỗi missing_entity; Chủ thể luôn suy từ công trình.
 *   (g) Marker chuyển đổi (importRunId): không gỡ ký/sửa/xoá; freezeReconciliationSnapshot đông cứng đúng cặp.
 *   (h) Có run chuyển đổi committed mốc 26/10: ghi ngày ≤ mốc ở cặp mới bị chặn; dieu_chinh 30/10 vẫn được.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { authMock, mockSession } from "@/test/helpers/session-mock";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn().mockResolvedValue({ userId: "pair-admin", role: "admin" }),
}));
vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: vi.fn().mockResolvedValue("pair-admin"),
}));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { previewPeriodClose, commitPeriodClose } from "@/lib/vat-tu-ncc/period-close-service";
import {
  getReconciliationView,
  listReconciliationsDerived,
  signReconciliation,
  unsignReconciliation,
} from "@/lib/vat-tu-ncc/reconciliation-derive-service";
import { softDeleteReconciliation, updateReconciliation } from "@/lib/vat-tu-ncc/reconciliation-service";
import { createDelivery, softDeleteDelivery, updateDelivery } from "@/lib/vat-tu-ncc/delivery-service";
import { lockSuppliers } from "@/lib/vat-tu-ncc/period-lock";
import { freezeReconciliationSnapshot } from "@/lib/vat-tu-ncc/reconciliation-compute";
import { MATERIAL_CUTOVER_ADAPTER } from "@/lib/vat-tu-ncc/pair-scope";
import { createMaterialTransaction, setMaterialOpeningBalance } from "@/lib/cong-no-vt/material-ledger-service";
import { LedgerService } from "@/lib/ledger/ledger-service";
import { syncClosedRoundToLedger } from "@/lib/payment/payment-ledger-sync";
import * as paymentSvc from "@/lib/payment/payment-service";

const ADMIN_ID = "pair-admin";
const K = { from: "2026-09-27", to: "2026-10-26" };

async function seed() {
  await prisma.user.create({
    data: { id: ADMIN_ID, name: "Kế toán cặp", email: "pair-admin@test.local", role: "admin", isDirector: true },
  });
  const entity = await prisma.entity.create({ data: { name: "Công ty CP Xây dựng Ngô Quyền", type: "company" } });
  const otherEntity = await prisma.entity.create({ data: { name: "Công ty Quản Lý", type: "company" } });
  const supplier = await prisma.supplier.create({ data: { name: "Bê tông HP" } });
  const projectX = await prisma.project.create({
    data: { code: "TC", name: "Trại Chuối", status: "active", entityId: entity.id },
  });
  const projectY = await prisma.project.create({
    data: { code: "DCX", name: "Đường Cao Xanh", status: "active", entityId: entity.id },
  });
  const concrete = await prisma.item.create({
    data: { code: "BT-M300", name: "Bê tông M300", unit: "m3", type: "material" },
  });
  const pump = await prisma.item.create({ data: { code: "MAY-BOM", name: "Máy bơm", unit: "ca", type: "machine" } });

  const deliveryX = await prisma.supplierDeliveryDaily.create({
    data: { supplierId: supplier.id, projectId: projectX.id, date: new Date("2026-10-10"), itemId: concrete.id, qty: 18, unit: "m3" },
  });
  const deliveryY = await prisma.supplierDeliveryDaily.create({
    data: { supplierId: supplier.id, projectId: projectY.id, date: new Date("2026-10-12"), itemId: pump.id, qty: 0.5, unit: "ca" },
  });
  await prisma.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: entity.id,
      partyId: supplier.id,
      projectId: projectY.id,
      balanceTt: 1_000_000,
      balanceHd: 0,
      asOfDate: new Date("2026-09-26"),
    },
  });
  mockSession({ id: ADMIN_ID, role: "admin" });
  return { entity, otherEntity, supplier, projectX, projectY, concrete, pump, deliveryX, deliveryY };
}

function txInput(
  ids: { entityId: number; supplierId: number; projectId: number },
  overrides: Partial<Parameters<typeof createMaterialTransaction>[0]> = {},
): Parameters<typeof createMaterialTransaction>[0] {
  return {
    date: "2026-11-02",
    transactionType: "thanh_toan",
    entityId: ids.entityId,
    partyId: ids.supplierId,
    projectId: ids.projectId,
    amountTt: "1000",
    vatPctTt: "0",
    amountHd: "0",
    vatPctHd: "0",
    status: "pending",
    ...overrides,
  };
}

describe("vat-tu-ncc khoá kỳ theo cặp NCC × công trình (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("(a)–(e) chốt, ký, số dư và đợt thanh toán của A×X không ảnh hưởng A×Y", async () => {
    const ids = await seed();
    const { supplier, projectX, projectY, entity } = ids;

    // (a) Chốt + ký A×X kỳ 27/09→26/10.
    const closedX = await commitPeriodClose(supplier.id, projectX.id, K, [
      { deliveryId: ids.deliveryX.id, unitPrice: 1_610_000 },
    ]);
    expect(closedX).toMatchObject({ closedCount: 1, totalAmountTt: "28980000" });
    const [markerX] = await listReconciliationsDerived(supplier.id, projectX.id);
    await signReconciliation(markerX.id);

    await expect(
      createDelivery({ supplierId: supplier.id, projectId: projectX.id, date: "2026-10-15", itemId: ids.concrete.id, qty: 1, unit: "m3" }),
    ).rejects.toThrow(/đã được NCC ký/);
    const lateY = await createDelivery({
      supplierId: supplier.id,
      projectId: projectY.id,
      date: "2026-10-15",
      itemId: ids.pump.id,
      qty: 0.5,
      unit: "ca",
    });

    // (b) Chốt A×Y cùng biên: không bị kỳ ký của X chặn, tạo marker riêng của Y.
    const previewY = await previewPeriodClose(supplier.id, projectY.id, K);
    expect(previewY.signedBlocked).toBe(false);
    expect(previewY.boundsError).toBeNull();
    expect(previewY.deliveries.map((d) => d.id).sort((a, b) => a - b)).toEqual(
      [ids.deliveryY.id, lateY.id].sort((a, b) => a - b),
    );
    await commitPeriodClose(
      supplier.id,
      projectY.id,
      K,
      previewY.deliveries.map((d) => ({ deliveryId: d.id, unitPrice: 2_800_000 })),
    );
    const markers = await prisma.supplierReconciliation.findMany({
      where: { supplierId: supplier.id, deletedAt: null },
      orderBy: { projectId: "asc" },
    });
    expect(markers).toHaveLength(2);
    expect(markers.map((m) => m.projectId).sort((a, b) => a - b)).toEqual([projectX.id, projectY.id].sort((a, b) => a - b));
    expect(new Set(markers.map((m) => `${m.periodFrom.toISOString()}→${m.periodTo.toISOString()}`)).size).toBe(1);

    // (c) Snapshot A×X chỉ có dòng của X; dư mang sang chỉ tính X (số dư 1tr thuộc Y).
    const viewX = await getReconciliationView(markerX.id);
    expect(viewX.fromSnapshot).toBe(true);
    expect(viewX.projectId).toBe(projectX.id);
    expect(viewX.layHangRows).toHaveLength(1);
    expect(viewX.layHangRows.every((r) => r.projectId === projectX.id)).toBe(true);
    expect(viewX.opening).toBe(0);
    expect(viewX.totalIn).toBe(28_980_000);
    expect(viewX.closing).toBe(28_980_000);
    const [rowY] = await listReconciliationsDerived(supplier.id, projectY.id);
    expect(rowY.opening).toBe(1_000_000);
    expect(rowY.totalIn).toBe(2_800_000);
    expect(rowY.closing).toBe(3_800_000);

    // (d) Số dư ban đầu: A×X (đã ký) chỉ đọc, A×Y (chưa ký) sửa được.
    const opening = { entityId: entity.id, partyId: supplier.id, balanceHd: "0", asOfDate: "2026-09-26" };
    await expect(
      setMaterialOpeningBalance({ ...opening, projectId: projectX.id, balanceTt: "5" }),
    ).rejects.toThrow(/số dư ban đầu không thể sửa/);
    await expect(
      setMaterialOpeningBalance({ ...opening, projectId: projectY.id, balanceTt: "1200000" }),
    ).resolves.toMatchObject({ projectId: projectY.id });

    // (e) Đợt thanh toán.
    const draft = await paymentSvc.createRound({ month: "2026-10" });
    await expect(
      paymentSvc.upsertItem({
        roundId: draft.id,
        entityId: entity.id,
        supplierId: supplier.id,
        projectId: null,
        category: "vat_tu",
        congNo: 0,
        luyKe: 0,
        soDeNghi: 1,
      }),
    ).rejects.toThrow(/thiếu công trình/);

    const approvedRound = async (sequence: number, projectId: number | null) => {
      const round = await prisma.paymentRound.create({
        data: { month: "2026-10", sequence, status: "approved", createdById: ADMIN_ID },
      });
      await prisma.paymentRoundItem.create({
        data: {
          roundId: round.id,
          entityId: entity.id,
          supplierId: supplier.id,
          projectId,
          category: "vat_tu",
          soDeNghi: 5_000_000,
          soDuyet: new Prisma.Decimal(5_000_000),
        },
      });
      return round;
    };
    const legacy = await approvedRound(2, null);
    await expect(syncClosedRoundToLedger(legacy.id, prisma, new Date("2026-10-28T03:00:00Z"))).rejects.toThrow(
      /thiếu công trình/,
    );
    const roundX = await approvedRound(3, projectX.id);
    await expect(syncClosedRoundToLedger(roundX.id, prisma, new Date("2026-10-20T03:00:00Z"))).rejects.toThrow(
      /đã được NCC ký/,
    );
    const roundY = await approvedRound(4, projectY.id);
    await expect(syncClosedRoundToLedger(roundY.id, prisma, new Date("2026-10-20T03:00:00Z"))).resolves.toBe(1);
    const paidY = await prisma.ledgerTransaction.findFirstOrThrow({
      where: { partyId: supplier.id, transactionType: "thanh_toan", deletedAt: null },
    });
    expect(paidY).toMatchObject({ projectId: projectY.id, entityId: entity.id });
    expect(await prisma.ledgerTransaction.count({ where: { transactionType: "thanh_toan" } })).toBe(1);
  });

  it("(f) công trình chưa có Chủ thể → missing_entity; Chủ thể luôn suy từ công trình", async () => {
    const { entity, otherEntity, supplier, projectX } = await seed();
    const noEntity = await prisma.project.create({ data: { code: "NO-ENT", name: "Chưa gán Chủ thể", status: "active" } });

    await expect(
      createMaterialTransaction(txInput({ entityId: entity.id, supplierId: supplier.id, projectId: noEntity.id })),
    ).rejects.toMatchObject({ code: "missing_entity", message: "Công trình chưa gán Chủ thể — gán ở Master data > Công trình" });
    expect(await prisma.ledgerTransaction.count({ where: { projectId: noEntity.id } })).toBe(0);

    // Client gửi Chủ thể khác → server thay bằng Chủ thể của công trình.
    const tx = await createMaterialTransaction(
      txInput({ entityId: otherEntity.id, supplierId: supplier.id, projectId: projectX.id }),
    );
    expect(tx.entityId).toBe(entity.id);
  });

  it("(g) marker chuyển đổi: đông cứng bằng freezeReconciliationSnapshot, không gỡ ký/sửa/xoá được", async () => {
    const { entity, supplier, projectX, projectY } = await seed();
    // Run ở trạng thái preview: guard mốc toàn cục chưa bật, chỉ kiểm hành vi của marker.
    const run = await prisma.importRun.create({
      data: { fileName: "Quản Lý Công Nợ", fileHash: "pair-test", adapter: MATERIAL_CUTOVER_ADAPTER, status: "preview", createdBy: ADMIN_ID },
    });
    const ledgerRow = (projectId: number, totalTt: number) =>
      prisma.ledgerTransaction.create({
        data: {
          ledgerType: "material",
          date: new Date("2026-05-10"),
          transactionType: "lay_hang",
          entityId: entity.id,
          partyId: supplier.id,
          projectId,
          amountTt: totalTt,
          totalTt,
          importRunId: run.id,
        },
      });
    await ledgerRow(projectX.id, 7_000_000);
    await ledgerRow(projectY.id, 9_000_000); // cặp khác — không được lọt vào snapshot của X
    const marker = await prisma.supplierReconciliation.create({
      data: {
        supplierId: supplier.id,
        projectId: projectX.id,
        periodFrom: new Date("2026-01-01"),
        periodTo: new Date("2026-10-26"),
        importRunId: run.id,
      },
    });

    const snapshot = await prisma.$transaction(async (tx) => {
      await lockSuppliers(tx, [supplier.id]);
      return freezeReconciliationSnapshot(tx, marker.id);
    });
    expect(snapshot.totalIn).toBe(7_000_000);
    expect(snapshot.layHangRows.every((r) => r.projectId === projectX.id)).toBe(true);
    const frozen = await prisma.supplierReconciliation.findUniqueOrThrow({ where: { id: marker.id } });
    expect(frozen.signedBySupplier).toBe(true);
    expect(Number(frozen.closingBalance)).toBe(7_000_000);

    await expect(unsignReconciliation(marker.id)).rejects.toThrow(/Kỳ chuyển đổi/);
    await expect(softDeleteReconciliation(marker.id, supplier.id)).rejects.toThrow(/Kỳ chuyển đổi/);
    await expect(
      updateReconciliation(marker.id, {
        supplierId: supplier.id,
        projectId: projectX.id,
        periodFrom: "2026-01-01",
        periodTo: "2026-10-26",
        note: "sửa thử",
      }),
    ).rejects.toThrow(/Kỳ chuyển đổi/);
    const view = await getReconciliationView(marker.id);
    expect(view.cutoverMarker).toBe(true);
    expect(view.signedBySupplier).toBe(true);
  });

  it("(h) run chuyển đổi committed mốc 26/10: chặn ghi ≤ mốc ở mọi cặp, dieu_chinh sau mốc vẫn được", async () => {
    const { entity, concrete } = await seed();
    const run = await prisma.importRun.create({
      data: {
        fileName: "Quản Lý Công Nợ",
        fileHash: "pair-cutover",
        adapter: MATERIAL_CUTOVER_ADAPTER,
        status: "committed",
        committedAt: new Date("2026-11-01T02:00:00Z"),
        createdBy: ADMIN_ID,
        reviewJson: { expected: { cutoverDate: "2026-10-26" } },
      },
    });
    // Cặp mới tạo sau go-live: NCC B × công trình W, chưa có marker nào.
    const supplierB = await prisma.supplier.create({ data: { name: "Quang Minh" } });
    const projectW = await prisma.project.create({
      data: { code: "W", name: "Công trình mới", status: "active", entityId: entity.id },
    });
    const pair = { entityId: entity.id, supplierId: supplierB.id, projectId: projectW.id };

    await expect(
      createDelivery({ supplierId: supplierB.id, projectId: projectW.id, date: "2026-10-20", itemId: concrete.id, qty: 1, unit: "m3" }),
    ).rejects.toMatchObject({ code: "cutover_locked" });
    await expect(
      createDelivery({ supplierId: supplierB.id, projectId: projectW.id, date: "2026-10-27", itemId: concrete.id, qty: 1, unit: "m3" }),
    ).resolves.toMatchObject({ projectId: projectW.id });

    await expect(
      createMaterialTransaction(txInput(pair, { transactionType: "dieu_chinh", date: "2026-10-20" })),
    ).rejects.toMatchObject({ code: "cutover_locked" });
    await expect(
      createMaterialTransaction(txInput(pair, { transactionType: "dieu_chinh", date: "2026-10-30" })),
    ).resolves.toMatchObject({ transactionType: "dieu_chinh" });
    await expect(
      setMaterialOpeningBalance({ ...pair, partyId: supplierB.id, balanceTt: "1", balanceHd: "0", asOfDate: "2025-12-31" }),
    ).rejects.toMatchObject({ code: "cutover_locked" });

    // Ghi của chính run import đi qua guard mốc nhờ cờ tường minh.
    const importLedger = new LedgerService("material", { cutoverImportRunId: run.id });
    await expect(
      importLedger.create({
        date: "2026-03-01",
        transactionType: "lay_hang",
        entityId: entity.id,
        partyId: supplierB.id,
        projectId: projectW.id,
        amountTt: "100",
        amountHd: "0",
      }),
    ).resolves.toMatchObject({ projectId: projectW.id });
  });

  it("(i) admin xác nhận sửa phiếu kỳ chuyển đổi: chênh tiền vào công nợ đúng ngày phiếu, marker đông cứng lại", async () => {
    const { entity, concrete } = await seed();
    await prisma.importRun.create({
      data: {
        fileName: "Quản Lý Công Nợ",
        fileHash: "pair-cutover-edit",
        adapter: MATERIAL_CUTOVER_ADAPTER,
        status: "committed",
        committedAt: new Date("2026-11-01T02:00:00Z"),
        createdBy: ADMIN_ID,
        reviewJson: { expected: { cutoverDate: "2026-10-26" } },
      },
    });
    const run = await prisma.importRun.findFirstOrThrow({ where: { fileHash: "pair-cutover-edit" } });
    const supplier = await prisma.supplier.create({ data: { name: "NCC kỳ chuyển đổi" } });
    const project = await prisma.project.create({
      data: { code: "CV", name: "Công trình chuyển đổi", status: "active", entityId: entity.id },
    });
    // Phiếu lịch sử (chỉ là bản ghi khối lượng) + marker kỳ chuyển đổi đã ký của cặp.
    const slip = await prisma.supplierDeliveryDaily.create({
      data: {
        supplierId: supplier.id, projectId: project.id, date: new Date("2026-10-20"), itemId: concrete.id,
        qty: 10, unit: "m3", unitPrice: 1000, totalAmount: 10_000,
      },
    });
    const marker = await prisma.supplierReconciliation.create({
      data: {
        supplierId: supplier.id, projectId: project.id, importRunId: run.id,
        periodFrom: new Date("2026-09-27"), periodTo: new Date("2026-10-26"),
      },
    });
    await prisma.$transaction(async (tx) => {
      await lockSuppliers(tx, [supplier.id]);
      await freezeReconciliationSnapshot(tx, marker.id);
    });
    const signedBefore = await prisma.supplierReconciliation.findUniqueOrThrow({ where: { id: marker.id } });
    const body = { supplierId: supplier.id, projectId: project.id, date: "2026-10-20", itemId: concrete.id, unit: "m3", unitPrice: 1000 };

    // Không xác nhận → vẫn bị khoá như cũ.
    await expect(updateDelivery(slip.id, { ...body, qty: 12 })).rejects.toMatchObject({ code: "cutover_locked" });

    // Admin xác nhận: chênh 2 m3 × 1.000 = 2.000 vào công nợ bằng dòng lấy hàng chênh lệch ngày 20/10
    // (vào "Cộng P/S", không vào cột Thuế/ĐC).
    const edited = await updateDelivery(slip.id, { ...body, qty: 12 }, { overrideLocked: true });
    expect(edited.ledgerStatus).toBe("posted");
    const adjust = await prisma.ledgerTransaction.findMany({
      where: { partyId: supplier.id, projectId: project.id, transactionType: "lay_hang", deliveryId: null, deletedAt: null },
    });
    expect(adjust).toHaveLength(1);
    expect(Number(adjust[0].totalTt)).toBe(2000);
    expect(adjust[0].date.toISOString().slice(0, 10)).toBe("2026-10-20");
    expect(adjust[0].entityId).toBe(entity.id);

    // Marker được đông cứng lại theo số mới, giữ ngày ký, có audit.
    const signedAfter = await prisma.supplierReconciliation.findUniqueOrThrow({ where: { id: marker.id } });
    expect(Number(signedAfter.closingBalance)).toBe(Number(signedBefore.closingBalance) + 2000);
    // Chênh lệch nằm ở "Cộng P/S" (totalIn), không ở cột Thuế/ĐC.
    expect(Number(signedAfter.totalIn)).toBe(Number(signedBefore.totalIn) + 2000);
    const snapshot = signedAfter.signedSnapshotJson as { totalAdjust?: number } | null;
    expect(snapshot?.totalAdjust ?? 0).toBe(0);
    expect(signedAfter.signedDate).toEqual(signedBefore.signedDate);
    const audit = await prisma.auditLog.findFirst({
      where: { tableName: "SupplierReconciliation", recordId: String(marker.id) },
      orderBy: { id: "desc" },
    });
    expect((audit?.afterJson as { event?: string }).event).toBe("refrozen_after_admin_edit");

    // Giảm lại về 10 m3 → thêm dòng −2.000, tổng chênh về 0.
    await updateDelivery(slip.id, { ...body, qty: 10 }, { overrideLocked: true });
    const total = await prisma.ledgerTransaction.aggregate({
      where: { partyId: supplier.id, projectId: project.id, transactionType: "lay_hang", deliveryId: null, deletedAt: null },
      _sum: { totalTt: true },
    });
    expect(Number(total._sum.totalTt)).toBe(0);

    // Đổi ngày trong kỳ chuyển đổi: −10.000 ngày cũ, +10.000 ngày mới; số cuối kỳ của marker giữ nguyên.
    await updateDelivery(slip.id, { ...body, qty: 10, date: "2026-10-21" }, { overrideLocked: true });
    const byDate = async () => {
      const rows = await prisma.ledgerTransaction.groupBy({
        by: ["date"],
        where: { partyId: supplier.id, projectId: project.id, transactionType: "lay_hang", deliveryId: null, deletedAt: null },
        _sum: { totalTt: true },
      });
      return Object.fromEntries(rows.map((r) => [r.date.toISOString().slice(0, 10), Number(r._sum.totalTt)]));
    };
    expect(await byDate()).toEqual({ "2026-10-20": -10_000, "2026-10-21": 10_000 });
    const afterMove = await prisma.supplierReconciliation.findUniqueOrThrow({ where: { id: marker.id } });
    expect(Number(afterMove.closingBalance)).toBe(Number(signedBefore.closingBalance));

    // Dời ra sau mốc (tháng chưa có kỳ): tiền rời kỳ chuyển đổi; kỳ 27/10 – 26/11 được tự tạo (chưa ký) và
    // phiếu vào công nợ ngay bằng dòng lay_hang của chính phiếu.
    const moved = await updateDelivery(slip.id, { ...body, qty: 10, date: "2026-10-30" }, { overrideLocked: true });
    expect(moved.ledgerStatus).toBe("posted");
    expect(await byDate()).toEqual({ "2026-10-20": -10_000, "2026-10-21": 0 });
    const slipEvents = await prisma.ledgerTransaction.findMany({ where: { deliveryId: slip.id, deletedAt: null } });
    expect(slipEvents.map((e) => [e.date.toISOString().slice(0, 10), Number(e.totalTt)])).toEqual([["2026-10-30", 10_000]]);
    const autoMonth = await prisma.supplierReconciliation.findFirstOrThrow({
      where: { supplierId: supplier.id, projectId: project.id, periodFrom: new Date("2026-10-27"), deletedAt: null },
    });
    expect(autoMonth).toMatchObject({ periodTo: new Date("2026-11-26"), signedBySupplier: false });
    const afterOut = await prisma.supplierReconciliation.findUniqueOrThrow({ where: { id: marker.id } });
    expect(Number(afterOut.closingBalance)).toBe(Number(signedBefore.closingBalance) - 10_000);
  });

  it("(j) admin xác nhận thêm / xoá phiếu kỳ chuyển đổi: tiền vào / ra công nợ bằng dòng điều chỉnh", async () => {
    const { entity, concrete } = await seed();
    await prisma.importRun.create({
      data: {
        fileName: "Quản Lý Công Nợ",
        fileHash: "pair-cutover-add",
        adapter: MATERIAL_CUTOVER_ADAPTER,
        status: "committed",
        committedAt: new Date("2026-11-01T02:00:00Z"),
        createdBy: ADMIN_ID,
        reviewJson: { expected: { cutoverDate: "2026-10-26" } },
      },
    });
    const supplier = await prisma.supplier.create({ data: { name: "NCC thêm phiếu cũ" } });
    const project = await prisma.project.create({
      data: { code: "CVA", name: "Công trình thêm phiếu", status: "active", entityId: entity.id },
    });
    const body = {
      supplierId: supplier.id, projectId: project.id, date: "2026-10-15", itemId: concrete.id,
      qty: 3, unit: "m3", unitPrice: 2000,
    };
    const adjustSum = async () =>
      Number(
        (
          await prisma.ledgerTransaction.aggregate({
            where: { partyId: supplier.id, projectId: project.id, transactionType: "lay_hang", deliveryId: null, deletedAt: null },
            _sum: { totalTt: true },
          })
        )._sum.totalTt ?? 0,
      );

    // Không xác nhận → bị khoá; admin xác nhận → phiếu vào công nợ +6.000 ngày 15/10.
    await expect(createDelivery(body)).rejects.toMatchObject({ code: "cutover_locked" });
    const created = await createDelivery(body, { overrideLocked: true });
    expect(created.ledgerStatus).toBe("posted");
    expect(await adjustSum()).toBe(6000);

    // Xoá: không xác nhận → bị khoá; xác nhận → −6.000, tổng về 0.
    await expect(softDeleteDelivery(created.id, supplier.id)).rejects.toMatchObject({ code: "cutover_locked" });
    await softDeleteDelivery(created.id, supplier.id, { overrideLocked: true });
    expect(await adjustSum()).toBe(0);
    const slip = await prisma.supplierDeliveryDaily.findUniqueOrThrow({ where: { id: created.id } });
    expect(slip.deletedAt).not.toBeNull();
  });
});
