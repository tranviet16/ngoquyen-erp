import { describe, it, expect } from "vitest";
import { parsePeriod, previousPeriod, quarterOf, formatPeriod } from "../period";

describe("quarterOf", () => {
  it("Jan-Mar → Q1", () => {
    expect(quarterOf(new Date(2026, 0, 15))).toBe(1);
    expect(quarterOf(new Date(2026, 2, 31))).toBe(1);
  });
  it("Apr-Jun → Q2", () => expect(quarterOf(new Date(2026, 4, 1))).toBe(2));
  it("Oct-Dec → Q4", () => expect(quarterOf(new Date(2026, 11, 31))).toBe(4));
});

describe("parsePeriod — defaults", () => {
  it("falls back to current month/year when nothing supplied", () => {
    const now = new Date(2026, 4, 11);
    const p = parsePeriod({}, now);
    expect(p.kind).toBe("month");
    expect(p.year).toBe(2026);
    expect(p.month).toBe(5);
    expect(p.range.from).toEqual(new Date(2026, 4, 1, 0, 0, 0, 0));
    expect(p.range.to).toEqual(new Date(2026, 5, 0, 23, 59, 59, 999));
  });

  it("clamps invalid month to current", () => {
    const now = new Date(2026, 5, 1);
    expect(parsePeriod({ period: "month", month: "99" }, now).month).toBe(12);
    expect(parsePeriod({ period: "month", month: "0" }, now).month).toBe(1);
  });
});

describe("parsePeriod — month boundaries", () => {
  it("February has 28 days in 2026", () => {
    const p = parsePeriod({ period: "month", year: "2026", month: "2" });
    expect(p.range.to.getDate()).toBe(28);
  });
  it("February has 29 days in 2024 (leap)", () => {
    const p = parsePeriod({ period: "month", year: "2024", month: "2" });
    expect(p.range.to.getDate()).toBe(29);
  });
});

describe("parsePeriod — quarter", () => {
  it("Q2 2026 spans Apr 1 → Jun 30", () => {
    const p = parsePeriod({ period: "quarter", year: "2026", q: "2" });
    expect(p.range.from).toEqual(new Date(2026, 3, 1, 0, 0, 0, 0));
    expect(p.range.to).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999));
  });
  it("Q4 2026 spans Oct 1 → Dec 31", () => {
    const p = parsePeriod({ period: "quarter", year: "2026", q: "4" });
    expect(p.range.from).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
    expect(p.range.to).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });
});

describe("parsePeriod — year", () => {
  it("year covers Jan 1 → Dec 31", () => {
    const p = parsePeriod({ period: "year", year: "2026" });
    expect(p.range.from).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(p.range.to).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });
});

describe("previousPeriod", () => {
  it("month: Feb 2026 → Jan 2026", () => {
    const p = parsePeriod({ period: "month", year: "2026", month: "2" });
    const prev = previousPeriod(p);
    expect(prev.from).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(prev.to).toEqual(new Date(2026, 1, 0, 23, 59, 59, 999));
  });

  it("month: Jan 2026 → Dec 2025 (year wrap)", () => {
    const p = parsePeriod({ period: "month", year: "2026", month: "1" });
    const prev = previousPeriod(p);
    expect(prev.from).toEqual(new Date(2025, 11, 1, 0, 0, 0, 0));
    expect(prev.to).toEqual(new Date(2025, 12, 0, 23, 59, 59, 999));
  });

  it("quarter: Q1 2026 → Q4 2025", () => {
    const p = parsePeriod({ period: "quarter", year: "2026", q: "1" });
    const prev = previousPeriod(p);
    expect(prev.from).toEqual(new Date(2025, 9, 1, 0, 0, 0, 0));
    expect(prev.to.getMonth()).toBe(11);
  });

  it("year: 2026 → 2025", () => {
    const p = parsePeriod({ period: "year", year: "2026" });
    const prev = previousPeriod(p);
    expect(prev.from).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
    expect(prev.to).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
  });
});

describe("formatPeriod", () => {
  it("formats each kind", () => {
    expect(formatPeriod(parsePeriod({ period: "month", year: "2026", month: "5" }))).toBe(
      "Tháng 5/2026",
    );
    expect(formatPeriod(parsePeriod({ period: "quarter", year: "2026", q: "2" }))).toBe(
      "Q2/2026",
    );
    expect(formatPeriod(parsePeriod({ period: "year", year: "2026" }))).toBe("Năm 2026");
  });
});
