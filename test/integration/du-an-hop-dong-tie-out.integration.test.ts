/**
 * Integration test: nguồn số của màn chi tiết hợp đồng trên Postgres thật, ACL thật (phiên giả lập).
 *  - Sổ vật tư / nhân công: 8 số của màn hợp đồng (dòng sổ + đầu kỳ, cộng theo Chủ thể rồi làm tròn
 *    như báo cáo) bằng Σ dòng `queryDetailReport` của cặp; có nhiễu (đối tác / công trình khác, dòng đã
 *    xóa mềm, dòng thanh toán không có vật tư, dòng lẻ đồng ở Chủ thể thứ hai).
 *  - CĐT: A', B', C' bằng oracle SQL SUM dạng Decimal; hóa đơn điều chỉnh âm được cộng.
 *  - Hợp đồng chưa có dữ liệu: danh sách rỗng, tổng 0. IDOR loader: hợp đồng công trình khác → null.
 *  - Sổ hóa đơn CĐT: trùng (ký hiệu, số) bị từ chối, khác ký hiệu thì được; người đọc không thêm được;
 *    IDOR sửa / xóa.
 *  - Quyền sổ: đọc dự án mà không đọc công nợ vật tư → tổng đúng, không có từng dòng.
 *  - Phiếu vật tư ngày chưa chốt được đếm; chốt rồi thì không.
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

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { queryDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import { loadLedgerOpenings, loadLedgerRows } from "@/lib/du-an/contract-detail/ledger-source";
import { sumByEntityRounded, sumReportRows } from "@/lib/du-an/contract-detail/list-figures";
import { loadContractDetail, loadContractListFigures } from "@/lib/du-an/contract-detail/contract-detail-loader";
import { createCdtInvoice, softDeleteCdtInvoice, updateCdtInvoice } from "@/lib/du-an/cdt-invoice-service";

const ADMIN = "to-admin";
const PROJECT_READER = "to-du-an-reader"; // đọc dự án, không đọc công nợ vật tư
const LEDGER_READER = "to-ledger-reader"; // đọc dự án + công nợ vật tư
const EDITOR = "to-editor"; // sửa dự án P1

type Ledger = "material" | "labor";

interface World {
  p1: number;
  p2: number;
  e1: number;
  e2: number;
  supplierId: number;
  otherSupplierId: number;
  contractorId: number;
  itemId: number;
  categoryId: number;
}

async function seed(): Promise<World> {
  for (const [id, role] of [[ADMIN, "admin"], [PROJECT_READER, "viewer"], [LEDGER_READER, "viewer"], [EDITOR, "viewer"]]) {
    await prisma.user.create({ data: { id, name: id, email: `${id}@test.local`, role } });
  }
  const e1 = await prisma.entity.create({ data: { name: "Cty A", type: "company" } });
  const e2 = await prisma.entity.create({ data: { name: "Cty B", type: "company" } });
  const p1 = await prisma.project.create({ data: { code: "TO-1", name: "Công trình 1", status: "active", entityId: e1.id, contractValue: 5000 } });
  const p2 = await prisma.project.create({ data: { code: "TO-2", name: "Công trình 2", status: "active", entityId: e1.id } });
  for (const [userId, level] of [[PROJECT_READER, "read"], [LEDGER_READER, "read"], [EDITOR, "edit"]]) {
    await prisma.modulePermission.create({ data: { userId, moduleKey: "du-an", level: "edit" } });
    await prisma.projectPermission.create({ data: { userId, projectId: p1.id, level } });
  }
  await prisma.modulePermission.create({ data: { userId: LEDGER_READER, moduleKey: "cong-no-vt", level: "read" } });
  const supplier = await prisma.supplier.create({ data: { name: "Gạch Nam Hương" } });
  const other = await prisma.supplier.create({ data: { name: "NCC khác" } });
  const contractor = await prisma.contractor.create({ data: { name: "Đội anh Tuấn" } });
  const item = await prisma.item.create({ data: { code: "VT-G", name: "Gạch", unit: "viên", type: "material" } });
  const cat = await prisma.projectCategory.create({ data: { projectId: p1.id, code: "HM1", name: "Hạng mục 1" } });
  return {
    p1: p1.id, p2: p2.id, e1: e1.id, e2: e2.id, supplierId: supplier.id, otherSupplierId: other.id,
    contractorId: contractor.id, itemId: item.id, categoryId: cat.id,
  };
}

async function tx(
  w: World, ledgerType: Ledger, type: string, tt: number, hd: number,
  o: { partyId?: number; projectId?: number; entityId?: number; invoiceNo?: string | null; item?: boolean; deleted?: boolean } = {},
) {
  return prisma.ledgerTransaction.create({
    data: {
      ledgerType, transactionType: type, date: new Date("2026-03-01T00:00:00Z"),
      entityId: o.entityId ?? w.e1,
      partyId: o.partyId ?? (ledgerType === "material" ? w.supplierId : w.contractorId),
      projectId: o.projectId ?? w.p1,
      itemId: o.item === false ? null : w.itemId,
      totalTt: tt, totalHd: hd, amountTt: tt, amountHd: hd,
      invoiceNo: o.invoiceNo ?? null,
      deletedAt: o.deleted ? new Date() : null,
    },
  });
}

/** Bộ dòng mẫu (đầu kỳ 1000/900 …, thanh toán không có vật tư) + nhiễu. */
async function seedLedger(w: World, ledgerType: Ledger) {
  const partyId = ledgerType === "material" ? w.supplierId : w.contractorId;
  await prisma.ledgerOpeningBalance.create({
    data: { ledgerType, entityId: w.e1, partyId, projectId: w.p1, balanceTt: 1000, balanceHd: 900, asOfDate: new Date("2026-01-01T00:00:00Z") },
  });
  await tx(w, ledgerType, "lay_hang", 500, 550, { invoiceNo: "HD1" });
  await tx(w, ledgerType, "lay_hang", 300, 0);
  await tx(w, ledgerType, "lay_hang", 200, 220);
  await tx(w, ledgerType, "lay_hang", -50, -50);
  await tx(w, ledgerType, "thue_hd", 30, 0);
  await tx(w, ledgerType, "dieu_chinh", 40, -20);
  await tx(w, ledgerType, "dieu_chinh", -15, 0);
  await tx(w, ledgerType, "thanh_toan", 600, 650, { item: false });
  // Nhiễu: lẻ đồng ở Chủ thể thứ hai, cùng đối tác ở công trình khác, dòng đã xóa mềm.
  await tx(w, ledgerType, "lay_hang", 0.5, 0.5, { entityId: w.e2 });
  await tx(w, ledgerType, "lay_hang", 777, 777, { projectId: w.p2 });
  await tx(w, ledgerType, "lay_hang", 9999, 9999, { deleted: true });
  if (ledgerType === "material") await tx(w, ledgerType, "lay_hang", 888, 888, { partyId: w.otherSupplierId });
}

