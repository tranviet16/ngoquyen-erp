"use client";

import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";

interface Props {
  from: string;
  to: string;
  includeUndated: boolean;
  onChange: (next: { from: string; to: string; includeUndated: boolean }) => void;
}

export function DeadlineRangePicker({ from, to, includeUndated, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <Label className="text-xs">Hạn từ</Label>
        <div className="mt-1 w-[140px]">
          <DateInput value={from} onChange={(v) => onChange({ from: v, to, includeUndated })} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Đến</Label>
        <div className="mt-1 w-[140px]">
          <DateInput value={to} onChange={(v) => onChange({ from, to: v, includeUndated })} />
        </div>
      </div>
      <label className="inline-flex items-center gap-1.5 text-xs h-9 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includeUndated}
          onChange={(e) => onChange({ from, to, includeUndated: e.target.checked })}
          className="h-3.5 w-3.5"
        />
        Bao gồm task không có hạn
      </label>
    </div>
  );
}
