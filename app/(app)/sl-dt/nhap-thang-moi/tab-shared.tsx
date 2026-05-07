"use client";

import type { RowState } from "./nhap-thang-moi-client";

export const fmt = (n: number): string => (n === 0 ? "0" : n.toLocaleString("vi-VN"));

export const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

export function NumCell({
  value,
  onChange,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value === 0 ? "" : value.toLocaleString("vi-VN")}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.-]/g, "");
        const n = raw === "" || raw === "-" ? 0 : parseFloat(raw);
        onChange(isNaN(n) ? 0 : n);
      }}
      placeholder="0"
      className={`w-full px-1.5 py-0.5 text-right text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary ${className}`}
    />
  );
}

export function TextCell({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options?: string[];
  placeholder?: string;
}) {
  const list = options && options.length > 0;
  return (
    <>
      <input
        type="text"
        list={list ? `dl-${placeholder}` : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
        className="w-full px-1.5 py-0.5 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {list && (
        <datalist id={`dl-${placeholder}`}>
          {options!.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
    </>
  );
}

export function LotCell({ row }: { row: RowState }) {
  return (
    <td className="px-2 py-1 text-xs whitespace-nowrap sticky left-0 bg-background border-r">
      <div className="font-medium">{row.lotName}</div>
      <div className="text-muted-foreground text-[10px]">
        {row.phaseCode}/{row.groupCode}
      </div>
    </td>
  );
}
