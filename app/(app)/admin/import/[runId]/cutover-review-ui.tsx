"use client";

import type { ReactNode } from "react";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useSortableRows, type SortableColumn } from "@/components/sortable-table/use-sortable-rows";
import type { SemanticKind } from "@/lib/table/semantic-compare";
import type { ImportMapping, MappingValue } from "@/lib/import/adapters/adapter-types";

/** Số tiền đồng (làm tròn), "—" khi không có. */
export function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : Math.round(n).toLocaleString("vi-VN");
}

/** Bản nháp ánh xạ đang sửa + cách đặt / xóa một khóa; `acks` = xác nhận đã lưu (người, thời điểm). */
export interface DraftProps {
  draft: ImportMapping;
  setValue: (key: string, value: MappingValue | undefined) => void;
  editable: boolean;
  acks: Readonly<Record<string, { ackedBy: string; ackedAt: string }>>;
}

export function Section({ title, count, children, open = true }: { title: string; count?: number; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="border rounded-lg">
      <summary className="cursor-pointer select-none px-4 py-2 font-semibold">
        {title}
        {count !== undefined && <span className="ml-2 text-xs font-normal text-muted-foreground">({count})</span>}
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3 text-sm">{children}</div>
    </details>
  );
}

/** Ô xác nhận `ack:<mã>` = 1; đã lưu thì hiện người / thời điểm xác nhận. */
export function AckBox({ code, draft, setValue, editable, acks, label = "Xác nhận" }: DraftProps & { code: string; label?: string }) {
  const key = `ack:${code}`;
  const checked = draft[key] === 1;
  const saved = Object.hasOwn(acks, code) ? acks[code] : null;
  return (
    <label className="inline-flex items-center gap-1 whitespace-nowrap text-xs" title={code}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!editable}
        onChange={(e) => setValue(key, e.target.checked ? 1 : undefined)}
      />
      <span className={checked ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}>{label}</span>
      {saved && checked && (
        <span className="text-muted-foreground">
          ({saved.ackedBy}, {new Date(saved.ackedAt).toLocaleString("vi-VN")})
        </span>
      )}
    </label>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  kind?: SemanticKind;
  accessor: (row: T) => unknown;
  render?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

/** Bảng sắp xếp được (components/sortable-table), cuộn trong khung. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty = "Không có dòng nào.",
  maxHeight = "max-h-[28rem]",
}: {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T, index: number) => string;
  empty?: string;
  maxHeight?: string;
}) {
  const sortColumns: Record<string, SortableColumn<T>> = {};
  for (const c of columns) sortColumns[c.key] = { accessor: c.accessor, kind: c.kind };
  const { sort, sortedRows, toggleSort } = useSortableRows(rows, sortColumns);
  if (rows.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <div className={`overflow-auto ${maxHeight} border rounded`}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-background">
          <tr className="border-b">
            {columns.map((c) => (
              <SortableTableHead key={c.key} column={c.key} label={c.label} sort={sort} onToggle={toggleSort} align={c.align} className={c.className} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b align-top">
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-1.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                  {c.render ? c.render(row) : String(c.accessor(row) ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cột tiền dùng chung. */
export function moneyColumn<T>(key: string, label: string, accessor: (row: T) => number | null | undefined): Column<T> {
  return { key, label, kind: "currency", align: "right", accessor: (r) => accessor(r) ?? null, render: (r) => fmt(accessor(r)) };
}
