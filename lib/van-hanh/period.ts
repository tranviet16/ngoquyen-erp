/**
 * Pure date-range helpers for the performance dashboard period filter.
 * No DB, no auth, no Next.js APIs — fully unit-testable.
 */

import type { Range } from "./performance-types";

export type PeriodKind = "month" | "quarter" | "year";

export type PeriodInput = {
  period?: string;
  year?: string;
  month?: string;
  q?: string;
};

export type ParsedPeriod = {
  kind: PeriodKind;
  year: number;
  month: number;   // 1-12 (only meaningful when kind === "month")
  quarter: number; // 1-4 (only meaningful when kind === "quarter")
  range: Range;
};

export function quarterOf(d: Date): number {
  return Math.floor(d.getMonth() / 3) + 1;
}

function clampInt(v: number | undefined, min: number, max: number, fallback: number): number {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

export function parsePeriod(sp: PeriodInput, now: Date = new Date()): ParsedPeriod {
  const kind: PeriodKind =
    sp.period === "year" ? "year" : sp.period === "quarter" ? "quarter" : "month";
  const year = clampInt(Number(sp.year), 2000, 2100, now.getFullYear());

  if (kind === "year") {
    return {
      kind,
      year,
      month: 0,
      quarter: 0,
      range: {
        from: new Date(year, 0, 1, 0, 0, 0, 0),
        to: new Date(year, 11, 31, 23, 59, 59, 999),
      },
    };
  }

  if (kind === "quarter") {
    const quarter = clampInt(Number(sp.q), 1, 4, quarterOf(now));
    const startMonth = (quarter - 1) * 3;
    return {
      kind,
      year,
      month: 0,
      quarter,
      range: {
        from: new Date(year, startMonth, 1, 0, 0, 0, 0),
        to: new Date(year, startMonth + 3, 0, 23, 59, 59, 999), // day 0 of next month = last day current
      },
    };
  }

  const month = clampInt(Number(sp.month), 1, 12, now.getMonth() + 1);
  return {
    kind,
    year,
    month,
    quarter: 0,
    range: {
      from: new Date(year, month - 1, 1, 0, 0, 0, 0),
      to: new Date(year, month, 0, 23, 59, 59, 999),
    },
  };
}

/**
 * Returns the period immediately preceding `p`, of the same kind.
 * - month: previous calendar month (handles January → previous December)
 * - quarter: previous calendar quarter (Q1 → Q4 of previous year)
 * - year: previous calendar year
 */
export function previousPeriod(p: ParsedPeriod): Range {
  if (p.kind === "year") {
    const y = p.year - 1;
    return {
      from: new Date(y, 0, 1, 0, 0, 0, 0),
      to: new Date(y, 11, 31, 23, 59, 59, 999),
    };
  }
  if (p.kind === "quarter") {
    let y = p.year;
    let q = p.quarter - 1;
    if (q < 1) {
      q = 4;
      y -= 1;
    }
    const startMonth = (q - 1) * 3;
    return {
      from: new Date(y, startMonth, 1, 0, 0, 0, 0),
      to: new Date(y, startMonth + 3, 0, 23, 59, 59, 999),
    };
  }
  let y = p.year;
  let m = p.month - 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return {
    from: new Date(y, m - 1, 1, 0, 0, 0, 0),
    to: new Date(y, m, 0, 23, 59, 59, 999),
  };
}

const VN_MONTH = (m: number) => `Tháng ${m}`;

export function formatPeriod(p: ParsedPeriod): string {
  if (p.kind === "year") return `Năm ${p.year}`;
  if (p.kind === "quarter") return `Q${p.quarter}/${p.year}`;
  return `${VN_MONTH(p.month)}/${p.year}`;
}
