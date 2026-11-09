/**
 * Integration test: truy vấn cửa sổ thời gian của công nợ vật tư trên DB test thật.
 *
 * Fixture Nam Hương (một Chủ thể, một công trình để mọi hạt gộp so sánh được):
 *   Số dư ban đầu 310.605.120 (asOf 27/4/2026)
 *   lay_hang   44.400.000   05/5
 *   thanh_toan 100.000.000  20/5
 *   thanh_toan 500.000      26/5   (ngày cuối kỳ: kiểm cận trên bao gồm)
 *   lay_hang   30.460.000   05/6
 *   thue_hd    1.000.000    26/6   (ngày cuối kỳ: kiểm cận trên bao gồm)
 *
 * Số kỳ vọng:
 *   27/4→26/5: đầu 310.605.120, tăng 44.400.000, giảm 100.500.000, cuối 254.505.120
 *   27/5→26/6: đầu 254.505.120, tăng 31.460.000, giảm 0,           cuối 285.965.120
 *   toàn bộ  : đầu 310.605.120, tăng 75.860.000, giảm 100.500.000, cuối 285.965.120
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
import {
  queryWindowByParty,
  queryMonthlyByParty,
  queryCurrentBalance,
  queryDebtMatrix,
} from "@/lib/ledger/ledger-aggregations";
import { queryDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import { isoWeekRange } from "@/lib/ledger/report-period";
import { getMaterialDebtMatrix } from "@/lib/cong-no-vt/material-ledger-service";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function seed() {
  const entity = await prisma.entity.create({ data: { name: "Cty Cửa Sổ", type: "company" } });
  const supplier = await prisma.supplier.create({ data: { name: "Nam Hương" } });
  const project = await prisma.project.create({
    data: { code: "P-WIN", name: "Dự án Cửa Sổ", status: "active", entityId: entity.id },
  });

  await prisma.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: entity.id,
      partyId: supplier.id,
      projectId: project.id,
      balanceTt: 310_605_120,
      balanceHd: 0,
      asOfDate: d("2026-04-27"),
    },
  });

  const tx = (type: string, date: string, totalTt: number) =>
    prisma.ledgerTransaction.create({
      data: {
        ledgerType: "material",
        date: d(date),
        transactionType: type,
        entityId: entity.id,
        partyId: supplier.id,
        projectId: project.id,
        totalTt,
        totalHd: 0,
      },
    });

  await tx("lay_hang", "2026-05-05", 44_400_000);
  await tx("thanh_toan", "2026-05-20", 100_000_000);
  await tx("thanh_toan", "2026-05-26", 500_000);
  await tx("lay_hang", "2026-06-05", 30_460_000);
  await tx("thue_hd", "2026-06-26", 1_000_000);

  return { entityId: entity.id, supplierId: supplier.id, projectId: project.id };
}

type Ctx = Awaited<ReturnType<typeof seed>>;

async function windowRow(ctx: Ctx, from: string | null, to: string | null) {
  const rows = await queryWindowByParty("material", {
    from: from ? d(from) : null,
    to: to ? d(to) : null,
    entityId: ctx.entityId,
  });
  const row = rows.find((r) => r.partyId === ctx.supplierId);
  if (!row) throw new Error("Không có dòng NCC trong cửa sổ");
  return {
    open: row.openingTt.toNumber(),
    inc: row.layHangTt.toNumber(),
    dec: row.thanhToanTt.toNumber(),
    close: row.closingTt.toNumber(),
  };
}

describe("cong-no window queries (integration)", () => {
  let ctx: Ctx;

  beforeEach(async () => {
    await truncateAll();
    ctx = await seed();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("(a) 27/4→26/5: thanh toán ngày cuối kỳ được tính", async () => {
    expect(await windowRow(ctx, "2026-04-27", "2026-05-26")).toEqual({
      open: 310_605_120,
      inc: 44_400_000,
      dec: 100_500_000,
      close: 254_505_120,
    });
  });

  it("(b) 27/5→26/6: thuế hoá đơn ngày cuối kỳ tăng nợ, đầu kỳ = cuối kỳ trước", async () => {
    expect(await windowRow(ctx, "2026-05-27", "2026-06-26")).toEqual({
      open: 254_505_120,
      inc: 31_460_000,
      dec: 0,
      close: 285_965_120,
    });
  });

  it("(c) toàn bộ (null/null): đầu kỳ chỉ là số dư ban đầu", async () => {
    expect(await windowRow(ctx, null, null)).toEqual({
      open: 310_605_120,
      inc: 75_860_000,
      dec: 100_500_000,
      close: 285_965_120,
    });
  });

  it("(d) Cuối kỳ(đến T) = Lũy kế(T) = queryCurrentBalance(asOf T), mọi from", async () => {
    const cases: Array<{ t: string; expected: number }> = [
      { t: "2026-05-26", expected: 254_505_120 },
      { t: "2026-06-26", expected: 285_965_120 },
    ];
    for (const { t, expected } of cases) {
      const balance = await queryCurrentBalance("material", ctx.entityId, ctx.supplierId, ctx.projectId, d(t));
      expect(balance.tt.toNumber()).toBe(expected);

      const cumulative = await queryDetailReport({ ledgerType: "material", to: d(t), showZero: false });
      const lk = cumulative.rows.find((r) => r.partyId === ctx.supplierId)!;
      expect(lk.cuoiKyTt).toBe(String(expected));

      for (const from of [null, "2026-04-27", "2026-05-01", "2026-05-20"]) {
        expect((await windowRow(ctx, from, t)).close).toBe(expected);
      }
    }
  });

  it("(d') queryDetailReport có from: đầu kỳ cộng Σ có dấu trước from, cận trên bao gồm", async () => {
    const { rows } = await queryDetailReport({
      ledgerType: "material",
      from: d("2026-05-27"),
      to: d("2026-06-26"),
      showZero: false,
    });
    const r = rows.find((x) => x.partyId === ctx.supplierId)!;
    expect(r.openingTt).toBe("254505120");
    expect(r.phatSinhTt).toBe("31460000");
    expect(r.daTraTt).toBe("0");
    expect(r.cuoiKyTt).toBe("285965120");
  });

  it("(e) 5 tuần ISO phủ tháng 5 cộng lại bằng cửa sổ tháng 5", async () => {
    const may = await windowRow(ctx, "2026-05-01", "2026-05-31");
    expect(may).toEqual({ open: 310_605_120, inc: 44_400_000, dec: 100_500_000, close: 254_505_120 });

    let inc = 0;
    let dec = 0;
    let prevClose: number | null = null;
    let firstOpen = 0;
    // 01/5/2026 thuộc tuần ISO 18 (27/4–3/5); 31/5 thuộc tuần 22 (25/5–31/5).
    for (let w = 18; w <= 22; w++) {
      const r = isoWeekRange(2026, w)!;
      const iso = (x: Date) => x.toISOString().slice(0, 10);
      const row = await windowRow(ctx, iso(r.from), iso(r.to));
      if (prevClose === null) firstOpen = row.open;
      else expect(row.open).toBe(prevClose);
      inc += row.inc;
      dec += row.dec;
      prevClose = row.close;
    }
    expect(firstOpen).toBe(may.open);
    expect(inc).toBe(may.inc);
    expect(dec).toBe(may.dec);
    expect(prevClose).toBe(may.close);
  });

  it("(f) queryMonthlyByParty(2026, 5) = queryWindowByParty(01/5→31/5)", async () => {
    const monthly = await queryMonthlyByParty("material", 2026, 5, ctx.entityId);
    const win = await queryWindowByParty("material", {
      from: d("2026-05-01"),
      to: d("2026-05-31"),
      entityId: ctx.entityId,
    });
    expect(monthly.map((r) => [r.partyId, r.openingTt.toFixed(0), r.layHangTt.toFixed(0), r.thanhToanTt.toFixed(0), r.closingTt.toFixed(0)])).toEqual(
      win.map((r) => [r.partyId, r.openingTt.toFixed(0), r.layHangTt.toFixed(0), r.thanhToanTt.toFixed(0), r.closingTt.toFixed(0)]),
    );
  });

  it("(h) getMaterialDebtMatrix: Chủ thể thứ hai cùng NCC, ô theo Chủ thể và tổng NCC", async () => {
    const entity2 = await prisma.entity.create({ data: { name: "Cty Thứ Hai", type: "company" } });
    // Sổ vật tư bắt buộc có công trình; Chủ thể của dòng lấy theo công trình.
    const project2 = await prisma.project.create({
      data: { code: "P-WIN-2", name: "Dự án Thứ Hai", status: "active", entityId: entity2.id },
    });
    await prisma.ledgerTransaction.create({
      data: {
        ledgerType: "material",
        date: d("2026-05-10"),
        transactionType: "lay_hang",
        entityId: entity2.id,
        partyId: ctx.supplierId,
        projectId: project2.id,
        totalTt: 1_000_000,
        totalHd: 0,
      },
    });

    const matrix = await getMaterialDebtMatrix({ from: "2026-04-27", to: "2026-05-26" });
    const row = matrix.find((r) => r.partyId === ctx.supplierId)!;
    expect(row).toBeDefined();

    // Ô Chủ thể 1 giữ đúng số của kỳ 27/4→26/5 (cửa sổ đơn lẻ ở test (a)).
    const c1 = row.cells[String(ctx.entityId)];
    expect(c1.openTt).toBe(310_605_120);
    expect(c1.layTt).toBe(44_400_000);
    expect(c1.traTt).toBe(100_500_000);
    expect(c1.closeTt).toBe(254_505_120);

    const c2 = row.cells[String(entity2.id)];
    expect(c2.openTt).toBe(0);
    expect(c2.layTt).toBe(1_000_000);
    expect(c2.closeTt).toBe(1_000_000);

    // Tổng NCC = cộng hai Chủ thể.
    expect(row.totals.closeTt).toBe(255_505_120);
    expect(row.totals.layTt).toBe(45_400_000);
  });

  it("(g) queryDebtMatrix({from, to}).totals = tổng queryWindowByParty", async () => {
    const windows: Array<[string | null, string | null]> = [
      ["2026-04-27", "2026-05-26"],
      ["2026-05-27", "2026-06-26"],
      [null, null],
    ];
    for (const [from, to] of windows) {
      const matrix = await queryDebtMatrix("material", {
        partyIds: [ctx.supplierId],
        entityIds: [ctx.entityId],
        from: from ? d(from) : null,
        to: to ? d(to) : null,
      });
      expect(matrix).toHaveLength(1);
      const expected = await windowRow(ctx, from, to);
      expect(matrix[0].totals.openTt).toBe(expected.open);
      expect(matrix[0].totals.layTt).toBe(expected.inc);
      expect(matrix[0].totals.traTt).toBe(expected.dec);
      expect(matrix[0].totals.closeTt).toBe(expected.close);
    }
  });
});
