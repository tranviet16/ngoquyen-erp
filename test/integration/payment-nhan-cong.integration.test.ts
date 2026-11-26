/**
 * Integration test: dòng đề nghị thanh toán loại nhân công dùng sổ vật tư của NCC.
 *
 *  - Tự điền công nợ đọc sổ vật tư theo cặp NCC × công trình, không đọc sổ `labor` (sổ đó đánh số
 *    theo id tổ đội: fixture tạo một tổ đội trùng id với NCC và có công nợ khác để bắt lỗi cũ).
 *  - Dòng nhân công thiếu công trình bị chặn như dòng vật tư.
 *  - Đóng đợt ghi đúng một dòng `thanh_toan` vào sổ vật tư; đồng bộ lại không ghi thêm.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { authMock, mockSession } from "@/test/helpers/session-mock";

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import * as svc from "@/lib/payment/payment-service";
import { syncClosedRoundToLedger } from "@/lib/payment/payment-ledger-sync";

const ADMIN_ID = "admin-nc-int";
const APPROVER_ID = "approver-nc-int";
const MATERIAL_OPENING = 7_000_000;
const LABOR_DEBT_OF_SAME_ID_CREW = 999_000;

async function seed() {
  for (const [id, email] of [
    [ADMIN_ID, "admin-nc-int@test.local"],
    [APPROVER_ID, "approver-nc-int@test.local"],
  ]) {
    await prisma.user.create({
      data: { id, name: id, email, role: "admin", isDirector: true, isLeader: false },
    });
  }
  const entity = await prisma.entity.create({ data: { name: "Cty Test", type: "company" } });
  const project = await prisma.project.create({
    data: { code: "P-NC", name: "Dự án NC", status: "active", entityId: entity.id },
  });
  const supplier = await prisma.supplier.create({ data: { name: "NCC nhân công", kind: "nhan_cong" } });
  // Tổ đội trùng id với NCC (identity mới sau truncate) và có công nợ ở sổ labor.
  const crew = await prisma.contractor.create({ data: { name: "Tổ đội trùng id" } });
  expect(crew.id).toBe(supplier.id);
  await prisma.ledgerTransaction.create({
    data: {
      ledgerType: "labor",
      date: new Date("2026-01-10T00:00:00.000Z"),
      transactionType: "lay_hang",
      entityId: entity.id,
      partyId: crew.id,
      amountTt: LABOR_DEBT_OF_SAME_ID_CREW,
      totalTt: LABOR_DEBT_OF_SAME_ID_CREW,
      amountHd: 0,
      totalHd: 0,
    },
  });
  // Công nợ của NCC nằm ở sổ vật tư: số dư đầu kỳ của cặp NCC × công trình.
  await prisma.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: entity.id,
      partyId: supplier.id,
      projectId: project.id,
      balanceTt: MATERIAL_OPENING,
      balanceHd: 0,
      asOfDate: new Date("2025-12-31T00:00:00.000Z"),
    },
  });
  return { entityId: entity.id, projectId: project.id, supplierId: supplier.id };
}

describe("đề nghị thanh toán dòng nhân công (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
    mockSession({ id: ADMIN_ID, role: "admin" });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("tự điền công nợ từ sổ vật tư của NCC, không đọc sổ labor của tổ đội cùng id", async () => {
    const { entityId, projectId, supplierId } = await seed();
    const round = await svc.createRound({ month: "2026-06" });
    const item = await svc.upsertItem({
      roundId: round.id, entityId, supplierId, projectId, category: "nhan_cong", soDeNghi: 1_000_000,
    });
    expect(Number(item.congNo)).toBe(MATERIAL_OPENING);
    expect(Number(item.luyKe)).toBe(0);
    expect(item.balancesRefreshedAt).not.toBeNull();
  });

  it("chặn dòng nhân công thiếu công trình", async () => {
    const { entityId, supplierId } = await seed();
    const round = await svc.createRound({ month: "2026-06" });
    await expect(
      svc.upsertItem({ roundId: round.id, entityId, supplierId, projectId: null, category: "nhan_cong", soDeNghi: 1 }),
    ).rejects.toThrow(/thiếu công trình/);
    expect(await prisma.paymentRoundItem.count()).toBe(0);
  });

  it("đóng đợt ghi đúng một dòng thanh_toan vào sổ vật tư; đồng bộ lại không ghi thêm", async () => {
    const { entityId, projectId, supplierId } = await seed();
    const round = await svc.createRound({ month: "2026-06" });
    const item = await svc.upsertItem({
      roundId: round.id, entityId, supplierId, projectId, category: "nhan_cong", soDeNghi: 2_000_000,
    });
    await svc.submitRound(round.id);
    mockSession({ id: APPROVER_ID, role: "admin" });
    await svc.bulkApproveAsRequested(round.id);
    await svc.closeRound(round.id);

    const rows = await prisma.ledgerTransaction.findMany({ where: { paymentRoundItemId: item.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ledgerType: "material",
      transactionType: "thanh_toan",
      partyId: supplierId,
      projectId,
      entityId,
    });
    expect(Number(rows[0].totalTt)).toBe(2_000_000);

    await syncClosedRoundToLedger(round.id, prisma, new Date());
    expect(await prisma.ledgerTransaction.count({ where: { paymentRoundItemId: item.id } })).toBe(1);
    // Sổ labor của tổ đội cùng id không bị đụng.
    expect(await prisma.ledgerTransaction.count({ where: { ledgerType: "labor" } })).toBe(1);
  });
});
