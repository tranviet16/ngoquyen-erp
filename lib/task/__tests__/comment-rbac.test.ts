import { describe, it, expect } from "vitest";
import {
  canEditComment,
  canDeleteComment,
  COMMENT_EDIT_WINDOW_MS,
} from "@/lib/task/comment-rbac";
import type { UserContext } from "@/lib/department-rbac";

const NOW = new Date("2026-05-16T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const ctx = (over: Partial<UserContext> = {}): UserContext => ({
  userId: "u1",
  departmentId: 4,
  isLeader: false,
  isDirector: false,
  ...over,
});

describe("canEditComment", () => {
  it("lets the author edit within the edit window", () => {
    expect(
      canEditComment({ authorId: "u1", createdAt: ago(60_000) }, "u1", NOW),
    ).toBe(true);
  });

  it("is false once the edit window has elapsed", () => {
    expect(
      canEditComment(
        { authorId: "u1", createdAt: ago(COMMENT_EDIT_WINDOW_MS + 1) },
        "u1",
        NOW,
      ),
    ).toBe(false);
  });

  it("is false for a non-author even within the window", () => {
    expect(
      canEditComment({ authorId: "u2", createdAt: ago(1000) }, "u1", NOW),
    ).toBe(false);
  });
});

describe("canDeleteComment", () => {
  const task = { deptId: 4 };

  it("admin can always delete", () => {
    expect(canDeleteComment({ authorId: "x" }, task, ctx(), "admin")).toBe(true);
  });

  it("the author can delete their own comment", () => {
    expect(canDeleteComment({ authorId: "u1" }, task, ctx(), "viewer")).toBe(true);
  });

  it("a leader of the task's department can delete", () => {
    expect(
      canDeleteComment({ authorId: "x" }, task, ctx({ isLeader: true }), "viewer"),
    ).toBe(true);
  });

  it("a leader of a different department cannot delete", () => {
    expect(
      canDeleteComment(
        { authorId: "x" },
        task,
        ctx({ isLeader: true, departmentId: 9 }),
        "viewer",
      ),
    ).toBe(false);
  });

  it("a non-author non-leader cannot delete", () => {
    expect(canDeleteComment({ authorId: "x" }, task, ctx(), "viewer")).toBe(false);
  });
});
