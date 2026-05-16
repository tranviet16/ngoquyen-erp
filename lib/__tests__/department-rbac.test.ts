import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));

import {
  getUserContext,
  isDeptLeader,
  getDirectorId,
  getDeptLeaders,
  canSubmitFormToDept,
} from "@/lib/department-rbac";

beforeEach(() => vi.resetAllMocks());

describe("getUserContext", () => {
  it("maps a found user into a UserContext", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "u1", departmentId: 4, isLeader: true, isDirector: false,
    });
    expect(await getUserContext("u1")).toEqual({
      userId: "u1", departmentId: 4, isLeader: true, isDirector: false,
    });
  });
  it("returns null when the user does not exist", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    expect(await getUserContext("ghost")).toBeNull();
  });
});

describe("isDeptLeader", () => {
  it("is true only when the user leads that exact department", async () => {
    mockDb.user.findUnique.mockResolvedValue({ departmentId: 4, isLeader: true });
    expect(await isDeptLeader("u1", 4)).toBe(true);
  });
  it("is false when the user leads a different department", async () => {
    mockDb.user.findUnique.mockResolvedValue({ departmentId: 9, isLeader: true });
    expect(await isDeptLeader("u1", 4)).toBe(false);
  });
  it("is false when the user is not a leader", async () => {
    mockDb.user.findUnique.mockResolvedValue({ departmentId: 4, isLeader: false });
    expect(await isDeptLeader("u1", 4)).toBe(false);
  });
  it("is false when the user is missing", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    expect(await isDeptLeader("u1", 4)).toBe(false);
  });
});

describe("getDirectorId", () => {
  it("returns the earliest director's id", async () => {
    mockDb.user.findFirst.mockResolvedValue({ id: "dir-1" });
    expect(await getDirectorId()).toBe("dir-1");
  });
  it("returns null when there is no director", async () => {
    mockDb.user.findFirst.mockResolvedValue(null);
    expect(await getDirectorId()).toBeNull();
  });
});

describe("getDeptLeaders / canSubmitFormToDept", () => {
  it("lists leader ids for a department", async () => {
    mockDb.user.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    expect(await getDeptLeaders(4)).toEqual(["a", "b"]);
  });
  it("canSubmitFormToDept is true when the department has at least one leader", async () => {
    mockDb.user.findMany.mockResolvedValue([{ id: "a" }]);
    expect(await canSubmitFormToDept(4)).toBe(true);
  });
  it("canSubmitFormToDept is false when the department has no leader", async () => {
    mockDb.user.findMany.mockResolvedValue([]);
    expect(await canSubmitFormToDept(4)).toBe(false);
  });
});
