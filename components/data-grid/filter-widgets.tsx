"use client";

/**
 * Individual filter widgets used by FilterBar.
 * Each widget is self-contained with local state + debounce for text/number inputs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FilterValue } from "@/lib/table/types";

function useDebounce(fn: (v: string) => void, delay = 300) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (v: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(v), delay);
    },
    [fn, delay],
  );
}

export function TextWidget({
  colId,
  value,
  onFilter,
}: {
  colId: string;
  value: string;
  onFilter: (colId: string, f: FilterValue | null) => void;
}) {
  const [local, setLocal] = useState(value);
  const commit = useCallback(
    (v: string) => onFilter(colId, v ? { kind: "text", value: v } : null),
    [colId, onFilter],
  );
  const debounced = useDebounce(commit);
  const handleChange = (v: string) => { setLocal(v); debounced(v); };
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setLocal(value); });
    return () => { active = false; };
  }, [value]);
  return (
    <input
      className="w-full h-6 px-1 text-xs border rounded bg-background placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
      placeholder="Tìm..."
      value={local}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}

export function NumberRangeWidget({
  colId,
  filter,
  onFilter,
}: {
  colId: string;
  filter: FilterValue | undefined;
  onFilter: (colId: string, f: FilterValue | null) => void;
}) {
  const rf = filter?.kind === "range" ? filter : undefined;
  const [gte, setGte] = useState(rf?.gte !== undefined ? String(rf.gte) : "");
  const [lte, setLte] = useState(rf?.lte !== undefined ? String(rf.lte) : "");

  useEffect(() => {
    const r = filter?.kind === "range" ? filter : undefined;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setGte(r?.gte !== undefined ? String(r.gte) : "");
      setLte(r?.lte !== undefined ? String(r.lte) : "");
    });
    return () => { active = false; };
  }, [filter]);

  const emit = useCallback(
    (newGte: string, newLte: string) => {
      if (!newGte && !newLte) { onFilter(colId, null); return; }
      onFilter(colId, { kind: "range", gte: newGte || undefined, lte: newLte || undefined });
    },
    [colId, onFilter],
  );
  const debouncedGte = useDebounce((v) => emit(v, lte));
  const debouncedLte = useDebounce((v) => emit(gte, v));

  return (
    <div className="flex gap-0.5">
      <input className="w-1/2 h-6 px-1 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring" placeholder="≥" value={gte}
        onChange={(e) => { setGte(e.target.value); debouncedGte(e.target.value); }} />
      <input className="w-1/2 h-6 px-1 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring" placeholder="≤" value={lte}
        onChange={(e) => { setLte(e.target.value); debouncedLte(e.target.value); }} />
    </div>
  );
}

export function DateRangeWidget({
  colId,
  filter,
  onFilter,
}: {
  colId: string;
  filter: FilterValue | undefined;
  onFilter: (colId: string, f: FilterValue | null) => void;
}) {
  const df = filter?.kind === "dateRange" ? filter : undefined;
  const [from, setFrom] = useState(df?.from ?? "");
  const [to, setTo] = useState(df?.to ?? "");

  useEffect(() => {
    const d = filter?.kind === "dateRange" ? filter : undefined;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setFrom(d?.from ?? "");
      setTo(d?.to ?? "");
    });
    return () => { active = false; };
  }, [filter]);

  const emit = useCallback(
    (f: string, t: string) => {
      if (!f && !t) { onFilter(colId, null); return; }
      onFilter(colId, { kind: "dateRange", from: f || undefined, to: t || undefined });
    },
    [colId, onFilter],
  );

  return (
    <div className="flex gap-0.5">
      <input type="date" className="w-1/2 h-6 px-0.5 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring" value={from}
        onChange={(e) => { setFrom(e.target.value); emit(e.target.value, to); }} />
      <input type="date" className="w-1/2 h-6 px-0.5 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring" value={to}
        onChange={(e) => { setTo(e.target.value); emit(from, e.target.value); }} />
    </div>
  );
}

export function SelectWidget({
  colId,
  filter,
  onFilter,
  options,
}: {
  colId: string;
  filter: FilterValue | undefined;
  onFilter: (colId: string, f: FilterValue | null) => void;
  options: { id: number | string; name: string }[];
}) {
  const current = filter?.kind === "equals" ? filter.value : "";
  return (
    <select
      className="w-full h-6 px-1 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      value={current}
      onChange={(e) => { const v = e.target.value; onFilter(colId, v ? { kind: "equals", value: v } : null); }}
    >
      <option value="">Tất cả</option>
      {options.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
    </select>
  );
}

export function BooleanWidget({
  colId,
  filter,
  onFilter,
}: {
  colId: string;
  filter: FilterValue | undefined;
  onFilter: (colId: string, f: FilterValue | null) => void;
}) {
  const current = filter?.kind === "equals" ? filter.value : "";
  return (
    <select
      className="w-full h-6 px-1 text-xs border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      value={current}
      onChange={(e) => { const v = e.target.value; onFilter(colId, v ? { kind: "equals", value: v } : null); }}
    >
      <option value="">Tất cả</option>
      <option value="true">Có</option>
      <option value="false">Không</option>
    </select>
  );
}