async function expectTieOut(w: World, ledgerType: Ledger) {
  const partyId = ledgerType === "material" ? w.supplierId : w.contractorId;
  const [rows, openings, report] = await Promise.all([
    loadLedgerRows(ledgerType, partyId, w.p1),
    loadLedgerOpenings(ledgerType, partyId, w.p1),
    queryDetailReport({ ledgerType, showZero: true }),
  ]);
  const canonical = sumReportRows(report.rows.filter((r) => r.partyId === partyId && r.projectId === w.p1));
  expect(sumByEntityRounded([...openings, ...rows])).toEqual(canonical);
  // Dòng lẻ đồng: Chủ thể thứ hai làm tròn riêng 0,5 → 1.
  expect(canonical.phatSinhTt).toBe("1021");
}

const as = (id: string) => mockSession({ id, role: id === ADMIN ? "admin" : "viewer" });

async function contract(w: World, data: Partial<Prisma.ProjectContractUncheckedCreateInput>) {
  return prisma.projectContract.create({ data: { projectId: w.p1, docName: "HĐ", docType: "contract", ...data } });
}

describe("nguồn số màn chi tiết hợp đồng (integration)", () => {
  let w: World;
  beforeEach(async () => {
    clearSession();
    await truncateAll();
    w = await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("sổ vật tư: 8 số khớp báo cáo; màn hợp đồng cộng đúng các danh sách", async () => {
    await seedLedger(w, "material");
    await expectTieOut(w, "material");
    const c = await contract(w, { partyKind: "ncc", supplierId: w.supplierId, valueVnd: 2000, valueTtVnd: 1800 });
    as(ADMIN);
    const d = await loadContractDetail(w.p1, c.id, ADMIN);
    if (!d?.figures || d.figures.partyKind === "cdt") throw new Error("thiếu khối số NCC");
    expect(d.figures.ledger.totals).toMatchObject({ layHang: "1020.5", thueHd: "30", hoaDon: "720.5", chuyenTienTt: "615", chuyenTienHd: "670" });
    expect(d.figures.ledger.debt).toMatchObject({ conPhaiTraTt: "1405.5", conPhaiTraHd: "950.5" });
    expect(d.entityBreakdown).toHaveLength(2);
    const list = await loadContractListFigures(w.p1);
    expect(list[c.id]).toEqual({ debtTt: "1406", groupSize: 1 });
  });

  it("sổ nhân công: 8 số khớp báo cáo", async () => {
    await seedLedger(w, "labor");
    await expectTieOut(w, "labor");
    const c = await contract(w, { partyKind: "doi_thi_cong", contractorId: w.contractorId });
    as(ADMIN);
    const d = await loadContractDetail(w.p1, c.id, ADMIN);
    if (!d?.figures || d.figures.partyKind === "cdt") throw new Error("thiếu khối số đội");
    expect(d.figures.ledger.totals.layHang).toBe("1020.5");
  });

  it("CĐT: A', B', C' bằng oracle SQL SUM (Decimal), hóa đơn âm được cộng", async () => {
    for (const amount of [100, 0]) {
      await prisma.projectAcceptance.create({ data: { projectId: w.p1, categoryId: w.categoryId, checkItem: `NT ${amount}`, amountCdtVnd: amount } });
    }
    await prisma.projectCdtInvoice.create({ data: { projectId: w.p1, invoiceDate: new Date("2026-03-01T00:00:00Z"), invoiceNo: "1", amountVnd: 60, vatVnd: 6 } });
    await prisma.projectCdtInvoice.create({ data: { projectId: w.p1, invoiceDate: new Date("2026-03-02T00:00:00Z"), invoiceNo: "2", amountVnd: -10, vatVnd: -1 } });
    for (const [dir, amount] of [["cdt_to_cty", 70], ["cdt_to_cty", 20], ["cty_to_cdt", 10], ["cty_to_doi", 999]] as const) {
      await prisma.project3WayCashflow.create({
        data: { projectId: w.p1, date: new Date("2026-03-03T00:00:00Z"), flowDirection: dir, category: "thanh_toan", payerName: "A", payeeName: "B", amountVnd: amount },
      });
    }
    const c = await contract(w, { partyKind: "cdt", valueVnd: 4800 });
    as(ADMIN);
    const d = await loadContractDetail(w.p1, c.id, ADMIN);
    if (!d?.figures || d.figures.partyKind !== "cdt") throw new Error("thiếu khối số CĐT");
    const [oracle] = await prisma.$queryRaw<{ a: Prisma.Decimal; b: Prisma.Decimal; c: Prisma.Decimal }[]>`
      SELECT (SELECT SUM("amountCdtVnd") FROM project_acceptances WHERE "projectId" = ${w.p1} AND "deletedAt" IS NULL) AS a,
             (SELECT SUM("amountVnd" + "vatVnd") FROM project_cdt_invoices WHERE "projectId" = ${w.p1} AND "deletedAt" IS NULL) AS b,
             (SELECT SUM(CASE "flowDirection" WHEN 'cdt_to_cty' THEN "amountVnd" ELSE -"amountVnd" END) FROM project_3way_cashflows
               WHERE "projectId" = ${w.p1} AND "deletedAt" IS NULL AND "flowDirection" IN ('cdt_to_cty','cty_to_cdt')) AS c`;
    const cdt = d.figures.cdt;
    expect(new Prisma.Decimal(cdt.nghiemThu).equals(oracle.a)).toBe(true);
    expect(new Prisma.Decimal(cdt.hoaDonXuat).equals(oracle.b)).toBe(true);
    expect(new Prisma.Decimal(cdt.daNhan).equals(oracle.c)).toBe(true);
    expect([cdt.nghiemThu, cdt.hoaDonXuat, cdt.daNhan]).toEqual(["100", "55", "80"]);
    expect(cdt.projectValueMismatch).toBe(true);
    const list = await loadContractListFigures(w.p1);
    expect(list[c.id].debtTt).toBe("20");
  });

  it("hợp đồng đội và CĐT chưa có dữ liệu: danh sách rỗng, tổng 0, không lỗi; IDOR loader trả null", async () => {
    const doi = await contract(w, { partyKind: "doi_thi_cong", contractorId: w.contractorId });
    const cdtC = await contract(w, { partyKind: "cdt" });
    const otherProject = await prisma.projectContract.create({ data: { projectId: w.p2, docName: "HĐ P2", docType: "contract" } });
    as(ADMIN);
    const d1 = await loadContractDetail(w.p1, doi.id, ADMIN);
    if (!d1?.figures || d1.figures.partyKind === "cdt") throw new Error("thiếu khối số đội");
    expect(d1.figures.ledger.lists).toMatchObject({ layHang: [], hoaDon: [], chuyenTien: [] });
    expect(d1.figures.ledger.debt.conPhaiTraTt).toBe("0");
    const d2 = await loadContractDetail(w.p1, cdtC.id, ADMIN);
    if (!d2?.figures || d2.figures.partyKind !== "cdt") throw new Error("thiếu khối số CĐT");
    expect(d2.figures.cdt.lists).toEqual({ nghiemThu: [], hoaDonXuat: [], daNhan: [] });
    expect(d2.figures.cdt.conPhaiThuTheoNghiemThu).toBe("0");
    expect(await loadContractDetail(w.p1, otherProject.id, ADMIN)).toBeNull();
  });

  it("sổ hóa đơn CĐT: trùng (ký hiệu, số) bị từ chối; khác ký hiệu thì được; người đọc không thêm được", async () => {
    as(EDITOR);
    const base = { projectId: w.p1, invoiceDate: "2026-03-01", invoiceNo: "0001", amountVnd: 100, vatVnd: 10 };
    expect(await createCdtInvoice({ ...base, invoiceSymbol: "1C26TAA" })).toEqual({ ok: true, id: expect.any(Number) });
    const dup = await createCdtInvoice({ ...base, invoiceSymbol: " 1C26TAA ", invoiceNo: " 0001 " });
    expect(dup).toEqual({ ok: false, message: "Hóa đơn 1C26TAA 0001 đã có trong sổ (ngày 01/03/2026)" });
    expect((await createCdtInvoice({ ...base, invoiceSymbol: "1C26TBB" })).ok).toBe(true);
    expect((await createCdtInvoice({ ...base, invoiceNo: "0002", amountVnd: -20 })).ok).toBe(true);
    expect(await createCdtInvoice({ ...base, invoiceNo: "0003", amountVnd: 0 })).toMatchObject({ ok: false });
    as(PROJECT_READER);
    expect(await createCdtInvoice({ ...base, invoiceNo: "0009" })).toEqual({ ok: false, message: "Bạn không có quyền thao tác này trên công trình." });
  });

  it("IDOR sổ CĐT: người sửa được P1 không sửa / xóa được hóa đơn của P2", async () => {
    const theirs = await prisma.projectCdtInvoice.create({
      data: { projectId: w.p2, invoiceDate: new Date("2026-03-01T00:00:00Z"), invoiceNo: "X1", amountVnd: 100 },
    });
    as(EDITOR);
    const input = { projectId: w.p1, invoiceDate: "2026-03-01", invoiceNo: "X1", amountVnd: 1 };
    expect(await updateCdtInvoice(theirs.id, input)).toEqual({ ok: false, message: "Không tìm thấy hóa đơn ở công trình này" });
    expect(await softDeleteCdtInvoice(theirs.id, w.p1)).toEqual({ ok: false, message: "Không tìm thấy hóa đơn ở công trình này" });
    expect(await prisma.projectCdtInvoice.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ deletedAt: null, invoiceNo: "X1" });
  });

  it("quyền sổ: đọc dự án mà không đọc công nợ vật tư → tổng đúng, không có từng dòng", async () => {
    await seedLedger(w, "material");
    const c = await contract(w, { partyKind: "ncc", supplierId: w.supplierId });
    as(PROJECT_READER);
    const hidden = await loadContractDetail(w.p1, c.id, PROJECT_READER);
    if (!hidden?.figures || hidden.figures.partyKind === "cdt") throw new Error("thiếu khối số");
    expect(hidden.ledgerDetailHidden).toBe(true);
    expect(hidden.figures.ledger.lists).toBeNull();
    expect(hidden.figures.ledger.totals.layHang).toBe("1020.5");
    as(LEDGER_READER);
    const full = await loadContractDetail(w.p1, c.id, LEDGER_READER);
    if (!full?.figures || full.figures.partyKind === "cdt") throw new Error("thiếu khối số");
    expect(full.ledgerDetailHidden).toBe(false);
    expect(full.figures.ledger.lists?.layHang.length).toBeGreaterThan(0);
  });

  it("phiếu vật tư ngày chưa chốt được đếm; chốt vào sổ rồi thì không", async () => {
    const c = await contract(w, { partyKind: "ncc", supplierId: w.supplierId });
    const slip = await prisma.supplierDeliveryDaily.create({
      data: { supplierId: w.supplierId, projectId: w.p1, date: new Date("2026-03-05T00:00:00Z"), itemId: w.itemId, qty: 10, unit: "viên", unitPrice: 5, totalAmount: 50 },
    });
    as(ADMIN);
    expect((await loadContractDetail(w.p1, c.id, ADMIN))?.pendingDeliveries).toEqual({ count: 1, knownAmount: "50", unpricedCount: 0 });
    await prisma.ledgerTransaction.create({
      data: {
        ledgerType: "material", transactionType: "lay_hang", date: slip.date, entityId: w.e1, partyId: w.supplierId,
        projectId: w.p1, itemId: w.itemId, totalTt: 50, totalHd: 0, deliveryId: slip.id,
      },
    });
    expect((await loadContractDetail(w.p1, c.id, ADMIN))?.pendingDeliveries).toEqual({ count: 0, knownAmount: "0", unpricedCount: 0 });
  });

  it("phiếu lịch sử nằm trong kỳ chuyển đổi của cặp (đã vào sổ qua Nhập Liệu) không bị đếm là chưa chốt", async () => {
    const c = await contract(w, { partyKind: "ncc", supplierId: w.supplierId });
    const run = await prisma.importRun.create({
      data: { fileName: "chuyen-doi.xlsx", fileHash: "h-cutover", adapter: "vat-tu-ky-thang", status: "committed", createdBy: ADMIN, committedAt: new Date() },
    });
    await prisma.supplierReconciliation.create({
      data: {
        supplierId: w.supplierId, projectId: w.p1, importRunId: run.id, signedBySupplier: true,
        periodFrom: new Date("2026-01-01T00:00:00Z"), periodTo: new Date("2026-03-26T00:00:00Z"),
      },
    });
    for (const day of ["2026-03-05", "2026-04-02"]) {
      await prisma.supplierDeliveryDaily.create({
        data: { supplierId: w.supplierId, projectId: w.p1, date: new Date(`${day}T00:00:00Z`), itemId: w.itemId, qty: 1, unit: "viên", totalAmount: 100 },
      });
    }
    as(ADMIN);
    // Chỉ phiếu 02/04 (ngoài kỳ chuyển đổi, chưa có event) được đếm.
    expect((await loadContractDetail(w.p1, c.id, ADMIN))?.pendingDeliveries).toEqual({ count: 1, knownAmount: "100", unpricedCount: 0 });
  });
});
