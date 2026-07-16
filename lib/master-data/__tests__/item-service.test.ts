import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

const mockDb = vi.hoisted(() => ({
  item: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  rolePermission: { findMany: vi.fn() },
}));
const mockAuth = vi.hoisted(() => ({ getSession: vi.fn() }));
const mockAvailability = vi.hoisted(() => ({
  requireReleasedModuleRequest: vi.fn(),
  isModuleReleased: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: mockAuth } }));
vi.mock("@/lib/acl/module-availability", () => ({
  isModuleReleased: mockAvailability.isModuleReleased,
}));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: mockAvailability.requireReleasedModuleRequest,
}));

import {
  listItems,
  getItemById,
  createItem,
  softDeleteItem,
} from "@/lib/master-data/item-service";
import { rolePermissionFindMany } from "@/lib/acl/__tests__/_role-permission-fixture";

beforeEach(() => {
  vi.resetAllMocks();
  mockAvailability.requireReleasedModuleRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });
  mockAvailability.isModuleReleased.mockResolvedValue(true);
  mockDb.rolePermission.findMany.mockImplementation(rolePermissionFindMany);
});

describe("listItems", () => {
  it("defaults to page 1, excludes deleted, and paginates", async () => {
    mockDb.item.findMany.mockResolvedValue([{ id: 1 }]);
    mockDb.item.count.mockResolvedValue(1);
    const res = await listItems();
    expect(res).toEqual({ items: [{ id: 1 }], total: 1, page: 1, pageSize: 20 });
    const arg = mockDb.item.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ deletedAt: null });
    expect(arg.skip).toBe(0);
  });

  it("builds a case-insensitive OR search and a type filter", async () => {
    mockDb.item.findMany.mockResolvedValue([]);
    mockDb.item.count.mockResolvedValue(0);
    await listItems({ search: "thep", type: "vat_tu", page: 3, pageSize: 10 });
    const arg = mockDb.item.findMany.mock.calls[0][0];
    expect(arg.where.type).toBe("vat_tu");
    expect(arg.where.OR).toHaveLength(2);
    expect(arg.skip).toBe(20);
  });

  it("includes deleted rows when asked", async () => {
    mockDb.item.findMany.mockResolvedValue([]);
    mockDb.item.count.mockResolvedValue(0);
    await listItems({ includeDeleted: true });
    expect(mockDb.item.findMany.mock.calls[0][0].where).toEqual({});
  });
});

describe("getItemById", () => {
  it("looks the item up by id", async () => {
    mockDb.item.findUnique.mockResolvedValue({ id: 5 });
    expect(await getItemById(5)).toEqual({ id: 5 });
  });
});

describe("item-service RBAC", () => {
  it("createItem rejects a viewer", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "viewer" } });
    await expect(createItem({} as never)).rejects.toThrow(/Forbidden/);
  });

  it("softDeleteItem rejects a non-admin (ketoan)", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "ketoan" } });
    await expect(softDeleteItem(1)).rejects.toThrow(/Forbidden/);
  });
});
