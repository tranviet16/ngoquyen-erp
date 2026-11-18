"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ReportPeriodSelector,
  resolvePeriodValue,
  type ReportPeriodValue,
} from "@/components/ledger/report-period-selector";

interface EntityOption { id: number; name: string; }

interface Props {
  /** Tham số mốc chuẩn của kỳ đang xem (`ResolvedReportPeriod.params`). */
  currentPeriod: ReportPeriodValue;
  currentEntityId?: number;
  entities: EntityOption[];
}

export function BaoCaoThangFilter({ currentPeriod, currentEntityId, entities }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [period, setPeriod] = useState<ReportPeriodValue>(currentPeriod);
  const [entityId, setEntityId] = useState(String(currentEntityId ?? ""));
  const invalid = "error" in resolvePeriodValue(period);

  function handleFilter() {
    if (invalid) return;
    const params = new URLSearchParams(period);
    if (entityId) params.set("entityId", entityId);
    router.push(pathname + "?" + params.toString());
  }

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <ReportPeriodSelector value={period} onChange={setPeriod} />
      <div className="flex flex-col gap-1.5">
        <Label>Chủ thể</Label>
        <select
          className="h-9 rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-sm"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
        >
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <Button size="lg" onClick={handleFilter} disabled={invalid}>Xem</Button>
    </div>
  );
}
