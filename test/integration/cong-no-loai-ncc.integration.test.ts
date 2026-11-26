/**
 * Integration test: bộ lọc Loại NCC (vật tư / nhân công) trên báo cáo công nợ vật tư, DB test thật.
 *
 * Bất biến cần giữ: tổng "Vật tư" + tổng "Nhân công" = tổng "Tất cả" trên cả bốn nguồn số
 * (ma trận NCC × Chủ thể, tổng hợp theo công trình, báo cáo tháng, chi tiết), kể cả số dư đầu kỳ
 * và NCC đã xoá mềm; loại chưa có NCC nào trả rỗng, không bao giờ trả toàn bộ.
 *
 * Fixture (một Chủ thể, một công trình):
 *   - NCC vật tư A: lay_hang 2026-01-10 10tr, thanh_toan 2026-02-01 4tr.
 *   - NCC nhân công B: số dư ban đầu TT 7tr / HĐ 6tr (asOf 31/12/2025), lay_hang 2026-01-15 3tr.
 *   - NCC nhân công C đã xoá mềm: lay_hang 2026-01-20 2tr.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn().mockResolvedValue({
    userId: "integration-admin",
    role: "admin",
  }),
}));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { getMaterialDebtMatrix, getMaterialWindowReport } from "@/lib/cong-no-vt/material-ledger-service";
import { getMaterialDetailReport } from "@/lib/cong-no-vt/material-detail-report-service";
import { getProjectDebtSummary } from "@/lib/cong-no-vt/project-debt-summary-service";
import { resolveSupplierKindFilter, supplierIdsOfKind } from "@/lib/master-data/supplier-kind-query";
import type { SupplierKind } from "@/lib/master-data/supplier-kind";

const YEAR_2026 = { from: "2026-01-01", to: "2026-12-31" };

interface Seeded {
  entityId: number;
  a: number;
  b: number;
  c: number;
}

async function seed(): Promise<Seeded> {
  const entity = await prisma.entity.create({ data: { name: "Cty Quản Lý", type: "company" } });
  const project = await prisma.project.create({
    data: { code: "P-1", name: "Công trình 1", status: "active", entityId: entity.id },
  });
  const a = await prisma.supplier.create({ data: { name: "NCC A" } });
  const b = await prisma.supplier.create({ data: { name: "NCC B", kind: "nhan_cong" } });
  const c = await prisma.supplier.create({ data: { name: "NCC C", kind: "nhan_cong" } });

  const tx = (partyId: number, transactionType: "lay_hang" | "thanh_toan", date: string, total: number) =>
    prisma.ledgerTransaction.create({
      data: {
        ledgerType: "material",
        date: new Date(`${date}T00:00:00.000Z`),
        transactionType,
        entityId: entity.id,
        partyId,
        projectId: project.id,
        amountTt: total,
        totalTt: total,
        amountHd: total,
        totalHd: total,
      },
    });

  await tx(a.id, "lay_hang", "2026-01-10", 10_000_000);
  await tx(a.id, "thanh_toan", "2026-02-01", 4_000_000);
  await prisma.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: entity.id,
      partyId: b.id,
      projectId: project.id,
      balanceTt: 7_000_000,
      balanceHd: 6_000_000,
      asOfDate: new Date("2025-12-31T00:00:00.000Z"),
    },
  });
  await tx(b.id, "lay_hang", "2026-01-15", 3_000_000);
  await tx(c.id, "lay_hang", "2026-01-20", 2_000_000);
  // NCC đã xoá mềm vẫn được cộng vào báo cáo, nên bộ lọc loại phải giữ nó.
  await prisma.supplier.update({ where: { id: c.id }, data: { deletedAt: new Date() } });

  return { entityId: entity.id, a: a.id, b: b.id, c: c.id };
}

const KINDS: (SupplierKind | null)[] = [null, "vat_tu", "nhan_cong"];

/** Σ cuối kỳ TT / HĐ của ma trận NCC × Chủ thể. */
async function matrixTotals(kind: SupplierKind | null) {
  const f = await resolveSupplierKindFilter(kind);
  const rows = f.empty
    ? []
    : await getMaterialDebtMatrix({ ...YEAR_2026, ...(f.partyIds ? { partyIds: f.partyIds } : {}) });
  return {
    parties: rows.map((r) => r.partyId).sort(),
    closeTt: rows.reduce((s, r) => s + r.totals.closeTt, 0),
    openTt: rows.reduce((s, r) => s + r.totals.openTt, 0),
    closeHd: rows.reduce((s, r) => s + r.totals.closeHd, 0),
  };
}

async function projectTotals(kind: SupplierKind | null) {
  const { pivot } = await getProjectDebtSummary({ ...YEAR_2026, groupBy: "ncc", ...(kind ? { loai: kind } : {}) });
  return { openingTt: pivot.total.openingTt, cuoiKyTt: pivot.total.cuoiKyTt, cuoiKyHd: pivot.total.cuoiKyHd };
}

