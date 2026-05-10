"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { useState } from "react";

interface EntityOption { id: number; name: string; }

interface Props {
  currentYear: number;
  currentMonth: number;
  currentEntityId?: number;
  entities: EntityOption[];
}

export function BaoCaoThangFilterNc({ currentYear, currentMonth, currentEntityId, entities }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [entityId, setEntityId] = useState(String(currentEntityId ?? ""));

  function handleFilter() {
    const params = new URLSearchParams();
    params.set("year", String(year));
    params.set("month", String(month));
    if (entityId) params.set("entityId", entityId);
    router.push(pathname + "?" + params.toString());
  }

  return (
    <div className="flex gap-4 items-end flex-wrap">
      <div className="flex flex-col gap-1.5">
        <Label>Tháng / Năm</Label>
        <MonthYearPicker
          year={year}
          month={month}
          onChange={(y, m) => { setYear(y); setMonth(m); }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Chủ thể</Label>
        <select
          className="h-10 rounded-md border border-input bg-background text-foreground px-3 text-sm"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
        >
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <Button onClick={handleFilter}>Xem</Button>
    </div>
  );
}
