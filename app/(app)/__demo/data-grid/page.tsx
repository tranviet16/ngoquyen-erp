"use client";

import { useState, type ReactElement } from "react";
import dynamic from "next/dynamic";
import type { DataGridColumn, DataGridHandlers } from "@/components/data-grid";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends { id: number }>(props: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  newRowTemplate?: Partial<T>;
}) => ReactElement;

interface DemoRow {
  id: number;
  ten: string;
  soLuong: number | null;
  donGia: number | null;
  ngay: string | null;
  active: boolean;
}

const initialRows: DemoRow[] = [
  { id: 1, ten: "Vật tư A", soLuong: 10, donGia: 50000, ngay: "2026-05-01", active: true },
  { id: 2, ten: "Vật tư B", soLuong: 5, donGia: 120000, ngay: "2026-05-02", active: false },
  { id: 3, ten: "Vật tư C", soLuong: 20, donGia: 8000, ngay: "2026-05-03", active: true },
];

const columns: DataGridColumn<DemoRow>[] = [
  { id: "ten", title: "Tên", kind: "text", width: 200 },
  { id: "soLuong", title: "SL", kind: "number", width: 100 },
  { id: "donGia", title: "Đơn giá", kind: "currency", width: 140 },
  { id: "ngay", title: "Ngày", kind: "date", width: 120 },
  { id: "active", title: "Active", kind: "boolean", width: 80 },
];

export default function DemoDataGridPage() {
  const [rows, setRows] = useState<DemoRow[]>(initialRows);
  const [nextId, setNextId] = useState(100);

  const handlers: DataGridHandlers<DemoRow> = {
    onCellEdit: async (rowId, col, value) => {
      await new Promise((r) => setTimeout(r, 100));
      setRows((cur) =>
        cur.map((r) => (r.id === rowId ? { ...r, [col]: value } : r)),
      );
    },
    onBulkPaste: async (patches) => {
      await new Promise((r) => setTimeout(r, 100));
      const updated: DemoRow[] = [];
      setRows((cur) => {
        const map = new Map(cur.map((r) => [r.id, r]));
        for (const p of patches) {
          const id = (p.id as number) ?? nextId + updated.length;
          const existing = map.get(id);
          const merged = existing
            ? { ...existing, ...p, id }
            : ({ id, ten: "", soLuong: null, donGia: null, ngay: null, active: false, ...p } as DemoRow);
          map.set(id, merged);
          updated.push(merged);
        }
        return Array.from(map.values());
      });
      return updated;
    },
    onAddRow: async (template) => {
      const id = nextId;
      setNextId((n) => n + 1);
      const row: DemoRow = {
        id,
        ten: "",
        soLuong: null,
        donGia: null,
        ngay: null,
        active: false,
        ...template,
      };
      setRows((cur) => [...cur, row]);
      return row;
    },
    onDeleteRows: async (ids) => {
      await new Promise((r) => setTimeout(r, 100));
      setRows((cur) => cur.filter((r) => !ids.includes(r.id)));
    },
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Demo: DataGrid (Phase 1 smoke)</h1>
      <p className="text-sm text-muted-foreground">
        Test edit cell, paste TSV từ Excel, thêm dòng, xóa dòng. State chỉ trong memory.
      </p>
      <DataGrid<DemoRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        height={500}
        newRowTemplate={{}}
      />
    </div>
  );
}
