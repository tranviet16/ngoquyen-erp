/**
 * Mock-mode tests for payment-service. Covers the round state machine and
 * every guard `throw`. Prisma + auth + balance-service are mocked; this file
 * exercises branching logic only — real multi-row transactions are covered by
 * `test/integration/payment-service.integration.test.ts`.
 *
 * Transition table (state × action → result):
 *   draft     + submitRound  → submitted   | throw if no items
 *   submitted + approveItem  → item approved, round auto-approves when all done
 *   submitted + rejectItem   → item soDuyet=0, round auto-approves when all done
 *   submitted + rejectRound  → rejected
 *   submitted + bulkApprove  → all items approved + round approved
 *   approved  + closeRound   → closed       | throw on any other state
 *   non-draft + upsertItem   → throw
 *   non-draft + deleteItem   → throw
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { authMock, mockSession, clearSession } from "@/test/helpers/session-mock";

// Built inside vi.hoisted so the reference exists when the (hoisted) vi.mock
// factory runs — a plain top-level const would still be uninitialized then.
const mockDb = vi.hoisted(() => {
  const cache = new Map<string, unknown>();
  const modelProxy = () =>
    new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
      get(t, m: string) {
        if (!t[m]) t[m] = vi.fn();
        return t[m];
      },
    });
  const root: Record<string, unknown> = new Proxy({}, {
    get(_t, key: string) {
      if (key === "$transaction") {
        return vi.fn(async (a: unknown) =>
          typeof a === "function"
            ? (a as (tx: unknown) => unknown)(root)
            : Promise.all(a as Promise<unknown>[]),
        );
      }
      if (key === "$queryRaw" || key === "$executeRaw") {
        if (!cache.has(key)) cache.set(key, vi.fn());
        return cache.get(key);
      }
      if (!cache.has(key)) cache.set(key, modelProxy());
      return cache.get(key);
    },
  });
  return root;
}) as Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
  $transaction: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
};
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/ledger/balance-service", () => ({
  getOutstandingDebt: vi.fn(),
  getCumulativePaid: vi.fn(),
}));

import * as svc from "../payment-service";
import { getOutstandingDebt, getCumulativePaid } from "@/lib/ledger/balance-service";

const ADMIN = { id: "admin1", role: "admin", isDirector: false, isLeader: false };
const KETOAN = { id: "kt1", role: "ketoan", isDirector: false, isLeader: false };
const DIRECTOR = { id: "dir1", role: "viewer", isDirector: true, isLeader: false };
const VIEWER = { id: "v1", role: "viewer", isDirector: false, isLeader: false };

/** Drives getActor(): mocks the session + the DB user lookup. */
function actAs(user: { id: string; role: string; isDirector: boolean; isLeader: boolean }) {
  mockSession({ id: user.id, role: user.role });
  mockDb.user.findUnique.mockResolvedValue({
    isDirector: user.isDirector,
    isLeader: user.isLeader,
    role: user.role,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  actAs(ADMIN);
});

describe("getActor guards", () => {
  it("throws when not authenticated", async () => {
    clearSession();
    await expect(svc.listRounds({})).rejects.toThrow("Chưa đăng nhập");
  });

  it("throws when session user is missing from DB", async () => {
    mockSession({ id: "ghost", role: "admin" });
    mockDb.user.findUnique.mockResolvedValue(null);
    await expect(svc.listRounds({})).rejects.toThrow("User không tồn tại");
  });
});

describe("createRound", () => {
  it("admin/ketoan/canbo_vt can create; computes sequence = last + 1", async () => {
    actAs(KETOAN);
    mockDb.paymentRound.findFirst.mockResolvedValue({ sequence: 4 });
    mockDb.paymentRound.create.mockResolvedValue({ id: 1, sequence: 5 });
    await svc.createRound({ month: "2026-05" });
    expect(mockDb.paymentRound.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sequence: 5, status: "draft", createdById: "kt1" }),
      }),
    );
  });

  it("sequence starts at 1 when month has no rounds", async () => {
    mockDb.paymentRound.findFirst.mockResolvedValue(null);
    mockDb.paymentRound.create.mockResolvedValue({ id: 1 });
    await svc.createRound({ month: "2026-06" });
    expect(mockDb.paymentRound.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequence: 1 }) }),
    );
  });

  it("throws for a role without create permission", async () => {
    actAs(VIEWER);
    await expect(svc.createRound({ month: "2026-05" })).rejects.toThrow(
      "Không có quyền lập đợt",
    );
  });
});

