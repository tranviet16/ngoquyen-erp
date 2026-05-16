/**
 * Integration test: full payment round lifecycle against the REAL extended
 * `@/lib/prisma` (audit `$extends` runs for real). Only `@/lib/auth` is mocked
 * — there is no real session in the test env. Isolation: `truncateAll()` in
 * `beforeEach` + serial integration project (see Phase 1).
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { vi } from "vitest";
import { authMock, mockSession } from "@/test/helpers/session-mock";

vi.mock("@/lib/auth", () => ({ auth: authMock }));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import * as svc from "@/lib/payment/payment-service";

const ADMIN_ID = "admin-int";

async function seed() {
  await prisma.user.create({
    data: {
      id: ADMIN_ID,
      name: "Integration Admin",
      email: "admin-int@test.local",
      role: "admin",
      isDirector: true,
      isLeader: false,
    },
  });
  const entity = await prisma.entity.create({ data: { name: "Cty Test", type: "company" } });
  const supplier = await prisma.supplier.create({ data: { name: "NCC Test" } });
  const project = await prisma.project.create({
    data: { code: "P-INT", name: "Dự án Test", status: "active" },
  });
  return { entityId: entity.id, supplierId: supplier.id, projectId: project.id };
}

describe("payment round lifecycle (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
    mockSession({ id: ADMIN_ID, role: "admin" });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("runs createRound → upsertItem ×3 → submitRound → bulkApprove → closeRound", async () => {
    const { entityId, supplierId, projectId } = await seed();

    const round = await svc.createRound({ month: "2026-05", note: "đợt 1" });
    expect(round.status).toBe("draft");
    expect(round.sequence).toBe(1);

    for (let i = 0; i < 3; i++) {
      await svc.upsertItem({
        roundId: round.id,
        entityId,
        supplierId,
        projectId,
        category: "khac",
        congNo: 0,
        luyKe: 0,
        soDeNghi: 100 * (i + 1),
      });
    }
    expect(await prisma.paymentRoundItem.count({ where: { roundId: round.id } })).toBe(3);

    await svc.submitRound(round.id);
    expect((await prisma.paymentRound.findUniqueOrThrow({ where: { id: round.id } })).status).toBe(
      "submitted",
    );

    await svc.bulkApproveAsRequested(round.id);
    const afterBulk = await prisma.paymentRound.findUniqueOrThrow({ where: { id: round.id } });
    expect(afterBulk.status).toBe("approved");
    const items = await prisma.paymentRoundItem.findMany({ where: { roundId: round.id } });
    expect(items.every((it) => it.approvedAt !== null)).toBe(true);
    expect(items.map((it) => Number(it.soDuyet)).sort((a, b) => a - b)).toEqual([100, 200, 300]);

    await svc.closeRound(round.id);
    expect((await prisma.paymentRound.findUniqueOrThrow({ where: { id: round.id } })).status).toBe(
      "closed",
    );
  });

  it("writes audit rows for round + item creates via the real $extends", async () => {
    const { entityId, supplierId, projectId } = await seed();
    const round = await svc.createRound({ month: "2026-05" });
    await svc.upsertItem({
      roundId: round.id,
      entityId,
      supplierId,
      projectId,
      category: "khac",
      congNo: 0,
      luyKe: 0,
      soDeNghi: 500,
    });

    const roundAudit = await prisma.auditLog.findFirst({
      where: { tableName: "PaymentRound", recordId: String(round.id), action: "create" },
    });
    expect(roundAudit).not.toBeNull();

    const itemAudit = await prisma.auditLog.findFirst({
      where: { tableName: "PaymentRoundItem", action: "create" },
    });
    expect(itemAudit).not.toBeNull();
  });

  it("rejects an illegal transition: closeRound on a non-approved round", async () => {
    await seed();
    const round = await svc.createRound({ month: "2026-05" });
    await expect(svc.closeRound(round.id)).rejects.toThrow("Chỉ đóng được đợt đã duyệt");
  });

  it("rejects submitRound on an empty round", async () => {
    await seed();
    const round = await svc.createRound({ month: "2026-05" });
    await expect(svc.submitRound(round.id)).rejects.toThrow("Đợt phải có ít nhất 1 dòng");
  });
});
