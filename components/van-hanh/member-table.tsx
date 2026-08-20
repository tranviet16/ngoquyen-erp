"use client";

import { useMemo } from "react";
import type { UserMetrics } from "@/lib/van-hanh/performance-types";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useSortableRows } from "@/components/sortable-table/use-sortable-rows";

function pct(v: number | null) {
  return v === null ? "—" : `${v}%`;
}
function days(v: number | null) {
  return v === null ? "—" : `${v.toFixed(1)}d`;
}

export function MemberTable({ rows }: { rows: UserMetrics[] }) {
  const columns = useMemo(() => ({
    member: { accessor: (row: UserMetrics) => row.name, kind: "text" as const },
    completed: { accessor: (row: UserMetrics) => row.completed, kind: "number" as const },
    onTime: { accessor: (row: UserMetrics) => row.onTimePct, kind: "number" as const },
    avgDays: { accessor: (row: UserMetrics) => row.avgCloseDays, kind: "number" as const },
    overdue: { accessor: (row: UserMetrics) => row.overdue, kind: "number" as const },
    active: { accessor: (row: UserMetrics) => row.active, kind: "number" as const },
  }), []);
  const { sort, sortedRows, toggleSort } = useSortableRows(rows, columns);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Không có thành viên trong phòng ban.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-[600px] w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <SortableTableHead column="member" label="Thành viên" sort={sort} onToggle={toggleSort} className="font-medium" />
            <SortableTableHead column="completed" label="Hoàn thành" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
            <SortableTableHead column="onTime" label="Đúng hạn" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
            <SortableTableHead column="avgDays" label="TB ngày" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
            <SortableTableHead column="overdue" label="Quá hạn" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
            <SortableTableHead column="active" label="Đang xử lý" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((u) => (
            <tr key={u.userId} className="border-t hover:bg-muted/20">
              <td className="px-3 py-2">
                <a
                  href={`/van-hanh/hieu-suat/user/${u.userId}`}
                  className="hover:underline"
                >
                  {u.name}
                </a>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{u.completed}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(u.onTimePct)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{days(u.avgCloseDays)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {u.overdue > 0 ? (
                  <span className="text-red-600 dark:text-red-400 font-medium">{u.overdue}</span>
                ) : (
                  u.overdue
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{u.active}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