describe("upsertItem — guards", () => {
  it("throws when the round does not exist", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue(null);
    await expect(
      svc.upsertItem({ roundId: 9, supplierId: 1, entityId: 1, projectId: null, category: "vat_tu", soDeNghi: 100 }),
    ).rejects.toThrow("Không tìm thấy đợt");
  });

  it("throws when the round is not in draft", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "submitted", createdById: "admin1" });
    await expect(
      svc.upsertItem({ roundId: 1, supplierId: 1, entityId: 1, projectId: null, category: "vat_tu", soDeNghi: 100 }),
    ).rejects.toThrow("Chỉ sửa được khi đợt ở trạng thái nháp");
  });

  it("throws when a non-creator non-admin edits items", async () => {
    actAs(KETOAN);
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "draft", createdById: "someone-else" });
    await expect(
      svc.upsertItem({ roundId: 1, supplierId: 1, entityId: 1, projectId: null, category: "vat_tu", soDeNghi: 100 }),
    ).rejects.toThrow("Chỉ người lập đợt được sửa items");
  });

  it("throws on an invalid category (create path)", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "draft", createdById: "admin1" });
    await expect(
      svc.upsertItem({
        roundId: 1, supplierId: 1, entityId: 1, projectId: null,
        category: "bogus" as svc.PaymentCategory, soDeNghi: 100,
      }),
    ).rejects.toThrow("category không hợp lệ");
  });

  it("throws when a non-admin uses override", async () => {
    actAs(KETOAN);
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "draft", createdById: "kt1" });
    await expect(
      svc.upsertItem({
        roundId: 1, supplierId: 1, entityId: 1, projectId: null,
        category: "vat_tu", soDeNghi: 100, override: true,
      }),
    ).rejects.toThrow("Chỉ admin được dùng override");
  });
});

describe("upsertItem — create path", () => {
  beforeEach(() => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "draft", createdById: "admin1" });
    mockDb.paymentRoundItem.create.mockResolvedValue({ id: 1 });
  });

  it("auto-fills congNo/luyKe from balance-service for vat_tu", async () => {
    vi.mocked(getOutstandingDebt).mockResolvedValue(new Prisma.Decimal("500"));
    vi.mocked(getCumulativePaid).mockResolvedValue(new Prisma.Decimal("120"));
    await svc.upsertItem({
      roundId: 1, supplierId: 7, entityId: 3, projectId: null,
      category: "vat_tu", soDeNghi: 1000,
    });
    expect(mockDb.paymentRoundItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ congNo: 500, luyKe: 120, balancesRefreshedAt: expect.any(Date) }),
      }),
    );
  });

  it("defaults congNo/luyKe to 0 for a category with no ledger backing (khac)", async () => {
    await svc.upsertItem({
      roundId: 1, supplierId: 7, entityId: 3, projectId: null,
      category: "khac", soDeNghi: 1000,
    });
    expect(getOutstandingDebt).not.toHaveBeenCalled();
    expect(mockDb.paymentRoundItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ congNo: 0, luyKe: 0 }) }),
    );
  });

  it("trusts explicit congNo/luyKe and does not auto-fill", async () => {
    await svc.upsertItem({
      roundId: 1, supplierId: 7, entityId: 3, projectId: null,
      category: "vat_tu", congNo: 99, luyKe: 11, soDeNghi: 1000,
    });
    expect(getOutstandingDebt).not.toHaveBeenCalled();
    expect(mockDb.paymentRoundItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ congNo: 99, luyKe: 11, balancesRefreshedAt: null }),
      }),
    );
  });
});

describe("refreshItemBalances", () => {
  it("throws when the item does not exist", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue(null);
    await expect(svc.refreshItemBalances(1)).rejects.toThrow("Không tìm thấy dòng");
  });

  it("throws when the parent round is not draft", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({
      category: "vat_tu", entityId: 1, supplierId: 1, projectId: null,
      round: { status: "submitted", createdById: "admin1" },
    });
    await expect(svc.refreshItemBalances(1)).rejects.toThrow(
      "Chỉ có thể làm mới số dư khi đợt ở trạng thái nháp",
    );
  });

  it("throws for a non-creator non-admin", async () => {
    actAs(KETOAN);
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({
      category: "vat_tu", entityId: 1, supplierId: 1, projectId: null,
      round: { status: "draft", createdById: "someone-else" },
    });
    await expect(svc.refreshItemBalances(1)).rejects.toThrow(
      "Chỉ người lập đợt hoặc admin được làm mới số dư",
    );
  });

  it("recomputes congNo/luyKe from balance-service", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({
      category: "vat_tu", entityId: 1, supplierId: 1, projectId: null,
      round: { status: "draft", createdById: "admin1" },
    });
    vi.mocked(getOutstandingDebt).mockResolvedValue(new Prisma.Decimal("777"));
    vi.mocked(getCumulativePaid).mockResolvedValue(new Prisma.Decimal("333"));
    mockDb.paymentRoundItem.update.mockResolvedValue({ id: 1 });
    await svc.refreshItemBalances(1);
    expect(mockDb.paymentRoundItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ congNo: 777, luyKe: 333, balancesRefreshedAt: expect.any(Date) }),
      }),
    );
  });
});

