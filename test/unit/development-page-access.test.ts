import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canAccessEntitlement: vi.fn(),
  isModuleInDevelopment: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/acl/effective", () => ({
  canAccessEntitlement: mocks.canAccessEntitlement,
}));
vi.mock("@/lib/acl/module-availability", () => ({
  isModuleInDevelopment: mocks.isModuleInDevelopment,
}));

import DevelopmentPage from "@/app/(app)/dang-phat-trien/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.canAccessEntitlement.mockResolvedValue(true);
  mocks.isModuleInDevelopment.mockResolvedValue(true);
});

describe("development page access", () => {
  it("rejects unknown catalog keys before authentication", async () => {
    await expect(
      DevelopmentPage({ searchParams: Promise.resolve({ m: "secret-module" }) }),
    ).rejects.toThrow("REDIRECT:/forbidden");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("checks entitlement before reading rollout status", async () => {
    mocks.canAccessEntitlement.mockResolvedValue(false);
    await expect(
      DevelopmentPage({ searchParams: Promise.resolve({ m: "admin.permissions" }) }),
    ).rejects.toThrow(/REDIRECT:\/forbidden\?m=admin.permissions/);
    expect(mocks.isModuleInDevelopment).not.toHaveBeenCalled();
  });

  it("refuses to spoof a development screen for a released module", async () => {
    mocks.isModuleInDevelopment.mockResolvedValue(false);
    await expect(
      DevelopmentPage({ searchParams: Promise.resolve({ m: "du-an" }) }),
    ).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("renders only after auth, entitlement, and development checks pass", async () => {
    await expect(
      DevelopmentPage({ searchParams: Promise.resolve({ m: "du-an" }) }),
    ).resolves.toBeTruthy();
    expect(mocks.canAccessEntitlement).toHaveBeenCalledWith("user-1", "du-an", {
      minLevel: "read",
      scope: "module",
    });
    expect(mocks.isModuleInDevelopment).toHaveBeenCalledWith("du-an");
  });
});
