"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ControlledMultiSelect, type Option } from "@/components/ledger/controlled-multi-select";
import {
  ReportPeriodSelector,
  resolvePeriodValue,
  type ReportPeriodValue,
} from "@/components/ledger/report-period-selector";
import { PIVOT_GROUP_BY, PIVOT_GROUP_LABELS, type PivotGroupBy } from "@/lib/cong-no-vt/project-debt-pivot";

interface Props {
  /** Tham số mốc chuẩn của kỳ đang xem (`ResolvedReportPeriod.params`). */
  currentPeriod: ReportPeriodValue;
  groupBy: PivotGroupBy;
  entities: Option[];
  selectedEntityIds: number[];
}

const SELECT_CLS = "h-9 rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-sm";

/** Bộ lọc tổng hợp theo công trình: mốc thời gian, chiều nhóm, Chủ thể; chỉ ghi URL khi bấm Áp dụng. */
export function TongHopCongTrinhFilter({ currentPeriod, groupBy, entities, selectedEntityIds }: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState<ReportPeriodValue>(currentPeriod);
  const [group, setGroup] = useState<PivotGroupBy>(groupBy);
  const [entityIds, setEntityIds] = useState<number[]>(selectedEntityIds);
  const invalid = "error" in resolvePeriodValue(period);

  function handleApply() {
    if (invalid) return;
    const params = new URLSearchParams(period);
    params.set("groupBy", group);
    if (entityIds.length > 0) params.set("entityIds", entityIds.join(","));
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function handleReset() {
    const year = String(new Date().getFullYear());
    setPeriod({ period: "year", y: year });
    setGroup("ncc");
    setEntityIds([]);
    router.push(`?period=year&y=${year}&groupBy=ncc`, { scroll: false });
  }

  return (
    <div className="rounded-md border bg-muted/20 p-4 space-y-4 no-print">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <ReportPeriodSelector value={period} onChange={setPeriod} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tong-hop-cong-trinh-group">Nhóm theo</Label>
          <select
            id="tong-hop-cong-trinh-group"
            className={SELECT_CLS}
            value={group}
            onChange={(e) => setGroup(e.target.value as PivotGroupBy)}
          >
            {PIVOT_GROUP_BY.map((g) => (
              <option key={g} value={g}>{PIVOT_GROUP_LABELS[g].title}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Chủ thể</Label>
          <ControlledMultiSelect options={entities} selected={entityIds} label="chủ thể" onChange={setEntityIds} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleApply} disabled={invalid}>Áp dụng</Button>
        <Button size="sm" variant="ghost" onClick={handleReset}>Xóa bộ lọc</Button>
      </div>
    </div>
  );
}
