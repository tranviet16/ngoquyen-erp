import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  task: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  department: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const mockAuth = vi.hoisted(() => ({ getSession: vi.fn() }));
const mockCtx = vi.hoisted(() => ({ getUserContext: vi.fn() }));
const mockAccess = vi.hoisted(() => ({
  getDeptAccessMap: vi.fn(),
  hasDeptAccess: vi.fn(),
  assertDeptAccess: vi.fn(),
}));
const mockAcl = vi.hoisted(() => ({ canAccessEntitlement: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: mockAuth } }));
vi.mock("@/lib/department-rbac", () => ({ getUserContext: mockCtx.getUserContext }));
vi.mock("@/lib/dept-access", () => mockAccess);
vi.mock("@/lib/acl/effective", () => mockAcl);
vi.mock("@/lib/notification/notification-service", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/task/subtask-service", () => ({ getChildCounts: vi.fn().mockResolvedValue(new Map()) }));

import {
  createTaskManual,
  updateTask,
  assignTask,
  moveTask,
  deleteTask,
  getTaskById,
  listDeptMembers,
} from "@/lib/task/task-service";

const baseCtx = {
  userId: "u1",
  departmentId: 10,
  isLeader: false,
  isDirector: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.getSession.mockResolvedValue({ user: { id: "u1", role: "viewer" } });
  mockCtx.getUserContext.mockResolvedValue(baseCtx);
  mockAccess.getDeptAccessMap.mockResolvedValue({ scope: "all", grants: new Map() });
  mockAccess.hasDeptAccess.mockReturnValue(false);
  mockAcl.canAccessEntitlement.mockResolvedValue(true);
  mockDb.$transaction.mockImplementation((fn) => fn(mockDb));
});

describe("createTaskManual", () => {
  it("rejects an invalid title via schema validation", async () => {
    await expect(
      createTaskManual({ title: "ab", deptId: 10, assigneeId: "u1" } as never),
    ).rejects.toThrow();
  });

  it("rejects a missing assigneeId via schema validation", async () => {
    await expect(
      createTaskManual({ title: "Task hợp lệ", deptId: 10 } as never),
    ).rejects.toThrow();
  });

  it("rejects creation when the caller lacks create access to the input department", async () => {
    mockAcl.canAccessEntitlement.mockResolvedValue(false);
    await expect(
      createTaskManual({ title: "Task hợp lệ", deptId: 10, assigneeId: "u2" } as never),
    ).rejects.toThrow(/quyền/);
    expect(mockAcl.canAccessEntitlement).toHaveBeenCalledWith("u1", "van-hanh.cong-viec", {
      minLevel: "create",
      scope: { kind: "dept", deptId: 10 },
    });
  });

  it("rejects an inactive department", async () => {
    mockDb.department.findUnique.mockResolvedValue({ id: 10, isActive: false });
    await expect(
      createTaskManual({ title: "Task hợp lệ", deptId: 10, assigneeId: "u1" } as never),
    ).rejects.toThrow(/Phòng ban không hợp lệ/);
  });

  it("creates a task for another member when the caller has create access", async () => {
    mockDb.department.findUnique.mockResolvedValue({ id: 10, isActive: true });
    mockDb.user.findUnique.mockResolvedValue({ departmentId: 10 });
    mockDb.task.create.mockResolvedValue({ id: 5, title: "Task hợp lệ", deptId: 10 });
    const task = await createTaskManual(
      { title: "Task hợp lệ", deptId: 10, assigneeId: "u2" } as never,
    );
    expect(task.id).toBe(5);
    expect(mockDb.task.create).toHaveBeenCalledOnce();
    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
  });

  it("rejects an assignee outside the task department", async () => {
    mockDb.department.findUnique.mockResolvedValue({ id: 10, isActive: true });
    mockDb.user.findUnique.mockResolvedValue({ departmentId: 99 });
    await expect(
      createTaskManual({ title: "Task hợp lệ", deptId: 10, assigneeId: "u2" } as never),
    ).rejects.toThrow(/phải thuộc phòng đã chọn/);
  });
});

