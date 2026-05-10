"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function isoToDmy(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function dmyToIso(s: string): string | null {
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s.trim());
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = (Number(y) >= 70 ? "19" : "20") + y;
  const dd = d.padStart(2, "0");
  const mm = mo.padStart(2, "0");
  const iso = `${y}-${mm}-${dd}`;
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return null;
  return iso;
}

type Props = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
  /** ISO yyyy-mm-dd or empty string */
  value?: string;
  /** Emits ISO yyyy-mm-dd or empty string */
  onChange?: (iso: string) => void;
};

/**
 * Hybrid date input: text field accepts dd/mm/yyyy typed entry,
 * calendar button opens the browser native picker. Stores ISO yyyy-mm-dd.
 */
export function DateInput({ value, onChange, className, disabled, name, ...rest }: Props) {
  const [text, setText] = React.useState(() => isoToDmy(value ?? ""));
  const pickerRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setText(isoToDmy(value ?? ""));
  }, [value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange?.("");
      return;
    }
    const iso = dmyToIso(trimmed);
    if (iso) {
      onChange?.(iso);
      setText(isoToDmy(iso));
    } else {
      // invalid — revert to last good
      setText(isoToDmy(value ?? ""));
    }
  };

  return (
    <div className={cn("relative flex w-full items-center", className)}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
          }
        }}
        className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent pl-2.5 pr-8 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80"
        {...rest}
      />
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const iso = e.target.value;
          onChange?.(iso);
          setText(isoToDmy(iso));
        }}
        // Keep in DOM (required by showPicker) but visually invisible.
        // Use clip + 1px (not display:none) so the browser still treats it as rendered.
        style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Mở lịch"
        onClick={() => {
          const el = pickerRef.current;
          if (!el || disabled) return;
          if (typeof el.showPicker === "function") {
            try { el.showPicker(); return; } catch { /* fallback below */ }
          }
          el.focus();
          el.click();
        }}
        className="absolute right-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
      >
        <CalendarIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
