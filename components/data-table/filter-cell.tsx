"use client";

import { useEffect, useRef, useState } from "react";
import { TableHead } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { FilterValue } from "@/lib/table/types";

interface FilterOption {
  id: string;
  name: string;
}

interface FilterCellProps {
  colKey: string;
  /** Accepts full ColumnDef kind set; `currency` maps to number range, `fk` maps to select. */
  kind: "text" | "number" | "date" | "select" | "boolean" | "currency" | "fk";
  filterOptions?: FilterOption[];
  currentFilter?: FilterValue;
  onFilterChange: (col: string, val: FilterValue | null) => void;
  className?: string;
}

function TextFilter({ colKey, currentFilter, onFilterChange }: FilterCellProps) {
  const initial = currentFilter?.kind === "text" ? currentFilter.value : "";
  const [value, setValue] = useState(initial);
  const debounced = useDebouncedValue(value, 300);
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    onFilterChange(colKey, debounced ? { kind: "text", value: debounced } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      placeholder="Lọc..."
      className="h-7 text-xs px-2"
    />
  );
}

function NumberRangeFilter({ colKey, currentFilter, onFilterChange }: FilterCellProps) {
  const init = currentFilter?.kind === "range"
    ? { gte: String(currentFilter.gte ?? ""), lte: String(currentFilter.lte ?? "") }
    : { gte: "", lte: "" };
  const [gte, setGte] = useState(init.gte);
  const [lte, setLte] = useState(init.lte);
  const dGte = useDebouncedValue(gte, 300);
  const dLte = useDebouncedValue(lte, 300);
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    if (!dGte && !dLte) {
      onFilterChange(colKey, null);
    } else {
      onFilterChange(colKey, {
        kind: "range",
        gte: dGte ? Number(dGte) : undefined,
        lte: dLte ? Number(dLte) : undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dGte, dLte]);

  return (
    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
      <Input type="number" value={gte} onChange={(e) => setGte(e.target.value)}
        placeholder="Từ" className="h-7 text-xs px-2 min-w-0 w-[70px]" />
      <Input type="number" value={lte} onChange={(e) => setLte(e.target.value)}
        placeholder="Đến" className="h-7 text-xs px-2 min-w-0 w-[70px]" />
    </div>
  );
}

function DateRangeFilter({ colKey, currentFilter, onFilterChange }: FilterCellProps) {
  const init = currentFilter?.kind === "dateRange"
    ? { from: currentFilter.from ?? "", to: currentFilter.to ?? "" }
    : { from: "", to: "" };
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const emit = (f: string, t: string) => {
    if (!f && !t) { onFilterChange(colKey, null); return; }
    onFilterChange(colKey, { kind: "dateRange", from: f || undefined, to: t || undefined });
  };

  return (
    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
      <input type="date" value={from}
        onChange={(e) => { setFrom(e.target.value); emit(e.target.value, to); }}
        className="h-7 text-xs px-1 border rounded-md bg-background min-w-0 w-[110px]" />
      <input type="date" value={to}
        onChange={(e) => { setTo(e.target.value); emit(from, e.target.value); }}
        className="h-7 text-xs px-1 border rounded-md bg-background min-w-0 w-[110px]" />
    </div>
  );
}

function SelectFilter({ colKey, kind, filterOptions, currentFilter, onFilterChange }: FilterCellProps) {
  const initial = currentFilter?.kind === "equals" ? currentFilter.value : "";
  const [value, setValue] = useState(initial);

  const options: FilterOption[] = kind === "boolean"
    ? [{ id: "true", name: "Có" }, { id: "false", name: "Không" }]
    : (filterOptions ?? []).slice(0, 200);

  const handleChange = (val: string) => {
    setValue(val);
    onFilterChange(colKey, val ? { kind: "equals", value: val } : null);
  };

  return (
    <select value={value} onChange={(e) => handleChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className="h-7 text-xs px-1 border rounded-md bg-background w-full max-w-[140px]">
      <option value="">Tất cả</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

export function FilterCell(props: FilterCellProps) {
  const { kind, className } = props;

  let widget: React.ReactNode = null;
  if (kind === "text") widget = <TextFilter {...props} />;
  else if (kind === "number" || kind === "currency") widget = <NumberRangeFilter {...props} />;
  else if (kind === "date") widget = <DateRangeFilter {...props} />;
  else if (kind === "select" || kind === "boolean" || kind === "fk") widget = <SelectFilter {...props} />;

  return (
    <TableHead className={className}>
      <div onClick={(e) => e.stopPropagation()}>{widget}</div>
    </TableHead>
  );
}
