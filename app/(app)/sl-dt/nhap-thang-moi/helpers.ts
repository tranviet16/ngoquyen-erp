export interface MonthRef {
  year: number;
  month: number;
}

export function prevMonth({ year, month }: MonthRef): MonthRef {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}
