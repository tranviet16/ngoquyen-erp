import { describe, it, expect } from "vitest";
import { regroupBySwimlane } from "../regroup-swimlane";
import type { TaskWithRelations } from "../task-service";
import type { TaskStatus } from "../state-machine";

function makeTask(over: Partial<TaskWithRelations>): TaskWithRelations {
  return {
    id: Math.floor(Math.random() * 1e9),
    title: "t",
    description: null,
    status: "todo",
    priority: "trung_binh",
    deadline: null,
    completedAt: null,
    deptId: 1,
    creatorId: "c1",
    assigneeId: null,
    sourceFormId: null,
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignee: null,
    creator: { id: "c1", name: "Creator" },
    dept: { id: 1, code: "KT", name: "Kế toán" },
    sourceForm: null,
    childCounts: { total: 0, done: 0 },
    ...over,
  } as TaskWithRelations;
}

const empty: Record<TaskStatus, TaskWithRelations[]> = {
  todo: [],
  doing: [],
  review: [],
  done: [],
};

describe("regroupBySwimlane", () => {
  it("returns empty array for empty input", () => {
    expect(regroupBySwimlane(empty)).toEqual([]);
  });

  it("groups all-unassigned tasks into single Chưa giao row", () => {
    const groups = regroupBySwimlane({
      ...empty,
      todo: [makeTask({ assigneeId: null }), makeTask({ assigneeId: null })],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].assigneeId).toBeNull();
    expect(groups[0].assigneeName).toBe("Chưa giao");
    expect(groups[0].byStatus.todo).toHaveLength(2);
  });

  it("groups by assignee and sorts by Vietnamese name with unassigned last", () => {
    const groups = regroupBySwimlane({
      ...empty,
      todo: [
        makeTask({ assigneeId: "u3", assignee: { id: "u3", name: "Cường" } }),
        makeTask({ assigneeId: null }),
        makeTask({ assigneeId: "u1", assignee: { id: "u1", name: "An" } }),
        makeTask({ assigneeId: "u2", assignee: { id: "u2", name: "Bình" } }),
      ],
    });
    expect(groups.map((g) => g.assigneeId)).toEqual(["u1", "u2", "u3", null]);
  });

  it("populates all 4 status keys per group", () => {
    const groups = regroupBySwimlane({
      todo: [makeTask({ assigneeId: "u1", assignee: { id: "u1", name: "A" }, status: "todo" })],
      doing: [],
      review: [],
      done: [],
    });
    expect(groups[0].byStatus).toEqual({
      todo: expect.any(Array),
      doing: [],
      review: [],
      done: [],
    });
  });

  it("distributes one assignee's tasks across all matching status columns", () => {
    const u = { id: "u1", name: "A" };
    const groups = regroupBySwimlane({
      todo: [makeTask({ assigneeId: "u1", assignee: u, status: "todo" })],
      doing: [makeTask({ assigneeId: "u1", assignee: u, status: "doing" })],
      review: [],
      done: [makeTask({ assigneeId: "u1", assignee: u, status: "done" })],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].byStatus.todo).toHaveLength(1);
    expect(groups[0].byStatus.doing).toHaveLength(1);
    expect(groups[0].byStatus.review).toHaveLength(0);
    expect(groups[0].byStatus.done).toHaveLength(1);
  });
});
