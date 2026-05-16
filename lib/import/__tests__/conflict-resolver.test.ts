import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  supplier: { findMany: vi.fn() },
  contractor: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  project: { findMany: vi.fn() },
  entity: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));

import {
  resolveSupplier,
  resolveContractor,
  resolveItem,
  resolveProject,
  resolveEntity,
} from "@/lib/import/conflict-resolver";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("conflict-resolver — ranking", () => {
  it("ranks candidates by token-overlap score, descending", async () => {
    mockDb.supplier.findMany.mockResolvedValue([
      { id: "s1", name: "Cong ty Vat Lieu Xay Dung" },
      { id: "s2", name: "Cong ty Vat Lieu" },
      { id: "s3", name: "Hoan toan khac biet" },
    ]);
    const res = await resolveSupplier("Cong ty Vat Lieu");
    expect(res.entityType).toBe("supplier");
    expect(res.sourceName).toBe("Cong ty Vat Lieu");
    // s2 is an exact token-set match → score 1, ranks first
    expect(res.candidates[0].id).toBe("s2");
    expect(res.candidates[0].score).toBe(1);
    expect(res.candidates[0].score).toBeGreaterThanOrEqual(res.candidates[1].score);
  });

  it("filters out zero-overlap candidates entirely", async () => {
    mockDb.item.findMany.mockResolvedValue([
      { id: "i1", name: "Xi mang" },
      { id: "i2", name: "Khong lien quan gi" },
    ]);
    const res = await resolveItem("Xi mang");
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].id).toBe("i1");
  });

  it("caps results at the top 5 matches", async () => {
    mockDb.project.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `Du an ${i}` })),
    );
    const res = await resolveProject("Du an");
    expect(res.candidates.length).toBeLessThanOrEqual(5);
  });

  it("returns an empty candidate list when nothing overlaps", async () => {
    mockDb.contractor.findMany.mockResolvedValue([{ id: "c1", name: "ABC" }]);
    const res = await resolveContractor("XYZ");
    expect(res.candidates).toEqual([]);
  });

  it("queries only non-deleted rows", async () => {
    mockDb.entity.findMany.mockResolvedValue([]);
    await resolveEntity("Chu the A");
    expect(mockDb.entity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });
});
