/**
 * Integration test: tổng hợp công nợ vật tư theo công trình trên DB test thật
 * (`getProjectDebtSummary` → một lần `queryDetailReport` → `buildProjectPivot`).
 *
 * Fixture (hai Chủ thể, mỗi công trình thuộc một Chủ thể):
 *   - Cặp lũy kế Nam Hương × Trại Chuối (Cty Quản Lý): 2 dòng ngày 26/12/2025
 *     lay_hang 500.000.000 / thanh_toan 440.131.580 → ròng TT 59.868.420 (HĐ 480tr / 430tr → 50tr).
 *     2026: lay_hang 10/01 10tr, thanh_toan 20/01 5tr, lay_hang 05/03 7tr; 2027: lay_hang 05/01 1tr.
 *   - Cặp số dư ròng Quang Minh × DCX (Cty Xây Dựng): số dư ban đầu TT 159.360.000 / HĐ 150tr
 *     (asOf 31/12/2025); 2026: lay_hang 05/01 20tr (HĐ 18tr), thanh_toan 10/02 30tr.
 *   - Nam Hương × DCX: lay_hang 01/04/2026 3tr (NCC có hai công trình).
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
import { getProjectDebtSummary } from "@/lib/cong-no-vt/project-debt-summary-service";
import type { PivotAmounts, PivotGroupBy, ProjectPivot } from "@/lib/cong-no-vt/project-debt-pivot";
import { resolveReportPeriod } from "@/lib/ledger/report-period";

const LIFETIME_NET_TT = 59_868_420;
const LIFETIME_NET_HD = 50_000_000;
const QM_OPENING_TT = 159_360_000;
const QM_OPENING_HD = 150_000_000;

interface Seeded {
  entityA: number;
  entityB: number;
}

async function seed(): Promise<Seeded> {
  const entityA = await prisma.entity.create({ data: { name: "Cty Quản Lý", type: "company" } });
  const entityB = await prisma.entity.create({ data: { name: "Cty Xây Dựng", type: "company" } });
  const traiChuoi = await prisma.project.create({
    data: { code: "P-TC", name: "Trại Chuối", status: "active", entityId: entityA.id },
  });
  const dcx = await prisma.project.create({
    data: { code: "P-DCX", name: "DCX", status: "active", entityId: entityB.id },
  });
  const namHuong = await prisma.supplier.create({ data: { name: "Nam Hương" } });
  const quangMinh = await prisma.supplier.create({ data: { name: "Quang Minh" } });

  const tx = (
    project: { id: number; entityId: number | null },
    partyId: number,
    transactionType: "lay_hang" | "thanh_toan",
    date: string,
    totalTt: number,
    totalHd: number,
    content?: string,
  ) =>
    prisma.ledgerTransaction.create({
      data: {
        ledgerType: "material",
        date: new Date(`${date}T00:00:00.000Z`),
        transactionType,
        entityId: project.entityId!,
        partyId,
        projectId: project.id,
        amountTt: totalTt,
        totalTt,
        amountHd: totalHd,
        totalHd,
        content,
      },
    });

  // Cặp lũy kế: 2 dòng ngày 26/12/2025 (ngoài cửa sổ Kỳ chuẩn T1/2026 bắt đầu 27/12/2025).
  await tx(traiChuoi, namHuong.id, "lay_hang", "2025-12-26", 500_000_000, 480_000_000, "Lũy kế chuyển đổi");
  await tx(traiChuoi, namHuong.id, "thanh_toan", "2025-12-26", 440_131_580, 430_000_000, "Lũy kế chuyển đổi");
  await tx(traiChuoi, namHuong.id, "lay_hang", "2026-01-10", 10_000_000, 10_000_000);
  await tx(traiChuoi, namHuong.id, "thanh_toan", "2026-01-20", 5_000_000, 5_000_000);
  await tx(traiChuoi, namHuong.id, "lay_hang", "2026-03-05", 7_000_000, 7_000_000);
  await tx(traiChuoi, namHuong.id, "lay_hang", "2027-01-05", 1_000_000, 1_000_000);

  // Cặp giữ số dư ròng.
  await prisma.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: entityB.id,
      partyId: quangMinh.id,
      projectId: dcx.id,
      balanceTt: QM_OPENING_TT,
      balanceHd: QM_OPENING_HD,
      asOfDate: new Date("2025-12-31T00:00:00.000Z"),
    },
  });
  await tx(dcx, quangMinh.id, "lay_hang", "2026-01-05", 20_000_000, 18_000_000);
  await tx(dcx, quangMinh.id, "thanh_toan", "2026-02-10", 30_000_000, 30_000_000);

  await tx(dcx, namHuong.id, "lay_hang", "2026-04-01", 3_000_000, 3_000_000);

  return { entityA: entityA.id, entityB: entityB.id };
}

function find(pivot: ProjectPivot, level1: string, level2: string): PivotAmounts {
  const group = pivot.groups.find((g) => g.name === level1);
  expect(group, `thiếu nhóm ${level1}`).toBeDefined();
  const child = group!.children.find((c) => c.name === level2);
  expect(child, `thiếu dòng ${level1} → ${level2}`).toBeDefined();
  return child!.amounts;
}

function leaves(pivot: ProjectPivot): Map<string, PivotAmounts> {
  return new Map(pivot.groups.flatMap((g) => g.children.map((c) => [`${g.key}/${c.key}`, c.amounts] as const)));
}

const YEAR_2026 = { from: "2026-01-01", to: "2026-12-31" };

async function summary(window: { from: string | null; to: string | null }, groupBy: PivotGroupBy = "ncc", entityIds?: number[]) {
  return getProjectDebtSummary({ ...window, groupBy, entityIds });
}

describe("getProjectDebtSummary — tổng hợp theo công trình (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("Năm 2026: Đầu kỳ của cặp lũy kế = 59.868.420, cặp số dư ròng = số dư ban đầu", async () => {
    await seed();
    const { pivot, mode } = await summary(YEAR_2026);
    expect(mode).toBe("window");

    const nh = find(pivot, "Nam Hương", "Trại Chuối");
    expect(nh.openingTt).toBe(LIFETIME_NET_TT);
    expect(nh.openingHd).toBe(LIFETIME_NET_HD);
    expect(nh.phatSinhTt).toBe(17_000_000);
    expect(nh.daTraTt).toBe(5_000_000);
    expect(nh.cuoiKyTt).toBe(71_868_420);

    const qm = find(pivot, "Quang Minh", "DCX");
    expect(qm).toMatchObject({
      openingTt: QM_OPENING_TT,
      phatSinhTt: 20_000_000,
      daTraTt: 30_000_000,
      cuoiKyTt: 149_360_000,
      openingHd: QM_OPENING_HD,
      phatSinhHd: 18_000_000,
      daTraHd: 30_000_000,
      cuoiKyHd: 138_000_000,
    });

    expect(pivot.groups.find((g) => g.name === "Nam Hương")!.children.map((c) => c.name)).toEqual([
      "DCX",
      "Trại Chuối",
    ]);
  });

  it("Kỳ chuẩn T1/2026 (27/12/2025 → 26/01/2026): Đầu kỳ = 59.868.420, PS không gồm dòng lũy kế", async () => {
    await seed();
    const period = resolveReportPeriod({ period: "ncc", y: "2026", m: "1" }, {
      defaultPreset: "year",
      legacyMode: "cutoff",
      today: new Date(),
    });
    if ("error" in period) throw new Error(period.error);
    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    expect([iso(period.from), iso(period.to)]).toEqual(["2025-12-27", "2026-01-26"]);

    const { pivot } = await summary({ from: iso(period.from), to: iso(period.to) });
    const nh = find(pivot, "Nam Hương", "Trại Chuối");
    expect(nh.openingTt).toBe(LIFETIME_NET_TT);
    expect(nh.phatSinhTt).toBe(10_000_000); // không gồm 500.000.000 ngày 26/12 và dòng tháng 3
    expect(nh.daTraTt).toBe(5_000_000); // không gồm 440.131.580 ngày 26/12
    expect(nh.cuoiKyTt).toBe(64_868_420);

    const qm = find(pivot, "Quang Minh", "DCX");
    expect(qm.openingTt).toBe(QM_OPENING_TT);
    expect(qm.phatSinhTt).toBe(20_000_000);
    expect(qm.daTraTt).toBe(0);
  });

  it("Còn nợ (lũy kế đến T) = Cuối kỳ (Năm 2026, đến T) ở mọi cặp; chuyển sang + LH − Đã trả = Còn nợ", async () => {
    await seed();
    const year = leaves((await summary(YEAR_2026)).pivot);
    const cumulative = await summary({ from: null, to: YEAR_2026.to });
    expect(cumulative.mode).toBe("cumulative");
    const toT = leaves(cumulative.pivot);

    expect([...toT.keys()].sort()).toEqual([...year.keys()].sort());
    for (const [key, a] of toT) {
      expect(a.cuoiKyTt, key).toBe(year.get(key)!.cuoiKyTt);
      expect(a.cuoiKyHd, key).toBe(year.get(key)!.cuoiKyHd);
      expect(a.openingTt + a.phatSinhTt - a.daTraTt, key).toBe(a.cuoiKyTt);
      expect(a.openingHd + a.phatSinhHd - a.daTraHd, key).toBe(a.cuoiKyHd);
    }

    // Cặp lũy kế: chuyển sang = 0, LH / Đã trả gồm 2 dòng ngày 26/12/2025.
    const nh = find(cumulative.pivot, "Nam Hương", "Trại Chuối");
    expect(nh).toMatchObject({ openingTt: 0, phatSinhTt: 517_000_000, daTraTt: 445_131_580, cuoiKyTt: 71_868_420 });
    // Cặp số dư ròng: chuyển sang = số dư ban đầu.
    expect(find(cumulative.pivot, "Quang Minh", "DCX").openingTt).toBe(QM_OPENING_TT);
  });

  it("Toàn bộ (không giới hạn) gồm cả phát sinh sau T", async () => {
    await seed();
    const all = await summary({ from: null, to: null });
    expect(all.mode).toBe("cumulative");
    expect(find(all.pivot, "Nam Hương", "Trại Chuối").cuoiKyTt).toBe(71_868_420 + 1_000_000);
  });

  it("hai chiều nhóm có cùng tổng chung", async () => {
    await seed();
    const byNcc = await summary(YEAR_2026, "ncc");
    const byProject = await summary(YEAR_2026, "cong-trinh");
    expect(byProject.pivot.total).toEqual(byNcc.pivot.total);
    expect(byProject.pivot.groups.map((g) => g.name)).toEqual(["DCX", "Trại Chuối"]);
    expect(find(byProject.pivot, "Trại Chuối", "Nam Hương").openingTt).toBe(LIFETIME_NET_TT);
  });

  it("lọc Chủ thể chỉ còn công trình của Chủ thể đó", async () => {
    const { entityA, entityB } = await seed();

    const onlyB = await summary(YEAR_2026, "cong-trinh", [entityB]);
    expect(onlyB.pivot.groups.map((g) => g.name)).toEqual(["DCX"]);
    expect(onlyB.pivot.groups[0].children.map((c) => c.name)).toEqual(["Nam Hương", "Quang Minh"]);
    expect(onlyB.pivot.total).toEqual(onlyB.pivot.groups[0].amounts);

    const onlyA = await summary(YEAR_2026, "ncc", [entityA]);
    expect(onlyA.pivot.groups.map((g) => g.name)).toEqual(["Nam Hương"]);
    expect(onlyA.pivot.groups[0].children.map((c) => c.name)).toEqual(["Trại Chuối"]);
    expect(onlyA.pivot.total.openingTt).toBe(LIFETIME_NET_TT);
  });

  it("từ chối tham số sai trước khi truy vấn", async () => {
    await expect(getProjectDebtSummary({ from: null, to: null, groupBy: "chu-the" })).rejects.toThrow(/Kiểu nhóm/);
    await expect(getProjectDebtSummary({ from: "2026-06-01", to: "2026-05-01", groupBy: "ncc" })).rejects.toThrow(
      /Từ ngày/,
    );
  });
});