describe("deleteItem", () => {
  it("throws when the item does not exist", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue(null);
    await expect(svc.deleteItem(1)).rejects.toThrow("Không tìm thấy dòng");
  });

  it("throws when the round is not draft", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({
      round: { status: "submitted", createdById: "admin1" },
    });
    await expect(svc.deleteItem(1)).rejects.toThrow("Chỉ xoá được khi nháp");
  });

  it("throws for a non-creator non-admin", async () => {
    actAs(KETOAN);
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({
      round: { status: "draft", createdById: "someone-else" },
    });
    await expect(svc.deleteItem(1)).rejects.toThrow("Không có quyền");
  });

  it("deletes when the creator removes a draft item", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({
      round: { status: "draft", createdById: "admin1" },
    });
    mockDb.paymentRoundItem.delete.mockResolvedValue({ id: 1 });
    await svc.deleteItem(1);
    expect(mockDb.paymentRoundItem.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});

describe("submitRound", () => {
  it("throws when the round does not exist", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue(null);
    await expect(svc.submitRound(1)).rejects.toThrow("Không tìm thấy đợt");
  });

  it("throws when submitting from a non-draft state", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "submitted", createdById: "admin1" });
    await expect(svc.submitRound(1)).rejects.toThrow("Chỉ submit được từ trạng thái nháp");
  });

  it("throws for a non-creator non-admin", async () => {
    actAs(KETOAN);
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "draft", createdById: "someone-else" });
    await expect(svc.submitRound(1)).rejects.toThrow("Không có quyền submit");
  });

  it("throws when the round has no items", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "draft", createdById: "admin1" });
    mockDb.paymentRoundItem.count.mockResolvedValue(0);
    await expect(svc.submitRound(1)).rejects.toThrow("Đợt phải có ít nhất 1 dòng");
  });

  it("moves a non-empty draft round to submitted", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "draft", createdById: "admin1" });
    mockDb.paymentRoundItem.count.mockResolvedValue(2);
    mockDb.paymentRound.update.mockResolvedValue({ id: 1 });
    await svc.submitRound(1);
    expect(mockDb.paymentRound.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "submitted", submittedAt: expect.any(Date) }),
      }),
    );
  });
});

describe("approveItem", () => {
  it("throws when the actor cannot approve", async () => {
    actAs(KETOAN);
    await expect(svc.approveItem({ itemId: 1 })).rejects.toThrow(
      "Chỉ Giám đốc/admin được duyệt",
    );
  });

  it("throws when the item does not exist", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue(null);
    await expect(svc.approveItem({ itemId: 1 })).rejects.toThrow("Không tìm thấy dòng");
  });

  it("throws when the round is not submitted", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({
      soDeNghi: 100, round: { id: 1, status: "draft" },
    });
    await expect(svc.approveItem({ itemId: 1 })).rejects.toThrow(
      "Đợt phải ở trạng thái đã gửi mới được duyệt",
    );
  });

  it("director can approve; defaults soDuyet to soDeNghi", async () => {
    actAs(DIRECTOR);
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({
      soDeNghi: 250, round: { id: 1, status: "submitted" },
    });
    mockDb.paymentRoundItem.update.mockResolvedValue({ id: 1 });
    mockDb.paymentRoundItem.count.mockResolvedValue(2);
    await svc.approveItem({ itemId: 1 });
    expect(mockDb.paymentRoundItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ soDuyet: 250, approvedById: "dir1" }),
      }),
    );
  });

  it("auto-approves the round once every item is resolved", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({
      soDeNghi: 100, round: { id: 1, status: "submitted" },
    });
    mockDb.paymentRoundItem.update.mockResolvedValue({ id: 1 });
    mockDb.paymentRoundItem.count.mockResolvedValue(3);
    mockDb.paymentRound.update.mockResolvedValue({ id: 1 });
    await svc.approveItem({ itemId: 1, soDuyet: 90 });
    expect(mockDb.paymentRound.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "approved" }) }),
    );
  });
});

