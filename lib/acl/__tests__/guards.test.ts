import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canAccessEntitlement: vi.fn(),
  isModuleReleased: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(() => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("../effective", () => ({
  canAccessEntitlement: mocks.canAccessEntitlement,
}));
vi.mock("../module-availability", () => ({
  isModuleReleased: mocks.isModuleReleased,
}));

import { requireModuleAccess } from "../guards";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canAccessEntitlement.mockResolvedValue(true);
  mocks.isModuleReleased.mockResolvedValue(true);
});

describe("requireModuleAccess ordering", () => {
  it("authenticates before checking entitlement or rollout", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(requireModuleAccess("du-an")).rejects.toThrow("redirect:/login");
    expect(mocks.canAccessEntitlement).not.toHaveBeenCalled();
    expect(mocks.isModuleReleased).not.toHaveBeenCalled();
  });

  it("checks entitlement before exposing development status", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "viewer" } });
    mocks.canAccessEntitlement.mockResolvedValue(false);

    await expect(requireModuleAccess("du-an")).rejects.toThrow(
      "redirect:/forbidden?m=du-an&need=read",
    );
    expect(mocks.isModuleReleased).not.toHaveBeenCalled();
  });

  it("redirects an entitled user when the module is in development", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "viewer" } });
    mocks.isModuleReleased.mockResolvedValue(false);

    await expect(requireModuleAccess("du-an")).rejects.toThrow(
      "redirect:/dang-phat-trien?m=du-an",
    );
    expect(mocks.canAccessEntitlement).toHaveBeenCalledBefore(
      mocks.isModuleReleased,
    );
  });

  it("returns session identity only after all gates pass", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", role: "manager" } });

    await expect(requireModuleAccess("du-an")).resolves.toEqual({
      userId: "u1",
      role: "manager",
    });
  });
});
