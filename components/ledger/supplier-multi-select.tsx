"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Option {
  id: number;
  name: string;
}

interface Props {
  options: Option[];
  selected: number[];
  paramName?: string;
  label?: string;
}

export function SupplierMultiSelect({ options, selected, paramName = "supplier", label = "NCC" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number[]>(selected);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  function openPanel() {
    setDraft(selected);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);

  const selectedNames = useMemo(() => {
    if (selected.length === 0) return `Tất cả ${label}`;
    if (selected.length === 1) {
      const o = options.find((x) => x.id === selected[0]);
      return o?.name ?? `${label} #${selected[0]}`;
    }
    return `${selected.length} ${label} đã chọn`;
  }, [selected, options, label]);

  function toggle(id: number) {
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function apply(ids: number[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (ids.length === 0) params.delete(paramName);
    else params.set(paramName, ids.join(","));
    router.push(`?${params.toString()}`, { scroll: false });
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <Button type="button" variant="outline" onClick={() => (open ? setOpen(false) : openPanel())} className="min-w-[220px] justify-between">
        <span className="truncate">{selectedNames}</span>
        <span className="ml-2 opacity-60">▾</span>
      </Button>
      {open && (
        <div className="absolute z-20 mt-1 w-[320px] rounded-md border bg-popover shadow-lg">
          <div className="p-2 border-b">
            <Input
              placeholder={`Tìm ${label}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2 text-center">Không tìm thấy</p>
            ) : (
              filtered.map((o) => {
                const checked = draft.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.id)}
                      className="h-4 w-4"
                    />
                    <span className="truncate">{o.name}</span>
                  </label>
                );
              })
            )}
          </div>
          <div className="flex justify-between gap-2 p-2 border-t">
            <Button type="button" variant="ghost" size="sm" onClick={() => apply([])}>
              Xóa filter
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Hủy
              </Button>
              <Button type="button" size="sm" onClick={() => apply(draft)}>
                Áp dụng ({draft.length})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
