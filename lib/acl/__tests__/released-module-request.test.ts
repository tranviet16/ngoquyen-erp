import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canAccessEntitlement: vi.fn(),
  isModuleReleased: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/acl/effective", () => ({
  canAccessEntitlement: mocks.canAccessEntitlement,
}));
vi.mock("@/lib/acl/module-availability", () => ({
  isModuleReleased: mocks.isModuleReleased,
}));

import {
  ModuleRequestError,
  moduleRequestStatus,
  requireReleasedModuleRequest,
} from "@/lib/acl/released-module-request";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1", role: "viewer" } });
  mocks.canAccessEntitlement.mockResolvedValue(true);
  mocks.isModuleReleased.mockResolvedValue(true);
});

describe("requireReleasedModuleRequest", () => {
  it("stops unauthenticated requests before entitlement and rollout checks", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireReleasedModuleRequest("du-an")).rejects.toMatchObject({
      reason: "unauthorized",
    });
    expect(mocks.canAccessEntitlement).not.toHaveBeenCalled();
    expect(mocks.isModuleReleased).not.toHaveBeenCalled();
  });

  it("stops users without entitlement before revealing rollout state", async () => {
    mocks.canAccessEntitlement.mockResolvedValue(false);
    await expect(requireReleasedModuleRequest("du-an")).rejects.toMatchObject({
      reason: "forbidden",
    });
    expect(mocks.isModuleReleased).not.toHaveBeenCalled();
  });

  it("blocks an entitled user when the module is in development", async () => {
    mocks.isModuleReleased.mockResolvedValue(false);
    await expect(requireReleasedModuleRequest("du-an")).rejects.toMatchObject({
      reason: "development",
    });
  });

  it("forwards a server-defined resource scope to the entitlement check", async () => {
    const access = {
      minLevel: "read" as const,
      scope: { kind: "project" as const, projectId: 42 },
    };
    await requireReleasedModuleRequest("du-an", access);

    expect(mocks.canAccessEntitlement).toHaveBeenCalledWith("user-1", "du-an", access);
    expect(mocks.isModuleReleased).toHaveBeenCalledWith("du-an");
  });

  it("maps request denials without exposing internal module details", () => {
    expect(moduleRequestStatus(new ModuleRequestError("unauthorized"))).toBe(401);
    expect(moduleRequestStatus(new ModuleRequestError("forbidden"))).toBe(403);
    expect(moduleRequestStatus(new ModuleRequestError("development"))).toBe(503);
    expect(moduleRequestStatus(new Error("database detail"))).toBe(500);
  });
});
