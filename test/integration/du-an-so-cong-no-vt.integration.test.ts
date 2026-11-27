/**
 * Integration test: tab Công Nợ NCC và Giao Dịch (nguồn "Sổ công nợ vật tư") của Dự án đọc thẳng sổ Công nợ
 * vật tư, trên Postgres thật, ACL thật (phiên giả lập).
 *  (a) 8 số mỗi NCC = Σ dòng báo cáo lũy kế (`queryDetailReport`) của NCC đó ở công trình; lọc NCC thì tổng chỉ
 *      gồm NCC được lọc.
 *  (b) Σ (số dư đầu kỳ + dòng sổ đã nạp), cộng theo Chủ thể rồi làm tròn như báo cáo, khớp (a) → danh sách dòng
 *      đủ; `rowCount` = số dòng đã nạp = số dòng sổ đếm bằng SQL.
 *  (c) Thêm / xóa `project_transactions` không đổi kết quả.
 *  (d) Còn nợ TT của NCC có hợp đồng khớp cột danh mục hợp đồng.
 *  (e) Phiếu chưa chốt theo công trình = Σ theo cặp; NCC chỉ có phiếu chưa chốt có mặt; chốt một phiếu thì nó
 *      rời "chưa chốt" và vào số dư đúng một lần.
 *  (f) Quyền giống tab Hợp đồng: đọc dự án mà không đọc công nợ vật tư → có tổng, không có dòng sổ; công nợ vật
 *      tư chưa phát hành → như trên; không có quyền công trình hoặc mã công trình sai → bị từ chối.
 * Nhiễu: Chủ thể thứ hai lẻ 0,5 đồng, dòng xóa mềm, dòng công trình khác, dòng sổ nhân công, phiếu trước mốc
 * chuyển đổi, phiếu công trình khác.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { authMock, clearSession, mockSession } from "@/test/helpers/session-mock";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { queryDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import { loadPendingDeliveries } from "@/lib/du-an/contract-detail/ledger-source";
import { sumByEntityRounded, sumReportRows, type PairTotals } from "@/lib/du-an/contract-detail/list-figures";
import { loadContractListFigures } from "@/lib/du-an/contract-detail/contract-detail-loader";
import { loadProjectLedger, loadProjectLedgerSwitchInfo, type ProjectLedger } from "@/lib/du-an/project-ledger/project-ledger-loader";

const ADMIN = "sv-admin";
const PROJECT_READER = "sv-du-an-reader"; // đọc dự án P1, không đọc công nợ vật tư
const LEDGER_READER = "sv-ledger-reader"; // đọc dự án P1 + công nợ vật tư
const OUTSIDER = "sv-outsider"; // đọc dự án P2 + công nợ vật tư, không có P1

interface World {
  p1: number;
  p2: number;
  e1: number;
  e2: number;
  gach: number;
  cat: number;
  thep: number;
  anhDuong: number; // chỉ có phiếu chưa chốt
  contractorId: number;
  itemId: number;
  categoryId: number;
  pendingSlipId: number;
}

const DAY = (d: string) => new Date(`${d}T00:00:00Z`);
const as = (id: string) => mockSession({ id, role: id === ADMIN ? "admin" : "viewer" });

async function tx(
  w: World, partyId: number, type: string, tt: number, hd: number,
  o: { projectId?: number; entityId?: number; item?: boolean; deleted?: boolean; ledgerType?: string; deliveryId?: number } = {},
) {
  return prisma.ledgerTransaction.create({
    data: {
      ledgerType: o.ledgerType ?? "material", transactionType: type, date: DAY("2026-03-01"),
      entityId: o.entityId ?? w.e1, partyId, projectId: o.projectId ?? w.p1,
      itemId: o.item === false ? null : w.itemId,
      totalTt: tt, totalHd: hd, amountTt: tt, amountHd: hd,
      deliveryId: o.deliveryId ?? null,
      deletedAt: o.deleted ? new Date() : null,
    },
  });
}

async function slip(w: World, supplierId: number, date: string, amount: number | null, projectId = w.p1) {
  return prisma.supplierDeliveryDaily.create({
    data: { supplierId, projectId, date: DAY(date), itemId: w.itemId, qty: 1, unit: "viên", unitPrice: amount, totalAmount: amount },
  });
}

async function seed(): Promise<World> {
  for (const [id, role] of [[ADMIN, "admin"], [PROJECT_READER, "viewer"], [LEDGER_READER, "viewer"], [OUTSIDER, "viewer"]]) {
    await prisma.user.create({ data: { id, name: id, email: `${id}@test.local`, role } });
  }
  const e1 = await prisma.entity.create({ data: { name: "Cty A", type: "company" } });
  const e2 = await prisma.entity.create({ data: { name: "Cty B", type: "company" } });
  const p1 = await prisma.project.create({ data: { code: "SV-1", name: "Công trình 1", status: "active", entityId: e1.id } });
  const p2 = await prisma.project.create({ data: { code: "SV-2", name: "Công trình 2", status: "active", entityId: e1.id } });
  for (const [userId, projectId] of [[PROJECT_READER, p1.id], [LEDGER_READER, p1.id], [OUTSIDER, p2.id]] as const) {
    await prisma.modulePermission.create({ data: { userId, moduleKey: "du-an", level: "read" } });
    await prisma.projectPermission.create({ data: { userId, projectId, level: "read" } });
  }
  for (const userId of [LEDGER_READER, OUTSIDER]) {
    await prisma.modulePermission.create({ data: { userId, moduleKey: "cong-no-vt", level: "read" } });
  }
  const [gach, cat, thep, anhDuong] = await Promise.all(
    ["Gạch", "Cát", "Thép", "Ánh Dương"].map((name) => prisma.supplier.create({ data: { name } })),
  );
  const contractor = await prisma.contractor.create({ data: { name: "Đội anh Tuấn" } });
  const item = await prisma.item.create({ data: { code: "VT-G", name: "Gạch đặc", unit: "viên", type: "material" } });
  const cat1 = await prisma.projectCategory.create({ data: { projectId: p1.id, code: "HM1", name: "Hạng mục 1" } });
  const w: World = {
    p1: p1.id, p2: p2.id, e1: e1.id, e2: e2.id, gach: gach.id, cat: cat.id, thep: thep.id, anhDuong: anhDuong.id,
    contractorId: contractor.id, itemId: item.id, categoryId: cat1.id, pendingSlipId: 0,
  };

  // Số dư đầu kỳ: Gạch ở Cty A; Thép chỉ có số dư đầu kỳ (Cty B).
  for (const [partyId, entityId, tt, hd] of [[w.gach, w.e1, 1000, 900], [w.thep, w.e2, 700, 0]] as const) {
    await prisma.ledgerOpeningBalance.create({
      data: { ledgerType: "material", entityId, partyId, projectId: w.p1, balanceTt: tt, balanceHd: hd, asOfDate: DAY("2026-01-01") },
    });
  }
  // Gạch: đủ 4 loại, điều chỉnh hai dấu, thanh toán không có vật tư; lẻ 0,5 đồng ở Cty B.
  await tx(w, w.gach, "lay_hang", 500, 550);
  await tx(w, w.gach, "lay_hang", 300, 0);
  await tx(w, w.gach, "thue_hd", 30, 0);
  await tx(w, w.gach, "dieu_chinh", 40, -20);
  await tx(w, w.gach, "dieu_chinh", -15, 0);
  await tx(w, w.gach, "thanh_toan", 600, 650, { item: false });
  await tx(w, w.gach, "lay_hang", 0.5, 0.5, { entityId: w.e2 });
  // Cát: lấy hàng + thanh toán.
  await tx(w, w.cat, "lay_hang", 200, 220);
  await tx(w, w.cat, "thanh_toan", 100, 100, { item: false });
  // Nhiễu: công trình khác, dòng xóa mềm, sổ nhân công cùng công trình.
  await tx(w, w.gach, "lay_hang", 777, 777, { projectId: w.p2 });
  await tx(w, w.gach, "lay_hang", 9999, 9999, { deleted: true });
  await tx(w, w.contractorId, "lay_hang", 555, 555, { ledgerType: "labor" });

  // Mốc chuyển đổi 31/01/2026: phiếu trước mốc không bao giờ là "chưa chốt".
  await prisma.importRun.create({
    data: {
      fileName: "chuyen-doi.xlsx", fileHash: "h-sv-cutover", adapter: "vat-tu-chuyen-doi", status: "committed",
      createdBy: ADMIN, committedAt: new Date(), reviewJson: { expected: { cutoverDate: "2026-01-31" } },
    },
  });
  await slip(w, w.gach, "2026-01-15", 70); // trước mốc
  const pending = await slip(w, w.gach, "2026-03-05", 50); // chưa chốt, có giá
  w.pendingSlipId = pending.id;
  const settled = await slip(w, w.gach, "2026-03-06", 60); // đã chốt vào sổ
  await tx(w, w.gach, "lay_hang", 60, 0, { deliveryId: settled.id });
  await slip(w, w.cat, "2026-03-07", null); // chưa chốt, chưa có giá
  await slip(w, w.anhDuong, "2026-03-08", 40); // NCC chỉ có phiếu chưa chốt
  await slip(w, w.gach, "2026-03-09", 80, w.p2); // công trình khác

  // Sổ dự án mang tên NCC: không bao giờ được cộng vào.
  await prisma.projectTransaction.create({
    data: {
      projectId: w.p1, date: DAY("2026-03-01"), transactionType: "lay_hang", categoryId: w.categoryId, itemCode: "VT-G",
      itemName: "Gạch", partyName: "Gạch", qty: 10, unit: "viên", amountTt: 123456, amountHd: 123456,
    },
  });
  return w;
}

const PAIR_KEYS = ["openingTt", "phatSinhTt", "daTraTt", "cuoiKyTt", "openingHd", "phatSinhHd", "daTraHd", "cuoiKyHd"] as const;
const pick = (x: PairTotals): PairTotals => Object.fromEntries(PAIR_KEYS.map((k) => [k, x[k]])) as unknown as PairTotals;

async function canonicalFor(projectId: number, partyId?: number): Promise<PairTotals> {
  const report = await queryDetailReport({ ledgerType: "material", showZero: true });
  return sumReportRows(report.rows.filter((r) => r.projectId === projectId && (partyId == null || r.partyId === partyId)));
}

/** Σ (đầu kỳ + dòng sổ đã nạp) của một NCC, cộng theo Chủ thể rồi làm tròn như báo cáo. */
function fromLoadedRows(r: ProjectLedger, supplierId: number): PairTotals {
  return sumByEntityRounded([
    ...(r.openings ?? []).filter((o) => o.supplierId === supplierId),
    ...(r.rows ?? []).filter((x) => x.supplierId === supplierId),
  ]);
}

