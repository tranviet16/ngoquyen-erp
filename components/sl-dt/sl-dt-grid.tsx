"use client";

import { useCallback, useMemo, useState } from "react";
import { AgGridBase, VND_COL_DEF } from "@/components/ag-grid-base";
import { Button } from "@/components/ui/button";
import type { ColDef, CellValueChangedEvent } from "ag-grid-community";
import { upsertTarget } from "@/lib/sl-dt/target-service";

// Local shape — mirrors prisma SlDtTarget until Prisma generate runs
interface SlDtTarget {
  id: number;
  projectId: number;
  year: number;
  month: number;
  slTarget: { toString(): string };
  dtTarget: { toString(): string };
  note: string | null;
}

interface Props {
  targets: SlDtTarget[];
  projectId: number;
  year: number;
  projectName: string;
}

interface RowData {
  id: number | null;
  month: number;
  slTarget: number;
  dtTarget: number;
  note: string;
  _dirty: boolean;
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function SlDtGrid({ targets, projectId, year, projectName }: Props) {
  const initialRows = useMemo<RowData[]>(() => {
    const map = new Map(targets.map((t) => [t.month, t]));
    return MONTHS.map((m) => {
      const t = map.get(m);
      return {
        id: t?.id ?? null,
        month: m,
        slTarget: t ? Number(t.slTarget) : 0,
        dtTarget: t ? Number(t.dtTarget) : 0,
        note: t?.note ?? "",
        _dirty: false,
      };
    });
  }, [targets]);

  const [rows, setRows] = useState<RowData[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs = useMemo<ColDef<any>[]>(
    () => [
      {
        field: "month",
        headerName: "Tháng",
        width: 90,
        editable: false,
        valueFormatter: (p: { value: number }) => `Tháng ${p.value}`,
        pinned: "left",
      },
      {
        field: "slTarget",
        headerName: "SL Kế hoạch (VNĐ)",
        ...VND_COL_DEF,
        editable: true,
        minWidth: 180,
      },
      {
        field: "dtTarget",
        headerName: "DT Kế hoạch (VNĐ)",
        ...VND_COL_DEF,
        editable: true,
        minWidth: 180,
      },
      {
        field: "note",
        headerName: "Ghi chú",
        editable: true,
        flex: 1,
      },
    ],
    []
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<any>) => {
      const data = e.data as RowData;
      setRows((prev) =>
        prev.map((r) =>
          r.month === data.month ? { ...r, ...data, _dirty: true } : r
        )
      );
    },
    []
  );

  const handleSave = useCallback(async () => {
    const dirty = rows.filter((r) => r._dirty);
    if (!dirty.length) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await Promise.all(
        dirty.map((r) =>
          upsertTarget({
            projectId,
            year,
            month: r.month,
            slTarget: r.slTarget,
            dtTarget: r.dtTarget,
            note: r.note || undefined,
          })
        )
      );
      setRows((prev) => prev.map((r) => ({ ...r, _dirty: false })));
      setSaveMsg("Đã lưu chỉ tiêu.");
    } catch (err) {
      setSaveMsg(`Lỗi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [rows, projectId, year]);

  const dirtyCount = rows.filter((r) => r._dirty).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {projectName} — Năm {year} — Nhấp vào ô để chỉnh sửa
        </p>
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span className="text-sm text-green-600">{saveMsg}</span>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || dirtyCount === 0}
          >
            {saving ? "Đang lưu…" : `Lưu${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
          </Button>
        </div>
      </div>

      <AgGridBase
        rowData={rows}
        columnDefs={colDefs}
        height={420}
        gridOptions={{
          stopEditingWhenCellsLoseFocus: true,
          onCellValueChanged,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getRowStyle: (p: any) =>
            (p.data as RowData)?._dirty
              ? { backgroundColor: "#fef9c3" }
              : undefined,
        }}
      />
    </div>
  );
}
