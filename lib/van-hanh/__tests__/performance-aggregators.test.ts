import { describe, it, expect } from "vitest";
import { aggregateUser, aggregateDept } from "../performance-aggregators";
import type { CompletedTaskRow } from "../performance-types";

const d = (s: string) => new Date(s);

describe("aggregateUser", () => {
  it("returns null on-time / null avg-close when no completed tasks", () => {
    const m = aggregateUser("u1", "Alice", [], 5, 1);
    expect(m).toEqual({
      userId: "u1",
      name: "Alice",
      completed: 0,
      onTimePct: null,
      avgCloseDays: null,
      overdue: 1,
      active: 5,
    });
  });

  it("counts 100% on-time when all completed before deadline", () => {
    const rows: CompletedTaskRow[] = [
      { createdAt: d("2026-05-01"), completedAt: d("2026-05-03"), deadline: d("2026-05-05") },
      { createdAt: d("2026-05-02"), completedAt: d("2026-05-04"), deadline: d("2026-05-04") }, // exact = on-time
    ];
    const m = aggregateUser("u1", "Alice", rows, 0, 0);
    expect(m.completed).toBe(2);
    expect(m.onTimePct).toBe(100);
    expect(m.avgCloseDays).toBe(2.0);
  });

  it("excludes no-deadline tasks from on-time calc but counts in completed", () => {
    const rows: CompletedTaskRow[] = [
      { createdAt: d("2026-05-01"), completedAt: d("2026-05-03"), deadline: d("2026-05-02") }, // late
      { createdAt: d("2026-05-01"), completedAt: d("2026-05-02"), deadline: null },           // no deadline
      { createdAt: d("2026-05-01"), completedAt: d("2026-05-01"), deadline: d("2026-05-02") }, // on-time
    ];
    const m = aggregateUser("u1", "Alice", rows, 0, 0);
    expect(m.completed).toBe(3);
    // 1 on-time / 2 with-deadline = 50%
    expect(m.onTimePct).toBe(50);
  });

  it("computes avg close days from createdAt to completedAt rounded to 1dp", () => {
    const rows: CompletedTaskRow[] = [
      { createdAt: d("2026-05-01T00:00:00Z"), completedAt: d("2026-05-04T00:00:00Z"), deadline: null }, // 3 days
      { createdAt: d("2026-05-01T00:00:00Z"), completedAt: d("2026-05-02T12:00:00Z"), deadline: null }, // 1.5
    ];
    const m = aggregateUser("u1", "Alice", rows, 0, 0);
    expect(m.avgCloseDays).toBe(2.3); // (3 + 1.5) / 2 = 2.25 → 2.3 (toFixed(1) rounds half up to even? Actually 2.25 → 2.3)
  });

  it("treats 0% on-time as zero, not null", () => {
    const rows: CompletedTaskRow[] = [
      { createdAt: d("2026-05-01"), completedAt: d("2026-05-05"), deadline: d("2026-05-02") },
    ];
    const m = aggregateUser("u1", "Alice", rows, 0, 0);
    expect(m.onTimePct).toBe(0);
  });

  it("passes through active and overdue counts unchanged", () => {
    const m = aggregateUser("u1", "Alice", [], 7, 3);
    expect(m.active).toBe(7);
    expect(m.overdue).toBe(3);
  });
});

describe("aggregateDept", () => {
  it("rolls up completed tasks and copies headcount", () => {
    const rows: CompletedTaskRow[] = [
      { createdAt: d("2026-05-01"), completedAt: d("2026-05-02"), deadline: d("2026-05-03") },
    ];
    const m = aggregateDept(7, "KT", "Kế toán", rows, 4, 1, 5);
    expect(m).toMatchObject({
      deptId: 7,
      deptCode: "KT",
      deptName: "Kế toán",
      completed: 1,
      onTimePct: 100,
      overdue: 1,
      active: 4,
      headcount: 5,
    });
    expect(m.perUser).toBeUndefined();
  });

  it("attaches perUser when provided", () => {
    const u = aggregateUser("u1", "A", [], 0, 0);
    const m = aggregateDept(1, "X", "X", [], 0, 0, 1, [u]);
    expect(m.perUser).toEqual([u]);
  });
});
