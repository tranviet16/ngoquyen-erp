import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  coordinationForm: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));

import { nextFormCode, isUniqueViolation } from "@/lib/coordination-form/code-generator";

beforeEach(() => vi.resetAllMocks());

describe("nextFormCode", () => {
  it("formats PCV-YYYYMM-NNN with a zero-padded sequence", async () => {
    mockDb.coordinationForm.count.mockResolvedValue(0);
    expect(await nextFormCode(new Date("2026-05-16T00:00:00Z"))).toBe("PCV-202605-001");
  });

  it("increments the sequence past the current month's count", async () => {
    mockDb.coordinationForm.count.mockResolvedValue(41);
    expect(await nextFormCode(new Date("2026-12-01T00:00:00Z"))).toBe("PCV-202612-042");
  });

  it("scopes the count query to the current month prefix", async () => {
    mockDb.coordinationForm.count.mockResolvedValue(0);
    await nextFormCode(new Date("2026-05-16T00:00:00Z"));
    expect(mockDb.coordinationForm.count).toHaveBeenCalledWith({
      where: { code: { startsWith: "PCV-202605-" } },
    });
  });
});

describe("isUniqueViolation", () => {
  it("is true for a Prisma P2002 error", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
  });

  it("is false for other errors, null and primitives", () => {
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation("P2002")).toBe(false);
  });
});
