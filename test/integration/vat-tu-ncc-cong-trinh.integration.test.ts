/**
 * Integration test: cửa vào theo công trình (vat-tu-ncc).
 * Dữ liệu:
 *   Chủ thể E1, E2. NCC A (Bê tông HP), B (Thép Hoà Phát).
 *   Công trình X (E1), Y (E1), Z (chưa gán Chủ thể), W (E1, chưa có dữ liệu vật tư).
 *   A×X: phiếu 10/10 18 m³ + 12/10 2 m³, chốt kỳ 27/09→26/10 giá 1.610.000 → 32.200.000; trả 5.000.000 ngày 02/11.
 *   A×Y: phiếu 12/10 0,5 ca (chưa chốt). A×Z: phiếu 14/10 1 m³ (chưa chốt).
 *   B×X: phiếu 15/10 1 m³ (chưa chốt); số dư ban đầu TT 1.000.000 / HĐ 400.000 hết 26/09.
 * Kiểm:
 *   - Số dư từng cặp trên trang công trình = queryDetailReport (A×X 27.200.000; B×X 1.000.000 / 400.000).
 *   - listDeliveries(s, {projectId}) và vật tư tháng theo cặp chỉ gồm phiếu của cặp.
 *   - Người không có quyền cong-no-vt: listPairsOfProject không trả số nợ.
 *   - Đổi entityId của công trình đã có phiếu bị từ chối; gán lần đầu (đang NULL) thì được.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { authMock, mockSession } from "@/test/helpers/session-mock";

// React cache() chỉ là passthrough ngoài RSC — mỗi lần gọi đọc lại quyền từ DB.
vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn().mockResolvedValue({ userId: "ct-admin", role: "admin" }),
}));
vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: vi.fn().mockResolvedValue("ct-admin"),
}));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { queryDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import { createMaterialTransaction } from "@/lib/cong-no-vt/material-ledger-service";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { commitPeriodClose } from "@/lib/vat-tu-ncc/period-close-service";
import { listReconciliationsDerived, signReconciliation } from "@/lib/vat-tu-ncc/reconciliation-derive-service";
import { listDeliveries, listDeliveriesMonthly } from "@/lib/vat-tu-ncc/delivery-service";
import {
  listPairsOfProject,
  listProjectsWithMaterial,
  listSupplierProjects,
} from "@/lib/vat-tu-ncc/project-overview-service";
import { patchProject, patchProjectEntity } from "@/lib/master-data/project-service";

const ADMIN_ID = "ct-admin";
const VIEWER_ID = "ct-viewer";
const K = { from: "2026-09-27", to: "2026-10-26" };

async function seed() {
  await prisma.user.create({
    data: { id: ADMIN_ID, name: "Kế toán công trình", email: "ct-admin@test.local", role: "admin", isDirector: true },
  });
  // Vai trò không có dòng RolePermission nào → quyền chỉ đến từ ModulePermission của từng người.
  await prisma.user.create({
    data: { id: VIEWER_ID, name: "Cán bộ vật tư", email: "ct-viewer@test.local", role: "ct-no-defaults" },
  });
  await prisma.modulePermission.create({ data: { userId: VIEWER_ID, moduleKey: "vat-tu-ncc", level: "read" } });

  const e1 = await prisma.entity.create({ data: { name: "Công ty CP Xây dựng Ngô Quyền", type: "company" } });
  const e2 = await prisma.entity.create({ data: { name: "Công ty Quản Lý", type: "company" } });
  const supplierA = await prisma.supplier.create({ data: { name: "Bê tông HP" } });
  const supplierB = await prisma.supplier.create({ data: { name: "Thép Hoà Phát" } });
  const projectX = await prisma.project.create({ data: { code: "TC", name: "Trại Chuối", entityId: e1.id } });
  const projectY = await prisma.project.create({ data: { code: "DCX", name: "Đường Cao Xanh", entityId: e1.id } });
  const projectZ = await prisma.project.create({ data: { code: "TL", name: "Tiên Lãng (SH)" } });
  const projectW = await prisma.project.create({ data: { code: "VU", name: "Việt Úc", entityId: e1.id } });
  const concrete = await prisma.item.create({
    data: { code: "BT-M300", name: "Bê tông M300", unit: "m3", type: "material" },
  });
  const pump = await prisma.item.create({ data: { code: "MAY-BOM", name: "Máy bơm", unit: "ca", type: "machine" } });

  const d = (supplierId: number, projectId: number, date: string, itemId: number, qty: number, unit: string) =>
    prisma.supplierDeliveryDaily.create({ data: { supplierId, projectId, date: new Date(date), itemId, qty, unit } });
  const ax1 = await d(supplierA.id, projectX.id, "2026-10-10", concrete.id, 18, "m3");
  const ax2 = await d(supplierA.id, projectX.id, "2026-10-12", concrete.id, 2, "m3");
  const ay = await d(supplierA.id, projectY.id, "2026-10-12", pump.id, 0.5, "ca");
  const az = await d(supplierA.id, projectZ.id, "2026-10-14", concrete.id, 1, "m3");
  const bx = await d(supplierB.id, projectX.id, "2026-10-15", concrete.id, 1, "m3");
  await prisma.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: e1.id,
      partyId: supplierB.id,
      projectId: projectX.id,
      balanceTt: 1_000_000,
      balanceHd: 400_000,
      asOfDate: new Date("2026-09-26"),
    },
  });

  mockSession({ id: ADMIN_ID, role: "admin" });
  return { e1, e2, supplierA, supplierB, projectX, projectY, projectZ, projectW, concrete, pump, ax1, ax2, ay, az, bx };
}

/** Chốt kỳ A×X và ghi một khoản trả A×X — dùng đúng đường ghi của module. */
async function postLedger(ids: Awaited<ReturnType<typeof seed>>) {
  await commitPeriodClose(ids.supplierA.id, ids.projectX.id, K, [
    { deliveryId: ids.ax1.id, unitPrice: 1_610_000 },
    { deliveryId: ids.ax2.id, unitPrice: 1_610_000 },
  ]);
  await createMaterialTransaction({
    date: "2026-11-02",
    transactionType: "thanh_toan",
    entityId: ids.e1.id,
    partyId: ids.supplierA.id,
    projectId: ids.projectX.id,
    amountTt: "5000000",
    vatPctTt: "0",
    amountHd: "0",
    vatPctHd: "0",
    status: "pending",
  });
}

