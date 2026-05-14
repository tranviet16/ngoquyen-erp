"use client";

import { useEffect, useRef, useState } from "react";

export interface Option {
  id: number;
  name: string;
}

interface Props {
  options: Option[];
  selected: number[];
  label: string;
  onChange: (ids: number[]) => void;
}

/**
 * Controlled multi-select dropdown that does NOT push to URL directly.
 * Parent is responsible for URL sync (Apply button pattern).
 */
export function ControlledMultiSelect({ options, selected, label, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number[]>(selected);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sync draft when parent resets
  useEffect(() => {
    setDraft(selected);
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered =
    search.trim() === ""
      ? options
      : options.filter((o) =>
          o.name.toLowerCase().includes(search.trim().toLowerCase())
        );

  const buttonLabel =
    selected.length === 0
      ? `Tất cả ${label}`
      : selected.length === 1
      ? (options.find((o) => o.id === selected[0])?.name ?? `${label} #${selected[0]}`)
      : `${selected.length} ${label} đã chọn`;

  function toggle(id: number) {
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function apply(ids: number[]) {
    onChange(ids);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          if (!open) setDraft(selected);
          setOpen((p) => !p);
        }}
        className="h-9 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm shadow-sm flex items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="truncate">{buttonLabel}</span>
        <span className="opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-[280px] rounded-md border bg-popover shadow-lg">
          <div className="p-2 border-b">
            <input
              placeholder={`Tìm ${label}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full h-8 rounded border border-input px-2 text-sm bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2 text-center">
                Không tìm thấy
              </p>
            ) : (
              filtered.map((o) => (
                <label
                  key={o.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={draft.includes(o.id)}
                    onChange={() => toggle(o.id)}
                    className="h-4 w-4"
                  />
                  <span className="truncate">{o.name}</span>
                </label>
              ))
            )}
          </div>
          <div className="flex justify-between gap-2 p-2 border-t">
            <button
              type="button"
              onClick={() => apply([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Xóa filter
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => apply(draft)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Áp dụng ({draft.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
