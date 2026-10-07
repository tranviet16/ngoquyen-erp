/**
 * Integration test: quy ước ngày sổ cái = ngày nghiệp vụ Asia/Bangkok tại UTC 00:00.
 *  - Đồng bộ đợt thanh toán đóng lúc 02:00 27/5 Bangkok ghi date = 2026-05-27T00:00Z.
 *  - Khoá kỳ ký 28/4→26/5 cho phép 27/5, từ chối 26/5 kể cả khi truyền thời điểm có giờ.
 *  - Đồng bộ đóng đợt lúc 20:00 26/5 Bangkok bị khoá kỳ chặn (trước đây thoát khoá vì date > periodTo).
 *  - parseExcelDate trả UTC 00:00.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { syncClosedRoundToLedger } from "@/lib/payment/payment-ledger-sync";
import { assertPeriodOpen, findSignedPeriodCovering } from "@/lib/vat-tu-ncc/period-lock";
import { parseExcelDate } from "@/lib/import/adapters/excel-utils";
import { isUtcMidnight } from "@/lib/ledger/business-date";

const USER_ID = "business-date-int";

/** Dựng NCC, Chủ thể và một đợt thanh toán có 1 dòng vật tư đã duyệt 10.000.000. */
async function seedRound() {
  await prisma.user.create({
    data: {
      id: USER_ID,
      name: "Integration User",
      email: "business-date-int@test.local",
      role: "admin",
      isDirector: true,
      isLeader: false,
    },
  });
  const entity = await prisma.entity.create({ data: { name: "Cty Test", type: "company" } });
  const supplier = await prisma.supplier.create({ data: { name: "NCC Test" } });
  const project = await prisma.project.create({
    data: { code: "P-BD", name: "Dự án Test", status: "active", entityId: entity.id },
  });
  const round = await prisma.paymentRound.create({
    data: { month: "2026-05", sequence: 1, status: "approved", createdById: USER_ID },
  });
  const item = await prisma.paymentRoundItem.create({
    data: {
      roundId: round.id,
      entityId: entity.id,
      supplierId: supplier.id,
      projectId: project.id,
      category: "vat_tu",
      soDeNghi: 10_000_000,
      soDuyet: 10_000_000,
    },
  });
  return { entity, supplier, round, item };
}

/** Kỳ NCC đã ký 28/4→26/5/2026 (biên UTC 00:00 như chốt kỳ ghi). */
async function signPeriod(supplierId: number) {
  return prisma.supplierReconciliation.create({
    data: {
      supplierId,
      periodFrom: new Date("2026-04-28T00:00:00Z"),
      periodTo: new Date("2026-05-26T00:00:00Z"),
      signedBySupplier: true,
      signedDate: new Date("2026-05-30T00:00:00Z"),
    },
  });
}

describe("ngày sổ cái theo ngày nghiệp vụ Bangkok (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("đóng đợt 02:00 27/5 Bangkok (19:00Z 26/5) ghi thanh_toan date = 2026-05-27T00:00Z", async () => {
    const { round, item } = await seedRound();

    const count = await syncClosedRoundToLedger(
      round.id,
      prisma,
      new Date("2026-05-26T19:00:00Z"),
    );
    expect(count).toBe(1);

    const tx = await prisma.ledgerTransaction.findFirstOrThrow({
      where: { paymentRoundItemId: item.id },
    });
    expect(tx.transactionType).toBe("thanh_toan");
    expect(tx.date.toISOString()).toBe("2026-05-27T00:00:00.000Z");
    expect(isUtcMidnight(tx.date)).toBe(true);
  });

  it("đồng bộ lại (idempotent) vẫn giữ ngày nghiệp vụ, không nhân đôi dòng", async () => {
    const { round, item } = await seedRound();
    await syncClosedRoundToLedger(round.id, prisma, new Date("2026-05-26T19:00:00Z"));
    await syncClosedRoundToLedger(round.id, prisma, new Date("2026-05-26T19:30:00Z"));

    const rows = await prisma.ledgerTransaction.findMany({
      where: { paymentRoundItemId: item.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].date.toISOString()).toBe("2026-05-27T00:00:00.000Z");
  });

  it("kỳ ký 28/4→26/5 cho phép 27/5 và từ chối 26/5 kể cả thời điểm có giờ", async () => {
    const { supplier } = await seedRound();
    await signPeriod(supplier.id);

    await expect(
      assertPeriodOpen(supplier.id, new Date("2026-05-27T00:00:00Z")),
    ).resolves.toBeUndefined();
    // 02:00 27/5 Bangkok -> ngày nghiệp vụ 27/5 -> nằm ngoài kỳ ký
    await expect(
      assertPeriodOpen(supplier.id, new Date("2026-05-26T19:00:00Z")),
    ).resolves.toBeUndefined();

    await expect(
      assertPeriodOpen(supplier.id, new Date("2026-05-26T00:00:00Z")),
    ).rejects.toThrow(/đã được NCC ký/);
    // 20:00 26/5 Bangkok (13:00Z) > periodTo 00:00Z nhưng vẫn là ngày 26/5 -> phải bị khoá
    await expect(
      assertPeriodOpen(supplier.id, new Date("2026-05-26T13:00:00Z")),
    ).rejects.toThrow(/đã được NCC ký/);

    expect(
      await findSignedPeriodCovering(supplier.id, new Date("2026-05-26T13:00:00Z")),
    ).not.toBeNull();
    expect(
      await findSignedPeriodCovering(supplier.id, new Date("2026-05-27T00:00:00Z")),
    ).toBeNull();
  });

  it("đóng đợt 20:00 26/5 Bangkok vào kỳ đã ký bị chặn, không sinh dòng sổ cái", async () => {
    const { supplier, round, item } = await seedRound();
    await signPeriod(supplier.id);

    await expect(
      syncClosedRoundToLedger(round.id, prisma, new Date("2026-05-26T13:00:00Z")),
    ).rejects.toThrow(/đã được NCC ký/);

    expect(await prisma.ledgerTransaction.count({ where: { paymentRoundItemId: item.id } })).toBe(0);
  });
});

describe("parseExcelDate trả UTC 00:00", () => {
  it.each([
    ["27/05/2026", "2026-05-27T00:00:00.000Z"],
    ["1-6-2026", "2026-06-01T00:00:00.000Z"],
    [46173, "2026-05-31T00:00:00.000Z"], // serial Excel của 31/05/2026
  ])("%s -> %s", (input, expected) => {
    const d = parseExcelDate(input);
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe(expected);
  });

  it("Date nửa đêm giờ Bangkok (17:00Z hôm trước) -> đúng ngày Excel", () => {
    const d = parseExcelDate(new Date("2026-05-31T17:00:00Z"));
    expect(d!.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("ô rỗng hoặc ngày không tồn tại -> null", () => {
    expect(parseExcelDate("")).toBeNull();
    expect(parseExcelDate(null)).toBeNull();
    expect(parseExcelDate("31/02/2026")).toBeNull();
  });
});
