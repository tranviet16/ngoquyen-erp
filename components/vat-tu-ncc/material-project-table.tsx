"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useSortableRows } from "@/components/sortable-table/use-sortable-rows";
import { formatDate, formatNumber } from "@/lib/utils/format";
import type { MaterialProjectRow } from "@/lib/vat-tu-ncc/project-overview-service";

interface Props {
  rows: MaterialProjectRow[];
}

/** Danh sách công trình có hoạt động vật tư — mỗi dòng dẫn sang các NCC của công trình. */
export function MaterialProjectTable({ rows }: Props) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.code} ${r.name} ${r.entityName ?? ""}`.toLowerCase().includes(q));
  }, [rows, search]);
  const columns = useMemo(() => ({
    code: { accessor: (r: MaterialProjectRow) => r.code, kind: "text" as const },
    name: { accessor: (r: MaterialProjectRow) => r.name, kind: "text" as const },
    entity: { accessor: (r: MaterialProjectRow) => r.entityName, kind: "text" as const },
    status: { accessor: (r: MaterialProjectRow) => r.status, kind: "text" as const },
    suppliers: { accessor: (r: MaterialProjectRow) => r.supplierCount, kind: "number" as const },
    deliveries: { accessor: (r: MaterialProjectRow) => r.deliveryCount, kind: "number" as const },
    lastDelivery: { accessor: (r: MaterialProjectRow) => r.lastDeliveryDate, kind: "date" as const },
  }), []);
  const { sort, sortedRows, toggleSort } = useSortableRows(filtered, columns);

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo mã, tên công trình hoặc Chủ thể..."
        aria-label="Tìm công trình"
        className="max-w-sm"
      />
      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <SortableTableHead column="code" label="Mã" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="name" label="Công trình" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="entity" label="Chủ thể" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="status" label="Trạng thái" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="suppliers" label="Số NCC" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
              <SortableTableHead column="deliveries" label="Số phiếu" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
              <SortableTableHead column="lastDelivery" label="Phiếu gần nhất" sort={sort} onToggle={toggleSort} className="font-medium" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  {rows.length === 0 ? "Chưa có công trình nào có phiếu hoặc sổ vật tư." : "Không có công trình khớp tìm kiếm."}
                </td>
              </tr>
            )}
            {sortedRows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 font-mono whitespace-nowrap">
                  <Link href={`/vat-tu-ncc/cong-trinh/${r.id}`} className="text-primary hover:underline">{r.code}</Link>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/vat-tu-ncc/cong-trinh/${r.id}`} className="hover:underline">{r.name}</Link>
                </td>
                <td className="px-3 py-2">
                  {r.entityName ?? <span className="text-destructive">Chưa gán</span>}
                </td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-right">{formatNumber(r.supplierCount)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.deliveryCount)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.lastDeliveryDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
