import { describe, it, expect } from "vitest";
import {
  TASK_STATUSES,
  type TaskStatus,
  type TaskMoveRole,
  canMoveTask,
  isValidTaskStatus,
  taskStatusLabel,
} from "@/lib/task/state-machine";

const ROLES: TaskMoveRole[] = ["assignee", "leader", "creator", "admin", "none"];

describe("taskStatusLabel", () => {
  it("returns a non-empty Vietnamese label for every status", () => {
    for (const s of TASK_STATUSES) {
      expect(taskStatusLabel(s)).toBeTruthy();
    }
    expect(taskStatusLabel("done")).toBe("Hoàn thành");
  });
});

describe("isValidTaskStatus", () => {
  it("accepts every known status", () => {
    for (const s of TASK_STATUSES) expect(isValidTaskStatus(s)).toBe(true);
  });
  it("rejects garbage input", () => {
    for (const s of ["", "DONE", "archived", "todo "]) {
      expect(isValidTaskStatus(s)).toBe(false);
    }
  });
});

describe("canMoveTask", () => {
  it("always allows a no-op move (from === to) for every role", () => {
    for (const role of ROLES) {
      for (const s of TASK_STATUSES) {
        expect(canMoveTask(s, s, role, false)).toBe(true);
      }
    }
  });

  it("admin and leader can move between any two statuses", () => {
    for (const role of ["admin", "leader"] as TaskMoveRole[]) {
      for (const from of TASK_STATUSES) {
        for (const to of TASK_STATUSES) {
          expect(canMoveTask(from, to, role, false)).toBe(true);
          expect(canMoveTask(from, to, role, true)).toBe(true);
        }
      }
    }
  });

  const assigneeAllowed: [TaskStatus, TaskStatus][] = [
    ["todo", "doing"],
    ["doing", "todo"],
    ["doing", "review"],
  ];
  it("assignee may only move along the three allowed edges", () => {
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        if (from === to) continue;
        const allowed = assigneeAllowed.some(([f, t]) => f === from && t === to);
        expect(canMoveTask(from, to, "assignee", false)).toBe(allowed);
      }
    }
  });

  it("creator may move review → done only when the task has no source form", () => {
    expect(canMoveTask("review", "done", "creator", false)).toBe(true);
    expect(canMoveTask("review", "done", "creator", true)).toBe(false);
    expect(canMoveTask("todo", "doing", "creator", false)).toBe(false);
  });

  it("role 'none' can never move a task to a different status", () => {
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        if (from === to) continue;
        expect(canMoveTask(from, to, "none", false)).toBe(false);
      }
    }
  });
});
