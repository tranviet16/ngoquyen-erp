"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ControlledMultiSelect } from "@/components/ledger/controlled-multi-select";
import type { Option } from "@/components/ledger/controlled-multi-select";

interface Props {
  entities: Option[];
  initialProjects: Option[];
  ledgerType: "material" | "labor";
  partyLabel: string;
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
  defaultValues,
}: Props) {
  const router = useRouter();

  const [year, setYear] = useState<string>(
    defaultValues.year != null ? String(defaultValues.year) : ""
  );
  const [month, setMonth] = useState<string>(
    defaultValues.month != null ? String(defaultValues.month) : ""
  );
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
    fetchProjects(selectedEntityIds);
  }, [selectedEntityIds, fetchProjects]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  function handleApply() {
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    if (month) params.set("month", month);
    if (selectedEntityIds.length > 0) params.set("entityIds", selectedEntityIds.join(","));
    if (selectedProjectIds.length > 0) params.set("projectIds", selectedProjectIds.join(","));
    params.set("showZero", showZero ? "1" : "0");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function handleReset() {
    setYear("");
    setMonth("");
    setSelectedEntityIds([]);
    setSelectedProjectIds([]);
    setShowZero(false);
    router.push("?showZero=0", { scroll: false });
  }

  return (
    <div className="rounded-md border bg-muted/20 p-4 space-y-4">
      {/* Row 1: Year + Month + Entities + Projects */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Năm</label>
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

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Tháng</label>
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

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Chủ thể</label>
          <ControlledMultiSelect
            options={entities}
            selected={selectedEntityIds}
            label="chủ thể"
            onChange={setSelectedEntityIds}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Công trình</label>
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
          <Button size="sm" onClick={handleApply}>Áp dụng</Button>
          <Button size="sm" variant="ghost" onClick={handleReset}>Xóa bộ lọc</Button>
        </div>

        <p className="text-xs text-muted-foreground italic">
          Lọc {partyLabel}: tìm kiếm qua trang nhập liệu. Năm/tháng = mốc lũy kế tính đến hết kỳ.
        </p>
      </div>
    </div>
  );
}
