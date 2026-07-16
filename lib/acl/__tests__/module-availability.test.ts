import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_KEYS } from "../modules";

vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

const mockFindMany = vi.fn();

vi.mock("../../prisma", () => ({
  prisma: {
    moduleAvailability: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import {
  assertModuleReleased,
  getModuleAvailability,
  isModuleReleased,
  loadModuleAvailabilityMap,
} from "../module-availability";

const readyRows = () =>
  MODULE_KEYS.map((moduleKey) => ({ moduleKey, status: "ready" }));

beforeEach(() => {
  vi.restoreAllMocks();
  mockFindMany.mockReset();
  mockFindMany.mockResolvedValue(readyRows());
});

describe("module availability resolver", () => {
  it("loads all statuses with one bulk query", async () => {
    const availability = await loadModuleAvailabilityMap();

    expect(mockFindMany).toHaveBeenCalledOnce();
    expect(mockFindMany).toHaveBeenCalledWith({
      select: { moduleKey: true, status: true },
    });
    expect(availability.dashboard).toBe("ready");
    expect(Object.keys(availability)).toHaveLength(MODULE_KEYS.length);
  });

  it("fails closed for a missing row", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFindMany.mockResolvedValue(
      readyRows().filter((row) => row.moduleKey !== "du-an"),
    );

    expect(await getModuleAvailability("du-an")).toBe("development");
    expect(log).toHaveBeenCalled();
  });

  it("fails closed for an invalid status", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFindMany.mockResolvedValue(
      readyRows().map((row) =>
        row.moduleKey === "du-an" ? { ...row, status: "unknown" } : row,
      ),
    );

    expect(await isModuleReleased("du-an")).toBe(false);
    expect(log).toHaveBeenCalled();
  });

  it("fails closed without exposing a database error", async () => {
    const error = new Error("postgres://user:secret@db/private");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFindMany.mockRejectedValue(error);

    expect(await getModuleAvailability("tai-chinh")).toBe("development");
    expect(log).toHaveBeenCalledWith(
      "[acl.module-availability] Availability query failed; failing closed",
    );
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("secret"));
  });

  it("asserts that development modules cannot execute", async () => {
    mockFindMany.mockResolvedValue(
      readyRows().map((row) =>
        row.moduleKey === "du-an" ? { ...row, status: "development" } : row,
      ),
    );

    await expect(assertModuleReleased("du-an")).rejects.toThrow(
      'Module "du-an" is in development',
    );
  });
});
