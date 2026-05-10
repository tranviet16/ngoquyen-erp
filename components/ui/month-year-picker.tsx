"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  year: number;
  month: number;
  yearOptions?: number[];
  nameYear?: string;
  nameMonth?: string;
  className?: string;
  onChange?: (year: number, month: number) => void;
}

const MONTHS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];

export function MonthYearPicker({
  year,
  month,
  yearOptions,
  nameYear = "year",
  nameMonth = "month",
  className,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(year);
  const [selYear, setSelYear] = useState(year);
  const [selMonth, setSelMonth] = useState(month);
  const ref = useRef<HTMLDivElement>(null);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const minYear = yearOptions ? Math.min(...yearOptions) : currentYear - 5;
  const maxYear = yearOptions ? Math.max(...yearOptions, currentYear + 1) : currentYear + 1;

  useEffect(() => {
    setSelYear(year);
    setSelMonth(month);
    setViewYear(year);
  }, [year, month]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function pickMonth(m: number) {
    setSelYear(viewYear);
    setSelMonth(m);
    onChange?.(viewYear, m);
    setOpen(false);
  }

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <input type="hidden" name={nameYear} value={selYear} />
      <input type="hidden" name={nameMonth} value={selMonth} />
      <button
        type="button"
        onClick={() => {
          setViewYear(selYear);
          setOpen((o) => !o);
        }}
        className={cn(
          "inline-flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-background text-sm font-medium",
          "hover:bg-accent hover:text-accent-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          open && "ring-2 ring-ring ring-offset-1"
        )}
        aria-label={`Chọn tháng. Đang chọn tháng ${selMonth} năm ${selYear}`}
        aria-expanded={open}
      >
        <Calendar className="size-4 text-muted-foreground" aria-hidden />
        <span className="tabular-nums">Tháng {selMonth}/{selYear}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Chọn tháng và năm"
          className="absolute z-50 mt-1 w-64 rounded-lg border bg-popover shadow-lg p-3 text-popover-foreground"
        >
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewYear((y) => Math.max(minYear, y - 1))}
              disabled={viewYear <= minYear}
              className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Năm trước"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="font-semibold tabular-nums">{viewYear}</div>
            <button
              type="button"
              onClick={() => setViewYear((y) => Math.min(maxYear, y + 1))}
              disabled={viewYear >= maxYear}
              className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Năm sau"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((label, i) => {
              const m = i + 1;
              const isSelected = viewYear === selYear && m === selMonth;
              const isCurrent = viewYear === currentYear && m === currentMonth;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMonth(m)}
                  className={cn(
                    "h-9 rounded-md text-sm font-medium tabular-nums transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : isCurrent
                        ? "ring-1 ring-primary text-primary"
                        : "text-foreground"
                  )}
                  aria-label={`Tháng ${m} năm ${viewYear}`}
                  aria-pressed={isSelected}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => pickMonth(currentMonth)}
              className="text-primary hover:underline"
            >
              Tháng hiện tại
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