describe("vat-tu-ncc theo công trình (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
    vi.mocked(requireReleasedModuleRequest).mockResolvedValue({ userId: ADMIN_ID, role: "admin" });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("số nợ từng cặp trên trang công trình = queryDetailReport", async () => {
    const ids = await seed();
    await postLedger(ids);

    const result = await listPairsOfProject(ids.projectX.id, { includeDebt: true });
    expect(result?.debtVisible).toBe(true);
    expect(result?.project).toMatchObject({ code: "TC", entityName: "Công ty CP Xây dựng Ngô Quyền" });

    const report = await queryDetailReport({
      ledgerType: "material",
      projectIds: [ids.projectX.id],
      to: toBusinessDateUtc(new Date()),
      showZero: true,
    });
    const sum = (partyId: number, key: "cuoiKyTt" | "cuoiKyHd") =>
      report.rows.filter((r) => r.partyId === partyId).reduce((acc, r) => acc + Number(r[key]), 0);

    const byId = new Map(result!.pairs.map((p) => [p.supplierId, p]));
    expect(byId.size).toBe(2);
    for (const supplierId of [ids.supplierA.id, ids.supplierB.id]) {
      const debt = byId.get(supplierId)!.debt!;
      expect(Number(debt.tt)).toBe(sum(supplierId, "cuoiKyTt"));
      expect(Number(debt.hd)).toBe(sum(supplierId, "cuoiKyHd"));
    }
    // Neo số cụ thể: 18 + 2 m³ × 1.610.000 − 5.000.000; B×X chỉ có số dư ban đầu.
    expect(byId.get(ids.supplierA.id)!.debt).toEqual({ tt: "27200000", hd: "0" });
    expect(byId.get(ids.supplierB.id)!.debt).toEqual({ tt: "1000000", hd: "400000" });

    // Số phiếu, kỳ gần nhất của cặp: khoản trả 02/11 tự tạo kỳ tháng 27/10 – 26/11 (chưa ký), ký → đã ký.
    expect(byId.get(ids.supplierA.id)).toMatchObject({
      deliveryCount: 2,
      lastDeliveryDate: "2026-10-12",
      latestPeriod: { periodFrom: "2026-10-27", periodTo: "2026-11-26", status: "unsigned" },
    });
    expect(byId.get(ids.supplierB.id)).toMatchObject({ deliveryCount: 1, latestPeriod: null });
    const [marker] = await listReconciliationsDerived(ids.supplierA.id, ids.projectX.id);
    await signReconciliation(marker.id);
    const afterSign = await listPairsOfProject(ids.projectX.id, { includeDebt: true });
    expect(afterSign?.pairs.find((p) => p.supplierId === ids.supplierA.id)?.latestPeriod?.status).toBe("signed");
  });

  it("danh sách công trình có hoạt động vật tư và công trình của NCC", async () => {
    const ids = await seed();
    await postLedger(ids);

    const projects = await listProjectsWithMaterial();
    expect(projects.map((p) => p.code)).toEqual(["DCX", "TC", "TL"]); // W chưa có dữ liệu → không hiện
    const x = projects.find((p) => p.id === ids.projectX.id);
    expect(x).toMatchObject({ supplierCount: 2, deliveryCount: 3, lastDeliveryDate: "2026-10-15" });
    expect(projects.find((p) => p.id === ids.projectZ.id)?.entityName).toBeNull();

    const ofA = await listSupplierProjects(ids.supplierA.id);
    expect(ofA.map((p) => p.code)).toEqual(["DCX", "TC", "TL"]);
    const ofB = await listSupplierProjects(ids.supplierB.id);
    expect(ofB.map((p) => p.code)).toEqual(["TC"]);
  });

  it("listDeliveries và vật tư tháng theo cặp chỉ gồm phiếu của cặp", async () => {
    const ids = await seed();

    const xOnly = await listDeliveries(ids.supplierA.id, { projectId: ids.projectX.id });
    expect(xOnly.map((r) => r.id).sort()).toEqual([ids.ax1.id, ids.ax2.id].sort());
    expect(xOnly.every((r) => r.projectId === ids.projectX.id)).toBe(true);
    const all = await listDeliveries(ids.supplierA.id);
    expect(all).toHaveLength(4);

    const monthlyX = await listDeliveriesMonthly(ids.supplierA.id, { projectId: ids.projectX.id });
    expect(monthlyX).toHaveLength(1);
    expect(monthlyX[0]).toMatchObject({ item_id: ids.concrete.id, unit: "m3" });
    expect(Number(monthlyX[0].qty)).toBe(20);
    const monthlyY = await listDeliveriesMonthly(ids.supplierA.id, { projectId: ids.projectY.id });
    expect(monthlyY.map((r) => [r.item_id, Number(r.qty)])).toEqual([[ids.pump.id, 0.5]]);
  });

  it("không có quyền đọc cong-no-vt thì listPairsOfProject không trả số nợ", async () => {
    const ids = await seed();
    await postLedger(ids);

    vi.mocked(requireReleasedModuleRequest).mockResolvedValue({ userId: VIEWER_ID, role: "ct-no-defaults" });
    const denied = await listPairsOfProject(ids.projectX.id, { includeDebt: true });
    expect(denied?.debtVisible).toBe(false);
    expect(denied?.pairs).toHaveLength(2);
    expect(denied?.pairs.every((p) => p.debt === null)).toBe(true);

    // Đối chứng: cấp quyền đọc cong-no-vt thì thấy số nợ.
    await prisma.modulePermission.create({ data: { userId: VIEWER_ID, moduleKey: "cong-no-vt", level: "read" } });
    const granted = await listPairsOfProject(ids.projectX.id, { includeDebt: true });
    expect(granted?.debtVisible).toBe(true);
    expect(granted?.pairs.find((p) => p.supplierId === ids.supplierA.id)?.debt?.tt).toBe("27200000");
  });

  it("đổi Chủ thể của công trình đã có dữ liệu vật tư bị từ chối; gán lần đầu thì được", async () => {
    const ids = await seed();

    // X đã có phiếu → không đổi E1 → E2, cũng không bỏ gán.
    await expect(patchProject(ids.projectX.id, { entityId: ids.e2.id })).rejects.toThrow(/Không thể đổi Chủ thể.*phiếu/);
    await expect(patchProject(ids.projectX.id, { entityId: null })).rejects.toThrow(/Không thể đổi Chủ thể/);
    const refused = await patchProjectEntity(ids.projectX.id, ids.e2.id);
    expect(refused.ok).toBe(false);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: ids.projectX.id } })).entityId).toBe(ids.e1.id);
    // Giữ nguyên Chủ thể thì không bị chặn.
    await expect(patchProject(ids.projectX.id, { entityId: ids.e1.id })).resolves.toMatchObject({ entityId: ids.e1.id });

    // Z chưa gán (dù đã có phiếu) → gán lần đầu được; sau đó đổi tiếp thì bị chặn.
    await expect(patchProject(ids.projectZ.id, { entityId: ids.e2.id })).resolves.toMatchObject({ entityId: ids.e2.id });
    await expect(patchProject(ids.projectZ.id, { entityId: ids.e1.id })).rejects.toThrow(/Không thể đổi Chủ thể/);

    // W chưa có dữ liệu vật tư → đổi tự do.
    await expect(patchProjectEntity(ids.projectW.id, ids.e2.id)).resolves.toEqual({ ok: true });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: ids.projectW.id } })).entityId).toBe(ids.e2.id);

    // Số dư ban đầu vật tư cũng khoá đổi Chủ thể (B×X đã có — X đã bị chặn ở trên; thử trên Y sau khi xoá phiếu).
    await prisma.supplierDeliveryDaily.update({ where: { id: ids.ay.id }, data: { deletedAt: new Date() } });
    await expect(patchProject(ids.projectY.id, { entityId: ids.e2.id })).resolves.toMatchObject({ entityId: ids.e2.id });
    await prisma.ledgerOpeningBalance.create({
      data: {
        ledgerType: "material",
        entityId: ids.e2.id,
        partyId: ids.supplierA.id,
        projectId: ids.projectY.id,
        balanceTt: 500_000,
        balanceHd: 0,
        asOfDate: new Date("2026-09-26"),
      },
    });
    await expect(patchProject(ids.projectY.id, { entityId: ids.e1.id })).rejects.toThrow(/số dư ban đầu vật tư/);
  });
});
