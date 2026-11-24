"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ControlledMultiSelect } from "@/components/ledger/controlled-multi-select";
import type { Option } from "@/components/ledger/controlled-multi-select";
import {
  ReportPeriodSelector,
  resolvePeriodValue,
  type ReportPeriodValue,
} from "@/components/ledger/report-period-selector";

interface Props {
  entities: Option[];
  initialProjects: Option[];
  ledgerType: "material" | "labor";
  partyLabel: string;
  /**
   * Cộng thêm (công nợ vật tư): có giá trị thì bộ chọn mốc thời gian thay hai select Năm/Tháng
   * và URL ghi `period=...`; không truyền thì giữ hành vi `year`/`month` cũ (công nợ nhân công).
   */
  initialPeriod?: ReportPeriodValue;
  defaultValues: {
    year?: number;
    month?: number;
    entityIds: number[];
    projectIds: number[];
    showZero: boolean;
  };
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 3 + i);
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function DetailReportFilter({
  entities,
  initialProjects,
  ledgerType,
  partyLabel,
  initialPeriod,
  defaultValues,
}: Props) {
  const router = useRouter();

  const [year, setYear] = useState<string>(
    defaultValues.year != null ? String(defaultValues.year) : ""
  );
  const [month, setMonth] = useState<string>(
    defaultValues.month != null ? String(defaultValues.month) : ""
  );
  const [period, setPeriod] = useState<ReportPeriodValue>(initialPeriod ?? { period: "all" });
  const periodInvalid = initialPeriod !== undefined && "error" in resolvePeriodValue(period);
  const [selectedEntityIds, setSelectedEntityIds] = useState<number[]>(defaultValues.entityIds);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>(defaultValues.projectIds);
  const [projectOptions, setProjectOptions] = useState<Option[]>(initialProjects);
  const [showZero, setShowZero] = useState(defaultValues.showZero);

  // AbortController ref — latest-wins for cascade fetch
  const abortRef = useRef<AbortController | null>(null);

  const fetchProjects = useCallback(
    async (entityIds: number[]) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams({ ledgerType });
        if (entityIds.length > 0) params.set("entityIds", entityIds.join(","));
        const res = await fetch(`/api/cong-no/cascade-projects?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`cascade-projects: ${res.status}`);
        const data = (await res.json()) as { projects: Option[] };
        setProjectOptions(data.projects);
        const validIds = new Set(data.projects.map((p) => p.id));
        setSelectedProjectIds((prev) => prev.filter((id) => validIds.has(id)));
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("cascade-projects fetch error:", err);
      }
    },
    [ledgerType]
  );

  // Refetch projects whenever entity selection changes
  useEffect(() => {
    void Promise.resolve().then(() => fetchProjects(selectedEntityIds));
  }, [selectedEntityIds, fetchProjects]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  function handleApply() {
    if (periodInvalid) return;
    const params = new URLSearchParams(initialPeriod ? period : undefined);
    if (!initialPeriod) {
      if (year) params.set("year", year);
      if (month) params.set("month", month);
    }
    if (selectedEntityIds.length > 0) params.set("entityIds", selectedEntityIds.join(","));
    if (selectedProjectIds.length > 0) params.set("projectIds", selectedProjectIds.join(","));
    params.set("showZero", showZero ? "1" : "0");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function handleReset() {
    setYear("");
    setMonth("");
    setPeriod({ period: "all" });
    setSelectedEntityIds([]);
    setSelectedProjectIds([]);
    setShowZero(false);
    router.push(initialPeriod ? "?period=all&showZero=0" : "?showZero=0", { scroll: false });
  }

  return (
    <div className="rounded-md border bg-muted/20 p-4 space-y-4">
      {/* Row 1: Year + Month + Entities + Projects */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        {initialPeriod ? (
          <ReportPeriodSelector value={period} onChange={setPeriod} />
        ) : (
          <>
        <div className="flex flex-col gap-1.5">
          <Label>Năm</Label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Tất cả</option>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Tháng</Label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Tất cả</option>
            {MONTHS.map((m) => (
              <option key={m} value={String(m)}>Tháng {m}</option>
            ))}
          </select>
        </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Chủ thể</Label>
          <ControlledMultiSelect
            options={entities}
            selected={selectedEntityIds}
            label="chủ thể"
            onChange={setSelectedEntityIds}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Công trình</Label>
          <ControlledMultiSelect
            options={projectOptions}
            selected={selectedProjectIds}
            label="công trình"
            onChange={setSelectedProjectIds}
          />
        </div>
      </div>

      {/* Row 2: hide-zero + actions */}
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showZero}
            onChange={(e) => setShowZero(e.target.checked)}
            className="h-4 w-4"
          />
          Hiện dòng = 0
        </label>

        <div className="flex gap-2">
          <Button size="sm" onClick={handleApply} disabled={periodInvalid}>Áp dụng</Button>
          <Button size="sm" variant="ghost" onClick={handleReset}>Xóa bộ lọc</Button>
        </div>

        <p className="text-xs text-muted-foreground italic">
          Lọc {partyLabel}: tìm kiếm qua trang nhập liệu.{" "}
          {initialPeriod
            ? "Mốc thời gian: đầu kỳ cộng dồn mọi phát sinh trước ngày bắt đầu."
            : "Năm/tháng = mốc lũy kế tính đến hết kỳ."}
        </p>
      </div>
    </div>
  );
}