describe("rejectItem", () => {
  it("throws when the actor cannot approve", async () => {
    actAs(VIEWER);
    await expect(svc.rejectItem(1)).rejects.toThrow("Chỉ Giám đốc/admin được từ chối");
  });

  it("throws when the item does not exist", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue(null);
    await expect(svc.rejectItem(1)).rejects.toThrow("Không tìm thấy dòng");
  });

  it("throws when the round is not submitted", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({ round: { id: 1, status: "approved" } });
    await expect(svc.rejectItem(1)).rejects.toThrow("Đợt phải ở trạng thái đã gửi");
  });

  it("sets soDuyet to 0 on reject", async () => {
    mockDb.paymentRoundItem.findUnique.mockResolvedValue({ round: { id: 1, status: "submitted" } });
    mockDb.paymentRoundItem.update.mockResolvedValue({ id: 1 });
    mockDb.paymentRoundItem.count.mockResolvedValue(2);
    await svc.rejectItem(1);
    expect(mockDb.paymentRoundItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ soDuyet: 0 }) }),
    );
  });
});

describe("bulkApproveAsRequested", () => {
  it("throws when the actor cannot approve", async () => {
    actAs(KETOAN);
    await expect(svc.bulkApproveAsRequested(1)).rejects.toThrow(
      "Chỉ Giám đốc/admin được duyệt",
    );
  });

  it("throws when the round is not submitted", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "draft" });
    await expect(svc.bulkApproveAsRequested(1)).rejects.toThrow("Đợt phải ở trạng thái đã gửi");
  });

  it("approves every unapproved item as requested", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "submitted" });
    mockDb.paymentRoundItem.findMany.mockResolvedValue([
      { id: 1, soDeNghi: 100 },
      { id: 2, soDeNghi: 200 },
    ]);
    mockDb.paymentRoundItem.update.mockResolvedValue({ id: 1 });
    mockDb.paymentRoundItem.count.mockResolvedValue(2);
    mockDb.paymentRound.update.mockResolvedValue({ id: 1 });
    await svc.bulkApproveAsRequested(1);
    expect(mockDb.paymentRoundItem.update).toHaveBeenCalledTimes(2);
    expect(mockDb.paymentRound.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "approved" }) }),
    );
  });
});

describe("rejectRound", () => {
  it("throws when the actor cannot approve", async () => {
    actAs(KETOAN);
    await expect(svc.rejectRound(1, "no")).rejects.toThrow(
      "Chỉ Giám đốc/admin được từ chối",
    );
  });

  it("throws when the round is not submitted", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "draft" });
    await expect(svc.rejectRound(1, "no")).rejects.toThrow("Đợt phải ở trạng thái đã gửi");
  });

  it("rejects a submitted round and records the reason", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "submitted" });
    mockDb.paymentRound.update.mockResolvedValue({ id: 1 });
    await svc.rejectRound(1, "sai số liệu");
    expect(mockDb.paymentRound.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "rejected", note: "sai số liệu" }),
      }),
    );
  });
});

describe("closeRound", () => {
  it("throws when the actor is not an admin", async () => {
    actAs(DIRECTOR);
    await expect(svc.closeRound(1)).rejects.toThrow("Chỉ admin được đóng đợt");
  });

  it("throws when the round is not approved", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "submitted" });
    await expect(svc.closeRound(1)).rejects.toThrow("Chỉ đóng được đợt đã duyệt");
  });

  it("closes an approved round", async () => {
    mockDb.paymentRound.findUnique.mockResolvedValue({ status: "approved" });
    mockDb.paymentRound.update.mockResolvedValue({ id: 1 });
    await svc.closeRound(1);
    expect(mockDb.paymentRound.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "closed" }) }),
    );
  });
});

describe("aggregateMonth", () => {
  it("maps raw SQL rows to typed AggregateRow objects", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      {
        supplier_id: 1, supplier_name: "NCC A", category: "vat_tu",
        entity_id: 2, entity_name: "Cty X", so_de_nghi: "1000", so_duyet: "900",
      },
    ]);
    const rows = await svc.aggregateMonth("2026-05");
    expect(rows).toEqual([
      {
        supplierId: 1, supplierName: "NCC A", category: "vat_tu",
        entityId: 2, entityName: "Cty X", soDeNghi: 1000, soDuyet: 900,
      },
    ]);
  });
});
