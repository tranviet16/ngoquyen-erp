"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

type Kind = "month" | "quarter" | "year";

const KIND_LABEL: Record<Kind, string> = {
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const QUARTERS = [1, 2, 3, 4];

export function PeriodFilter({
  kind,
  year,
  month,
  quarter,
}: {
  kind: Kind;
  year: number;
  month: number;
  quarter: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function pushParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function setKind(k: Kind) {
    const now = new Date();
    pushParams({
      period: k,
      year: String(year),
      month: k === "month" ? String(month || now.getMonth() + 1) : undefined,
      q: k === "quarter" ? String(quarter || Math.floor(now.getMonth() / 3) + 1) : undefined,
    });
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-70" : ""}`}>
      <div className="inline-flex rounded-md border bg-card p-0.5">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              kind === k
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {kind === "month" && (
        <select
          value={month}
          onChange={(e) => pushParams({ month: e.target.value })}
          className="rounded-md border bg-card px-2 py-1 text-sm"
          aria-label="Chọn tháng"
        >
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              Tháng {m}
            </option>
          ))}
        </select>
      )}

      {kind === "quarter" && (
        <select
          value={quarter}
          onChange={(e) => pushParams({ q: e.target.value })}
          className="rounded-md border bg-card px-2 py-1 text-sm"
          aria-label="Chọn quý"
        >
          {QUARTERS.map((q) => (
            <option key={q} value={q}>
              Q{q}
            </option>
          ))}
        </select>
      )}

      <input
        type="number"
        value={year}
        min={2020}
        max={2100}
        onChange={(e) => pushParams({ year: e.target.value })}
        className="w-20 rounded-md border bg-card px-2 py-1 text-sm tabular-nums"
        aria-label="Năm"
      />
    </div>
  );
}
