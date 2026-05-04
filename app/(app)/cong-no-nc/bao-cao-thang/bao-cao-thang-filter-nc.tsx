"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface EntityOption { id: number; name: string; }

interface Props {
  currentYear: number;
  currentEntityId?: number;
  entities: EntityOption[];
}

export function BaoCaoThangFilterNc({ currentYear, currentEntityId, entities }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [year, setYear] = useState(String(currentYear));
  const [entityId, setEntityId] = useState(String(currentEntityId ?? ""));

  function handleFilter() {
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    if (entityId) params.set("entityId", entityId);
    router.push(pathname + (params.toString() ? "?" + params.toString() : ""));
  }

  return (
    <div className="flex gap-4 items-end">
      <div>
        <Label>Năm</Label>
        <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-24" min={2020} max={2099} />
      </div>
      <div>
        <Label>Chủ thể (tùy chọn)</Label>
        <select className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          value={entityId} onChange={(e) => setEntityId(e.target.value)}>
          <option value="">Tất cả</option>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <Button onClick={handleFilter}>Xem</Button>
    </div>
  );
}
