import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  projectEstimate: { findFirst: vi.fn() },
  projectCategory: { findFirst: vi.fn() },
  $executeRaw: vi.fn(),
}));
const mockAcl = vi.hoisted(() => ({ requireReleasedModuleRequest: vi.fn() }));
const mockCache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("@/lib/acl/released-module-request", () => mockAcl);
vi.mock("next/cache", () => mockCache);

import { reassignTransactionCluster } from "@/lib/du-an/txn-cluster-service";

beforeEach(() => {
  vi.resetAllMocks();
  mockAcl.requireReleasedModuleRequest.mockResolvedValue({ userId: "u1", role: "leader" });
});

describe("reassignTransactionCluster", () => {
  it("requires edit-level project scope BEFORE touching data", async () => {
    mockAcl.requireReleasedModuleRequest.mockRejectedValue(new Error("Forbidden"));
    await expect(reassignTransactionCluster(4, 1, "X-001", 99)).rejects.toThrow("Forbidden");
    expect(mockDb.projectEstimate.findFirst).not.toHaveBeenCalled();
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejects a target estimate outside the project", async () => {
    mockDb.projectEstimate.findFirst.mockResolvedValue(null);
    await expect(reassignTransactionCluster(4, 1, "X-001", 99)).rejects.toThrow(
      "Dòng dự toán đích không tồn tại",
    );
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });

  it("moves the cluster and revalidates the three consuming tabs", async () => {
    mockDb.projectEstimate.findFirst.mockResolvedValue({ categoryId: 7, itemCode: "HM1-VL-002" });
    mockDb.projectCategory.findFirst.mockResolvedValue({ code: "HM2-VL" });
    mockDb.$executeRaw.mockResolvedValue(3);
    const r = await reassignTransactionCluster(4, 5, "HM2-VL-010", 42);
    expect(r.moved).toBe(3);
    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(1);
    const paths = mockCache.revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toEqual([
      "/du-an/4/can-doi-vat-tu",
      "/du-an/4/giao-dich",
      "/du-an/4/dinh-muc",
    ]);
  });

  it("no-ops when target equals source cluster", async () => {
    mockDb.projectEstimate.findFirst.mockResolvedValue({ categoryId: 5, itemCode: "HM2-VL-010" });
    mockDb.projectCategory.findFirst.mockResolvedValue({ code: "HM2-VL" });
    const r = await reassignTransactionCluster(4, 5, "HM2-VL-010", 42);
    expect(r.moved).toBe(0);
    expect(mockDb.$executeRaw).not.toHaveBeenCalled();
  });
});
