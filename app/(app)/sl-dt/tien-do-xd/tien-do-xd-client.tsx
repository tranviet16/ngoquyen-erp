"use client";

import type { TienDoXdLotRow } from "@/lib/sl-dt/report-service";
import { cleanHierarchyLabel, hasHierarchyLabel } from "@/lib/sl-dt/hierarchy";

const columns: Array<{ key: keyof TienDoXdLotRow; label: string; className?: string }> = [
  { key: "lotName", label: "Lô", className: "min-w-[220px]" },
  { key: "milestoneText", label: "Tiến độ hiện tại", className: "min-w-[170px]" },
  { key: "settlementStatus", label: "Trạng thái QT", className: "min-w-[130px]" },
  { key: "khungBtct", label: "Khung BTCT", className: "min-w-[130px]" },
  { key: "xayTuong", label: "Xây tường", className: "min-w-[130px]" },
  { key: "tratNgoai", label: "Trát ngoài", className: "min-w-[130px]" },
  { key: "xayTho", label: "Xây thô", className: "min-w-[130px]" },
  { key: "tratHoanThien", label: "Trát HT", className: "min-w-[130px]" },
  { key: "hoSoQuyetToan", label: "Hồ sơ QT", className: "min-w-[130px]" },
  { key: "ghiChu", label: "Ghi chú", className: "min-w-[180px]" },
];

export function TienDoXdClient({ rows }: { rows: TienDoXdLotRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded border p-8 text-center text-sm text-muted-foreground">
        Chưa có dòng tiến độ nào có dữ liệu trong kỳ này.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`border-r px-2 py-2 text-left font-semibold ${col.className ?? ""}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row, index) => {
            const headerRows = [];
            const previous = rows[index - 1];
            const phaseChanged = !previous || previous.phaseCode !== row.phaseCode;
            const groupChanged = phaseChanged || previous.groupCode !== row.groupCode;
            if (phaseChanged) {
              if (hasHierarchyLabel(row.phaseCode)) {
                headerRows.push(
                  <tr key={`phase-${row.phaseCode}`} className="border-t-[3px] border-slate-500 bg-slate-200 text-sm font-bold text-slate-950 dark:border-slate-400 dark:bg-slate-800 dark:text-slate-50">
                    <td colSpan={columns.length} className="px-3 py-2.5">{cleanHierarchyLabel(row.phaseCode)}</td>
                  </tr>,
                );
              }
            }
            if (groupChanged) {
              if (hasHierarchyLabel(row.groupCode)) {
                headerRows.push(
                  <tr key={`group-${row.phaseCode}-${row.groupCode}`} className="border-t border-slate-300 bg-slate-50 font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100">
                    <td colSpan={columns.length} className="border-l-4 border-primary px-3 py-2">{cleanHierarchyLabel(row.groupCode)}</td>
                  </tr>,
                );
              }
            }
            headerRows.push(
              <tr key={row.lotId} className="border-t hover:bg-muted/20">
                {columns.map((col) => (
                  <td key={col.key} className={`border-r px-2 py-1.5 align-top ${col.key === "lotName" ? "pl-6" : ""}`}>
                    {String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>,
            );
            return headerRows;
          })}
        </tbody>
      </table>
    </div>
  );
}