async function sqlRowCount(projectId: number): Promise<number> {
  const [row] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM ledger_transactions
     WHERE "ledgerType" = 'material' AND "projectId" = ${projectId} AND "deletedAt" IS NULL`;
  return Number(row.n);
}

describe("Dự án đọc sổ Công nợ vật tư (integration)", () => {
  let w: World;
  beforeEach(async () => {
    clearSession();
    await truncateAll();
    w = await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("(a)(b) công nợ từng NCC = Σ dòng báo cáo; dòng sổ nạp đủ; tổng = Σ công trình", async () => {
    as(ADMIN);
    const r = await loadProjectLedger(w.p1, { withRows: true });
    expect(r.rowsVisible).toBe(true);
    expect(r.suppliers.map((s) => s.supplierName)).toEqual(["Ánh Dương", "Cát", "Gạch", "Thép"]);
    for (const s of r.suppliers) {
      expect(pick(s), `NCC #${s.supplierId}`).toEqual(await canonicalFor(w.p1, s.supplierId));
      expect(fromLoadedRows(r, s.supplierId), `dòng sổ NCC #${s.supplierId}`).toEqual(pick(s));
    }
    expect(r.totals).toEqual(await canonicalFor(w.p1));
    const gach = r.suppliers.find((s) => s.supplierId === w.gach)!;
    // Cty A: 500 + 300 + 30 + 40 + 60 (phiếu đã chốt) = 930; Cty B lẻ 0,5 làm tròn riêng → 1.
    expect(gach).toMatchObject({ openingTt: "1000", phatSinhTt: "931", daTraTt: "615", cuoiKyTt: "1316" });
    expect(r.suppliers.find((s) => s.supplierId === w.thep)).toMatchObject({ openingTt: "700", phatSinhTt: "0", cuoiKyTt: "700" });
    expect(r.rowCount).toBe(r.rows?.length);
    expect(r.rowCount).toBe(await sqlRowCount(w.p1));
    expect(r.rowCount).toBe(10);
    expect(r.openings?.map((o) => [o.supplierName, o.entityName, o.openingTt])).toEqual([
      ["Gạch", "Cty A", "1000"],
      ["Thép", "Cty B", "700"],
    ]);
    expect(await loadProjectLedgerSwitchInfo(w.p1)).toEqual({ rowsVisible: true, rowCount: 10 });
  });

  it("(a) lọc NCC: chỉ NCC được lọc, tổng chỉ gồm NCC đó; lựa chọn bộ lọc vẫn đủ", async () => {
    as(ADMIN);
    const r = await loadProjectLedger(w.p1, { withRows: true, supplierIds: [w.cat, 2147483000] });
    expect(r.suppliers.map((s) => s.supplierId)).toEqual([w.cat]);
    expect(r.totals).toEqual(await canonicalFor(w.p1, w.cat));
    expect(r.totals.cuoiKyTt).toBe("100");
    expect(r.pending).toEqual({ count: 1, unpricedCount: 1 });
    expect(new Set(r.rows?.map((x) => x.supplierId))).toEqual(new Set([w.cat]));
    expect(r.openings).toEqual([]);
    expect(r.options).toHaveLength(4);
  });

  it("NCC đã xóa mềm khỏi danh mục: số vẫn đọc từ sổ, được đánh dấu để không mở trang sổ NCC", async () => {
    await prisma.supplier.update({ where: { id: w.thep }, data: { deletedAt: new Date() } });
    as(ADMIN);
    const r = await loadProjectLedger(w.p1, { withRows: false });
    expect(r.suppliers.find((s) => s.supplierId === w.thep)).toMatchObject({ supplierDeleted: true, cuoiKyTt: "700" });
    expect(r.suppliers.filter((s) => s.supplierDeleted).map((s) => s.supplierId)).toEqual([w.thep]);
  });

  it("(c) thêm / xóa giao dịch sổ dự án không đổi kết quả", async () => {
    as(ADMIN);
    const before = await loadProjectLedger(w.p1, { withRows: true });
    const extra = await prisma.projectTransaction.create({
      data: {
        projectId: w.p1, date: DAY("2026-03-02"), transactionType: "lay_hang", categoryId: w.categoryId, itemCode: "VT-C",
        itemName: "Cát", partyName: "Cát", qty: 5, unit: "m3", amountTt: 999999, amountHd: 999999,
      },
    });
    expect(await loadProjectLedger(w.p1, { withRows: true })).toEqual(before);
    await prisma.projectTransaction.update({ where: { id: extra.id }, data: { deletedAt: new Date() } });
    expect(await loadProjectLedger(w.p1, { withRows: true })).toEqual(before);
  });

  it("(d) Còn nợ TT của NCC có hợp đồng khớp cột danh mục hợp đồng", async () => {
    const c = await prisma.projectContract.create({
      data: { projectId: w.p1, docName: "HĐ Gạch", docType: "contract", partyKind: "ncc", supplierId: w.gach },
    });
    as(ADMIN);
    const r = await loadProjectLedger(w.p1, { withRows: false });
    const list = await loadContractListFigures(w.p1);
    expect(list[c.id].debtTt).toBe(r.suppliers.find((s) => s.supplierId === w.gach)!.cuoiKyTt);
  });

  it("(e) phiếu chưa chốt: = Σ theo cặp; NCC chỉ có phiếu chưa chốt có mặt; chốt rồi vào số dư đúng một lần", async () => {
    as(ADMIN);
    const r = await loadProjectLedger(w.p1, { withRows: true });
    let byPair = 0;
    for (const id of [w.gach, w.cat, w.thep, w.anhDuong]) byPair += (await loadPendingDeliveries(id, w.p1)).count;
    expect(r.pending.count).toBe(byPair);
    expect(r.pending).toEqual({ count: 3, unpricedCount: 1 });
    const anh = r.suppliers.find((s) => s.supplierId === w.anhDuong)!;
    expect(anh).toMatchObject({ phatSinhTt: "0", cuoiKyTt: "0", cuoiKyHd: "0", pendingCount: 1, unpricedCount: 0 });
    expect(r.suppliers.find((s) => s.supplierId === w.gach)).toMatchObject({ pendingCount: 1 });

    await tx(w, w.gach, "lay_hang", 50, 0, { deliveryId: w.pendingSlipId });
    const after = await loadProjectLedger(w.p1, { withRows: true });
    expect(after.pending).toEqual({ count: 2, unpricedCount: 1 });
    const gachBefore = r.suppliers.find((s) => s.supplierId === w.gach)!;
    const gachAfter = after.suppliers.find((s) => s.supplierId === w.gach)!;
    expect(gachAfter.pendingCount).toBe(0);
    expect(Number(gachAfter.phatSinhTt) - Number(gachBefore.phatSinhTt)).toBe(50);
    expect(Number(gachAfter.cuoiKyTt) - Number(gachBefore.cuoiKyTt)).toBe(50);
    expect(after.rowCount).toBe((r.rowCount ?? 0) + 1);
  });

  it("(f) đọc dự án mà không đọc công nợ vật tư: có tổng như tab Hợp đồng, không có dòng sổ", async () => {
    as(ADMIN);
    const full = await loadProjectLedger(w.p1, { withRows: true });
    as(PROJECT_READER);
    const hidden = await loadProjectLedger(w.p1, { withRows: true });
    expect(hidden.rowsVisible).toBe(false);
    expect(hidden.suppliers).toEqual(full.suppliers);
    expect(hidden.totals).toEqual(full.totals);
    expect(hidden.pending).toEqual(full.pending);
    expect(hidden).not.toHaveProperty("rows");
    expect(hidden).not.toHaveProperty("openings");
    expect(hidden).not.toHaveProperty("rowCount");
    expect(await loadProjectLedgerSwitchInfo(w.p1)).toEqual({ rowsVisible: false });

    as(LEDGER_READER);
    const shown = await loadProjectLedger(w.p1, { withRows: true });
    expect(shown.rowsVisible).toBe(true);
    expect(shown.rows).toEqual(full.rows);
  });

  it("(f) công nợ vật tư chưa phát hành: người thường chỉ thấy tổng; admin vẫn thấy dòng sổ", async () => {
    await prisma.moduleAvailability.update({ where: { moduleKey: "cong-no-vt" }, data: { status: "development" } });
    as(LEDGER_READER);
    const r = await loadProjectLedger(w.p1, { withRows: true });
    expect(r.rowsVisible).toBe(false);
    expect(r).not.toHaveProperty("rows");
    expect(r.suppliers).toHaveLength(4);
    as(ADMIN);
    expect((await loadProjectLedger(w.p1, { withRows: true })).rowsVisible).toBe(true);
  });

  it("(f) không có quyền công trình hoặc mã công trình sai → bị từ chối, không lộ công trình khác", async () => {
    as(OUTSIDER);
    await expect(loadProjectLedger(w.p1, { withRows: true })).rejects.toThrow();
    await expect(loadProjectLedgerSwitchInfo(w.p1)).rejects.toThrow();
    const own = await loadProjectLedger(w.p2, { withRows: true });
    expect(own.suppliers.map((s) => s.supplierId)).toEqual([w.gach]);
    expect(own.totals.phatSinhTt).toBe("777");
    as(ADMIN);
    for (const bad of [0, -1, w.p1 + 0.5]) {
      await expect(loadProjectLedger(bad, { withRows: true })).rejects.toThrow("Mã công trình không hợp lệ");
    }
  });
});