describe("updateTask", () => {
  it("rejects editing a completed task", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    mockDb.task.findUnique.mockResolvedValue({ id: 1, deptId: 10, creatorId: "u1", status: "done" });
    await expect(updateTask(1, { title: "Tên mới" } as never)).rejects.toThrow(/đã hoàn thành/);
  });

  it("rejects a creator without edit access", async () => {
    mockAcl.canAccessEntitlement.mockResolvedValue(false);
    mockDb.task.findUnique.mockResolvedValue({ id: 1, deptId: 10, creatorId: "u1", status: "todo" });
    await expect(updateTask(1, { title: "Tên mới" } as never)).rejects.toThrow(/quyền/);
    expect(mockAcl.canAccessEntitlement).toHaveBeenCalledWith("u1", "van-hanh.cong-viec", {
      minLevel: "edit",
      scope: { kind: "dept", deptId: 10 },
    });
  });

  it("writes only the provided patch fields for an editor", async () => {
    mockDb.task.findUnique.mockResolvedValue({ id: 1, deptId: 10, creatorId: "other", status: "todo" });
    mockDb.task.update.mockResolvedValue({ id: 1, title: "Tên mới" });
    await updateTask(1, { title: "Tên mới" } as never);
    expect(Object.keys(mockDb.task.update.mock.calls[0][0].data)).toEqual(["title"]);
    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
  });
});

describe("assignTask", () => {
  it("rejects assignment without edit access", async () => {
    mockAcl.canAccessEntitlement.mockResolvedValue(false);
    mockDb.task.findUnique.mockResolvedValue({ id: 1, deptId: 10, creatorId: "u1", status: "todo" });
    await expect(assignTask(1, "u2")).rejects.toThrow(/quyền/);
  });

  it("assigns when the caller has edit access", async () => {
    mockDb.task.findUnique.mockResolvedValue({ id: 1, deptId: 10, creatorId: "u1", status: "todo" });
    mockDb.user.findUnique.mockResolvedValue({ departmentId: 10 });
    mockDb.task.update.mockResolvedValue({ id: 1, title: "T", assigneeId: "u2" });
    const updated = await assignTask(1, "u2");
    expect(updated.assigneeId).toBe("u2");
    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
  });
});

describe("moveTask", () => {
  it("rejects an invalid target status", async () => {
    await expect(moveTask(1, "bogus" as never)).rejects.toThrow(/Trạng thái không hợp lệ/);
  });

  it("moves a task when the caller has edit access", async () => {
    mockDb.task.findUnique.mockResolvedValue({
      id: 1, deptId: 10, creatorId: "u1", assigneeId: null, status: "todo", sourceFormId: null, parentId: null,
    });
    mockDb.task.update.mockResolvedValue({ id: 1, title: "T", status: "doing" });
    const updated = await moveTask(1, "doing");
    expect(updated.status).toBe("doing");
    expect(mockDb.task.update.mock.calls[0][0].data.status).toBe("doing");
  });

  it("rejects a transition without edit access", async () => {
    mockAcl.canAccessEntitlement.mockResolvedValue(false);
    mockDb.task.findUnique.mockResolvedValue({
      id: 1, deptId: 10, creatorId: "other", assigneeId: "other", status: "todo", sourceFormId: null, parentId: null,
    });
    await expect(moveTask(1, "done")).rejects.toThrow(/quyền/);
  });
});

describe("deleteTask", () => {
  it("rejects deletion without edit access", async () => {
    mockAcl.canAccessEntitlement.mockResolvedValue(false);
    mockDb.task.findUnique.mockResolvedValue({ id: 1, deptId: 10, creatorId: "u1", status: "todo" });
    await expect(deleteTask(1)).rejects.toThrow(/quyền/);
  });

  it("deletes a task created by another user when the caller has edit access", async () => {
    mockDb.task.findUnique.mockResolvedValue({ id: 1, deptId: 10, creatorId: "other", status: "todo" });
    await deleteTask(1);
    expect(mockDb.task.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
  });

  it("keeps the todo-only deletion business rule for an editor", async () => {
    mockDb.task.findUnique.mockResolvedValue({ id: 1, deptId: 10, creatorId: "other", status: "doing" });
    await expect(deleteTask(1)).rejects.toThrow(/trạng thái cần làm/);
  });
});

describe("getTaskById", () => {
  it("throws when the task does not exist", async () => {
    mockDb.task.findUnique.mockResolvedValue(null);
    await expect(getTaskById(1)).rejects.toThrow(/Không tìm thấy task/);
  });

  it("returns the task when the caller is the creator", async () => {
    mockDb.task.findUnique.mockResolvedValue({ id: 1, deptId: 10, creatorId: "u1" });
    expect((await getTaskById(1)).id).toBe(1);
  });
});

describe("listDeptMembers", () => {
  it("queries active members of a department ordered by name", async () => {
    mockDb.user.findMany.mockResolvedValue([{ id: "u1", name: "An", email: "a@x" }]);
    const members = await listDeptMembers(10);
    expect(members).toHaveLength(1);
    expect(mockDb.user.findMany.mock.calls[0][0].where).toEqual({ departmentId: 10 });
  });
});
