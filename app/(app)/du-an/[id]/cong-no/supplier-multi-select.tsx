"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown } from "lucide-react";

interface Props {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}

export function SupplierMultiSelect({ options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter((v) => v !== name));
    else onChange([...value, name]);
  };

  const label =
    value.length === 0
      ? "Tất cả NCC"
      : value.length === 1
        ? value[0]
        : `${value.length} NCC đã chọn`;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="min-w-[220px] justify-between"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 opacity-60" />
      </Button>
      {open && (
        <div className="absolute z-30 mt-1 w-[320px] rounded-md border bg-popover p-2 shadow-md">
          <Input
            autoFocus
            placeholder="Tìm NCC..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 h-8"
          />
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                Không có NCC khớp
              </div>
            )}
            {filtered.map((name) => {
              const selected = value.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span
                    className={
                      "flex h-4 w-4 items-center justify-center rounded border " +
                      (selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input")
                    }
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
          {value.length > 0 && (
            <div className="mt-2 flex justify-between border-t pt-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-muted-foreground hover:underline"
              >
                Xóa lựa chọn
              </button>
              <span className="text-xs text-muted-foreground">
                {value.length}/{options.length}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
