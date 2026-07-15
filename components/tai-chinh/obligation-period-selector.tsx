"use client";

import { useRouter, useSearchParams } from "next/navigation";

const PERIOD_KINDS = [
  { value: "month", label: "Tháng" },
  { value: "quarter", label: "Quý" },
  { value: "year", label: "Năm" },
];

const SELECT_CLS =
  "rounded-md border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  periodKind: string;
  year: number;
  periodIndex: number;
}

export function ObligationPeriodSelector({ periodKind, year, periodIndex }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    router.push(`?${next.toString()}`);
  }

  const indexCount = periodKind === "quarter" ? 4 : periodKind === "month" ? 12 : 0;
  const indexLabel = periodKind === "quarter" ? "Quý" : "Tháng";
  const years = Array.from({ length: 7 }, (_, i) => year - 3 + i);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={SELECT_CLS}
        value={periodKind}
        onChange={(e) => update({ period: e.target.value, index: "1" })}
        aria-label="Loại kỳ"
      >
        {PERIOD_KINDS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {indexCount > 0 && (
        <select
          className={SELECT_CLS}
          value={periodIndex}
          onChange={(e) => update({ index: e.target.value })}
          aria-label={indexLabel}
        >
          {Array.from({ length: indexCount }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {indexLabel} {n}
            </option>
          ))}
        </select>
      )}

      <select
        className={SELECT_CLS}
        value={year}
        onChange={(e) => update({ year: e.target.value })}
        aria-label="Năm"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            Năm {y}
          </option>
        ))}
      </select>
    </div>
  );
}
