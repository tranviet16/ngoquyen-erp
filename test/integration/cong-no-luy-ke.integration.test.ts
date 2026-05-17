/**
 * Integration test: cumulative debt report ("Công nợ lũy kế") against the REAL
 * `_test` Postgres DB via `@/lib/prisma` ($queryRaw runs for real).
 *
 * Covers the two correctness risks of the rebuilt report: the `dieu_chinh`
 * sign-split (positive → phát sinh, negative → đã trả) and parity with
 * `queryMonthlyByParty` (báo cáo tháng). Also asserts the year/month cutoff
 * and HĐ-vs-TT column independence.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { getMaterialDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import { getLaborDetailReport } from "@/lib/cong-no-nc/balance-report-service";
import { queryMonthlyByParty } from "@/lib/ledger/ledger-aggregations";

async function seed() {
  const entity = await prisma.entity.create({ data: { name: "Cty Lũy Kế", type: "company" } });
  const supplier = await prisma.supplier.create({ data: { name: "NCC Lũy Kế" } });
  const project = await prisma.project.create({
    data: { code: "P-LK", name: "Dự án Lũy Kế", status: "active" },
  });

  await prisma.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: entity.id,
      partyId: supplier.id,
      projectId: project.id,
      balanceTt: 1000,
      balanceHd: 900,
      asOfDate: new Date("2026-01-01"),
    },
  });

  const tx = (
    type: string,
    date: string,
    totalTt: number,
    totalHd: number,
  ) =>
    prisma.ledgerTransaction.create({
      data: {
        ledgerType: "material",
        date: new Date(date),
        transactionType: type,
        entityId: entity.id,
        partyId: supplier.id,
        projectId: project.id,
        totalTt,
        totalHd,
      },
    });

  await tx("lay_hang", "2026-05-10", 500, 480);
  await tx("thanh_toan", "2026-05-15", 200, 180);
  await tx("dieu_chinh", "2026-05-20", 50, 40); // positive → phát sinh
  await tx("dieu_chinh", "2026-05-22", -30, -20); // negative → đã trả
  await tx("lay_hang", "2026-06-05", 9999, 8888); // after cutoff → excluded for month=5

  return { entityId: entity.id, supplierId: supplier.id, projectId: project.id };
}

describe("getMaterialDetailReport — cumulative report (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("computes 8 fields with dieu_chinh sign-split, up to the month cutoff", async () => {
    await seed();

    const { rows } = await getMaterialDetailReport({
      ledgerType: "material",
      year: 2026,
      month: 5,
      showZero: false,
    });

    expect(rows).toHaveLength(1);
    const r = rows[0];

    expect(r.openingTt).toBe("1000");
    expect(r.openingHd).toBe("900");
    // phát sinh = lay_hang + positive dieu_chinh
    expect(r.phatSinhTt).toBe("550"); // 500 + 50
    expect(r.phatSinhHd).toBe("520"); // 480 + 40
    // đã trả = thanh_toan + |negative dieu_chinh|
    expect(r.daTraTt).toBe("230"); // 200 + 30
    expect(r.daTraHd).toBe("200"); // 180 + 20
    // cuối kỳ = đầu kỳ + phát sinh − đã trả
    expect(r.cuoiKyTt).toBe("1320"); // 1000 + 550 − 230
    expect(r.cuoiKyHd).toBe("1220"); // 900 + 520 − 200
  });

  it("excludes transactions after the cutoff but includes them with no cutoff", async () => {
    await seed();

    const cutoff = await getMaterialDetailReport({
      ledgerType: "material",
      year: 2026,
      month: 5,
      showZero: false,
    });
    expect(cutoff.rows[0].phatSinhTt).toBe("550"); // June lay_hang excluded

    const noCutoff = await getMaterialDetailReport({
      ledgerType: "material",
      showZero: false,
    });
    expect(noCutoff.rows[0].phatSinhTt).toBe("10549"); // 500 + 50 + 9999
    expect(noCutoff.rows[0].phatSinhHd).toBe("9408"); // 480 + 40 + 8888
  });

  it("keeps TT and HĐ columns independent", async () => {
    await seed();
    const { rows } = await getMaterialDetailReport({
      ledgerType: "material",
      year: 2026,
      month: 5,
      showZero: false,
    });
    const r = rows[0];
    expect(r.cuoiKyTt).not.toBe(r.cuoiKyHd);
    expect(r.phatSinhTt).not.toBe(r.phatSinhHd);
  });

  it("matches queryMonthlyByParty closing balance (parity with báo cáo tháng)", async () => {
    const { entityId, supplierId } = await seed();

    const { rows } = await getMaterialDetailReport({
      ledgerType: "material",
      year: 2026,
      month: 5,
      showZero: false,
    });
    const lk = rows.find((row) => row.partyId === supplierId)!;

    const monthly = await queryMonthlyByParty("material", 2026, 5, entityId);
    const bct = monthly.find((m) => m.partyId === supplierId)!;

    expect(lk.cuoiKyTt).toBe(bct.closingTt.toFixed(0));
    expect(lk.cuoiKyHd).toBe(bct.closingHd.toFixed(0));
  });

  it("getLaborDetailReport delegates with ledgerType='labor' (no material rows leak)", async () => {
    await seed(); // seeds only material data

    const { rows } = await getLaborDetailReport({ showZero: false });
    expect(rows).toHaveLength(0);
  });
});