async function windowTotals(kind: SupplierKind | null, entityId: number) {
  const f = await resolveSupplierKindFilter(kind);
  const rows = await getMaterialWindowReport(YEAR_2026, entityId, f.partyIds);
  return {
    parties: rows.map((r) => r.partyId).sort(),
    closingTt: rows.reduce((s, r) => s + r.closingTt.toNumber(), 0),
    openingTt: rows.reduce((s, r) => s + r.openingTt.toNumber(), 0),
  };
}

async function detailTotals(kind: SupplierKind | null) {
  const f = await resolveSupplierKindFilter(kind);
  const { rows } = await getMaterialDetailReport({
    ...YEAR_2026,
    ...(f.partyIds ? { partyIds: f.partyIds } : {}),
    showZero: false,
  });
  return {
    parties: rows.map((r) => r.partyId).sort(),
    openingTt: rows.reduce((s, r) => s + Number(r.openingTt), 0),
    cuoiKyTt: rows.reduce((s, r) => s + Number(r.cuoiKyTt), 0),
    cuoiKyHd: rows.reduce((s, r) => s + Number(r.cuoiKyHd), 0),
  };
}

function expectSplitAddsUp<T extends Record<string, unknown>>(all: T, vatTu: T, nhanCong: T, keys: (keyof T)[]) {
  for (const key of keys) {
    expect(Number(vatTu[key]) + Number(nhanCong[key]), String(key)).toBe(Number(all[key]));
  }
}

describe("Loại NCC trên báo cáo công nợ vật tư (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("supplierIdsOfKind gồm cả NCC đã xoá mềm; NCC mới mặc định là vật tư", async () => {
    const s = await seed();
    expect(await supplierIdsOfKind("vat_tu")).toEqual([s.a]);
    expect(await supplierIdsOfKind("nhan_cong")).toEqual([s.b, s.c]);
  });

  it("CSDL từ chối loại ngoài vat_tu / nhan_cong", async () => {
    await expect(prisma.supplier.create({ data: { name: "NCC X", kind: "dich_vu" } })).rejects.toThrow();
  });

  it("ma trận NCC × Chủ thể: Vật tư + Nhân công = Tất cả, kể cả số dư đầu kỳ", async () => {
    const s = await seed();
    const [all, vatTu, nhanCong] = await Promise.all(KINDS.map(matrixTotals));
    expect(all.parties).toEqual([s.a, s.b, s.c]);
    expect(vatTu.parties).toEqual([s.a]);
    expect(nhanCong.parties).toEqual([s.b, s.c]);
    expect(nhanCong.openTt).toBe(7_000_000);
    expectSplitAddsUp(all, vatTu, nhanCong, ["closeTt", "openTt", "closeHd"]);
  });

  it("tổng hợp theo công trình: Vật tư + Nhân công = Tất cả", async () => {
    await seed();
    const [all, vatTu, nhanCong] = await Promise.all(KINDS.map(projectTotals));
    expect(nhanCong.openingTt).toBe(7_000_000);
    expect(nhanCong.cuoiKyTt).toBe(12_000_000);
    expectSplitAddsUp(all, vatTu, nhanCong, ["openingTt", "cuoiKyTt", "cuoiKyHd"]);
  });

  it("báo cáo tháng (cửa sổ): Vật tư + Nhân công = Tất cả", async () => {
    const s = await seed();
    const [all, vatTu, nhanCong] = await Promise.all(KINDS.map((k) => windowTotals(k, s.entityId)));
    expect(vatTu.parties).toEqual([s.a]);
    expect(nhanCong.parties).toEqual([s.b, s.c]);
    expectSplitAddsUp(all, vatTu, nhanCong, ["closingTt", "openingTt"]);
  });

  it("chi tiết (Chủ thể × NCC × công trình): Vật tư + Nhân công = Tất cả, kể cả số dư đầu kỳ", async () => {
    const s = await seed();
    const [all, vatTu, nhanCong] = await Promise.all(KINDS.map(detailTotals));
    expect(all.parties).toEqual([s.a, s.b, s.c]);
    expect(nhanCong.parties).toEqual([s.b, s.c]);
    expect(nhanCong.openingTt).toBe(7_000_000);
    expectSplitAddsUp(all, vatTu, nhanCong, ["openingTt", "cuoiKyTt", "cuoiKyHd"]);
  });

  it("loại chưa có NCC nào trả rỗng ở cả bốn nguồn, không trả toàn bộ", async () => {
    const s = await seed();
    for (const id of [s.b, s.c]) await prisma.supplier.update({ where: { id }, data: { kind: "vat_tu" } });

    const f = await resolveSupplierKindFilter("nhan_cong");
    expect(f).toEqual({ kind: "nhan_cong", partyIds: [], empty: true });

    expect(await getMaterialDebtMatrix({ ...YEAR_2026, partyIds: [] })).toEqual([]);
    expect(await getMaterialWindowReport(YEAR_2026, s.entityId, [])).toEqual([]);
    expect((await getMaterialDetailReport({ ...YEAR_2026, partyIds: [], showZero: true })).rows).toEqual([]);
    const { pivot } = await getProjectDebtSummary({ ...YEAR_2026, groupBy: "ncc", loai: "nhan_cong" });
    expect(pivot.groups).toEqual([]);
    expect(pivot.total.cuoiKyTt).toBe(0);
  });
});
