import { describe, it, expect } from "vitest";
import { getOverdueLabel, countByLabel, OVERDUE_LABEL_VI } from "@/lib/task/overdue";

const NOW = new Date("2026-05-16T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("getOverdueLabel", () => {
  it("is 'no_deadline' when the task has no deadline", () => {
    expect(getOverdueLabel({ deadline: null, completedAt: null }, NOW)).toBe("no_deadline");
  });

  it("for a completed task, compares completion against the deadline", () => {
    expect(getOverdueLabel({ deadline: day(0), completedAt: day(-1) }, NOW)).toBe("on_track");
    expect(getOverdueLabel({ deadline: day(0), completedAt: day(1) }, NOW)).toBe("overdue");
  });

  it("is 'overdue' for an open task past its deadline", () => {
    expect(getOverdueLabel({ deadline: day(-1), completedAt: null }, NOW)).toBe("overdue");
  });

  it("is 'due_soon' within the soon window and 'on_track' beyond it", () => {
    expect(getOverdueLabel({ deadline: day(2), completedAt: null }, NOW)).toBe("due_soon");
    expect(getOverdueLabel({ deadline: day(10), completedAt: null }, NOW)).toBe("on_track");
  });

  it("honours a custom soonDays window", () => {
    expect(getOverdueLabel({ deadline: day(5), completedAt: null }, NOW, 7)).toBe("due_soon");
  });
});

describe("countByLabel", () => {
  it("tallies a mixed task list by label", () => {
    const counts = countByLabel(
      [
        { deadline: null, completedAt: null },
        { deadline: day(-1), completedAt: null },
        { deadline: day(2), completedAt: null },
        { deadline: day(30), completedAt: null },
      ],
      NOW,
    );
    expect(counts).toEqual({ overdue: 1, due_soon: 1, on_track: 1, no_deadline: 1 });
  });

  it("returns all-zero counts for an empty list", () => {
    expect(countByLabel([], NOW)).toEqual({ overdue: 0, due_soon: 0, on_track: 0, no_deadline: 0 });
  });
});

describe("OVERDUE_LABEL_VI", () => {
  it("has a Vietnamese label for every label key", () => {
    expect(OVERDUE_LABEL_VI.overdue).toBe("Quá hạn");
    expect(Object.values(OVERDUE_LABEL_VI).every(Boolean)).toBe(true);
  });
});
