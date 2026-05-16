import { describe, it, expect } from "vitest";
import { canDeleteAttachment } from "@/lib/task/attachment-rbac";
import type { UserContext } from "@/lib/department-rbac";

const ctx = (over: Partial<UserContext> = {}): UserContext => ({
  userId: "u1",
  departmentId: 4,
  isLeader: false,
  isDirector: false,
  ...over,
});

describe("canDeleteAttachment", () => {
  const task = { deptId: 4 };

  it("admin can always delete", () => {
    expect(canDeleteAttachment({ uploaderId: "x" }, task, ctx(), "admin")).toBe(true);
  });

  it("the uploader can delete their own attachment", () => {
    expect(canDeleteAttachment({ uploaderId: "u1" }, task, ctx(), "viewer")).toBe(true);
  });

  it("a leader of the task's department can delete", () => {
    expect(
      canDeleteAttachment({ uploaderId: "x" }, task, ctx({ isLeader: true }), "viewer"),
    ).toBe(true);
  });

  it("a leader of a different department cannot delete", () => {
    expect(
      canDeleteAttachment(
        { uploaderId: "x" },
        task,
        ctx({ isLeader: true, departmentId: 9 }),
        "viewer",
      ),
    ).toBe(false);
  });

  it("a non-uploader non-leader cannot delete", () => {
    expect(canDeleteAttachment({ uploaderId: "x" }, task, ctx(), "viewer")).toBe(false);
  });
});
