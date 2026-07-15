import type { PeriodKind } from "./state-obligation-report";

export interface MatrixPeriod {
  periodKind: PeriodKind;
  year: number;
  periodIndex: number;
}

export function periodBounds(p: MatrixPeriod): { start: Date; end: Date } {
  const { periodKind, year, periodIndex } = p;
  if (periodKind === "year") {
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
  }
  if (periodKind === "quarter") {
    const q = Math.min(Math.max(periodIndex, 1), 4);
    const startMonth = (q - 1) * 3;
    return {
      start: new Date(Date.UTC(year, startMonth, 1)),
      end: new Date(Date.UTC(year, startMonth + 3, 1)),
    };
  }
  const m = Math.min(Math.max(periodIndex, 1), 12);
  return { start: new Date(Date.UTC(year, m - 1, 1)), end: new Date(Date.UTC(year, m, 1)) };
}

export function endOfPeriodDate(p: MatrixPeriod): Date {
  const { end } = periodBounds(p);
  return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0));
}
