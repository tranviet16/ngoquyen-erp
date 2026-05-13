import { describe, it, expect } from "vitest";
import { SLA_HOURS, deadlineOf, isOverdue, hoursRemaining } from "../sla";

const now = new Date("2026-05-13T12:00:00Z");
const submitted20h = new Date(now.getTime() - 20 * 3600_000);
const submitted25h = new Date(now.getTime() - 25 * 3600_000);

describe("deadlineOf", () => {
  it("returns null when submittedAt is null", () => {
    expect(deadlineOf({ submittedAt: null })).toBeNull();
  });
  it("returns submittedAt + SLA_HOURS", () => {
    const dl = deadlineOf({ submittedAt: submitted20h });
    expect(dl?.getTime()).toBe(submitted20h.getTime() + SLA_HOURS * 3600_000);
  });
});

describe("isOverdue", () => {
  it("returns false when status is not pending_leader", () => {
    expect(
      isOverdue({ status: "approved", submittedAt: submitted25h, escalatedAt: null }, now),
    ).toBe(false);
  });
  it("returns false when already escalated", () => {
    expect(
      isOverdue(
        { status: "pending_leader", submittedAt: submitted25h, escalatedAt: now },
        now,
      ),
    ).toBe(false);
  });
  it("returns false when within SLA", () => {
    expect(
      isOverdue(
        { status: "pending_leader", submittedAt: submitted20h, escalatedAt: null },
        now,
      ),
    ).toBe(false);
  });
  it("returns true when overdue and not escalated", () => {
    expect(
      isOverdue(
        { status: "pending_leader", submittedAt: submitted25h, escalatedAt: null },
        now,
      ),
    ).toBe(true);
  });
  it("returns false when submittedAt is null", () => {
    expect(
      isOverdue(
        { status: "pending_leader", submittedAt: null, escalatedAt: null },
        now,
      ),
    ).toBe(false);
  });
});

describe("hoursRemaining", () => {
  it("returns null when submittedAt is null", () => {
    expect(hoursRemaining({ submittedAt: null }, now)).toBeNull();
  });
  it("returns positive when within SLA", () => {
    const h = hoursRemaining({ submittedAt: submitted20h }, now);
    expect(h).toBeCloseTo(4, 5);
  });
  it("returns negative when overdue", () => {
    const h = hoursRemaining({ submittedAt: submitted25h }, now);
    expect(h).toBeCloseTo(-1, 5);
  });
});
