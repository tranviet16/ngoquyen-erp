"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ControlledMultiSelect, type Option } from "@/components/ledger/controlled-multi-select";
import {
  ReportPeriodSelector,
  resolvePeriodValue,
  type ReportPeriodValue,
} from "@/components/ledger/report-period-selector";

interface Props {
  /** Tham số mốc chuẩn của kỳ đang xem (`ResolvedReportPeriod.params`). */
  currentPeriod: ReportPeriodValue;
  entities: Option[];
  selectedEntityIds: number[];
  hideZero: boolean;
}

/** Bộ lọc tổng hợp: chỉ ghi URL khi bấm Áp dụng. */
export function TongHopFilter({ currentPeriod, entities, selectedEntityIds, hideZero }: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState<ReportPeriodValue>(currentPeriod);
  const [entityIds, setEntityIds] = useState<number[]>(selectedEntityIds);
  const [hide, setHide] = useState(hideZero);
  const invalid = "error" in resolvePeriodValue(period);

  function handleApply() {
    if (invalid) return;
    const params = new URLSearchParams(period);
    if (entityIds.length > 0) params.set("entityIds", entityIds.join(","));
    if (hide) params.set("hideZero", "1");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function handleReset() {
    setPeriod({ period: "all" });
    setEntityIds([]);
    setHide(false);
    router.push("?period=all", { scroll: false });
  }

  return (
    <div className="rounded-md border bg-muted/20 p-4 space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <ReportPeriodSelector value={period} onChange={setPeriod} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Chủ thể</label>
          <ControlledMultiSelect
            options={entities}
            selected={entityIds}
            label="chủ thể"
            onChange={setEntityIds}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={hide}
            onChange={(e) => setHide(e.target.checked)}
            className="h-4 w-4"
          />
          Ẩn NCC không có số liệu (= 0)
        </label>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleApply} disabled={invalid}>Áp dụng</Button>
          <Button size="sm" variant="ghost" onClick={handleReset}>Xóa bộ lọc</Button>
        </div>
      </div>
    </div>
  );
}
