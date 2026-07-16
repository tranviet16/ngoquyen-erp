import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUser } },
}));

import { requireActiveAdmin } from "@/lib/admin/require-active-admin";

describe("requireActiveAdmin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "admin-active", role: "admin" },
    });
    mocks.findUser.mockResolvedValue({ role: "admin", isActive: true });
  });

  it("denies an unauthenticated request before querying the user", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(requireActiveAdmin()).rejects.toThrow(
      "Phiên đăng nhập đã hết hạn",
    );
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("denies a non-admin using the current database role", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "viewer-1", role: "admin" },
    });
    mocks.findUser.mockResolvedValue({ role: "viewer", isActive: true });

    await expect(requireActiveAdmin()).rejects.toThrow(
      "Chỉ admin được thao tác",
    );
    expect(mocks.findUser).toHaveBeenCalledWith({
      where: { id: "viewer-1" },
      select: { role: true, isActive: true },
    });
  });

  it("denies an inactive admin by exact session user ID", async () => {
    mocks.findUser.mockResolvedValue({ role: "admin", isActive: false });

    await expect(requireActiveAdmin()).rejects.toThrow(
      "Tài khoản đã bị vô hiệu hóa",
    );
    expect(mocks.findUser).toHaveBeenCalledWith({
      where: { id: "admin-active" },
      select: { role: true, isActive: true },
    });
  });

  it("returns the active admin ID", async () => {
    await expect(requireActiveAdmin()).resolves.toBe("admin-active");
  });
});
