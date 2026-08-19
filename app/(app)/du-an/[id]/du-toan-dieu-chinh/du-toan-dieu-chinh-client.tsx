"use client";

import React, { useMemo, useState } from "react";
import { vndFormatter } from "@/lib/format";
import type { EstimateAdjustedRow } from "@/lib/du-an/norm-service";
import {
  buildCategoryTree,
  type CategoryLite,
  type HmGroup,
  type SectionGroup,
} from "@/lib/du-an/category-tree";

interface Props {
  rows: EstimateAdjustedRow[];
  categories: CategoryLite[];
}

function fmt(n: number): string {
  if (!n) return "—";
  return vndFormatter(Math.round(n));
}

function qtyFmt(n: number): string {
  if (!n) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}

function coClass(n: number): string {
  if (n === 0) return "text-muted-foreground";
  return n > 0 ? "text-red-600" : "text-emerald-600";
}

interface Sums {
  original: number;
  co: number;
  adjusted: number;
  coCount: number;
}

function sumRows(rows: EstimateAdjustedRow[]): Sums {
  return rows.reduce(
    (acc, r) => ({
      original: acc.original + r.original_total_vnd,
      co: acc.co + r.co_cost_impact,
      adjusted: acc.adjusted + r.adjusted_total_vnd,
      coCount: acc.coCount + r.co_count,
    }),
    { original: 0, co: 0, adjusted: 0, coCount: 0 },
  );
}

const COL_COUNT = 9;

function SubtotalCells({ sums, grand }: { sums: Sums; grand?: Sums }) {
  return (
    <>
      {/* label(2) + ĐVT(1) + 2 ô này + 4 ô sau = 9 cột, khớp header */}
      <td className="px-2 py-1.5 text-right" colSpan={2}>
        {grand && grand.adjusted > 0 && (
          <span className="text-xs text-muted-foreground">
            {((sums.adjusted / grand.adjusted) * 100).toFixed(1)}% toàn công trình ·{" "}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">{fmt(sums.original)}</td>
      <td className="px-2 py-1.5 text-right">{sums.coCount || "—"}</td>
      <td className={`px-2 py-1.5 text-right ${coClass(sums.co)}`}>
        {sums.co === 0 ? "—" : `${sums.co > 0 ? "+" : ""}${fmt(sums.co)}`}
      </td>
      <td className="px-2 py-1.5 text-right font-semibold">{fmt(sums.adjusted)}</td>
    </>
  );
}

function ItemRow({ r }: { r: EstimateAdjustedRow }) {
  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="px-2 py-1 font-mono text-xs">{r.itemCode}</td>
      <td className="px-2 py-1">{r.itemName}</td>
      <td className="px-2 py-1">{r.unit}</td>
      <td className="px-2 py-1 text-right">{qtyFmt(r.original_qty)}</td>
      <td className="px-2 py-1 text-right">{fmt(r.original_unit_price)}</td>
      <td className="px-2 py-1 text-right">{fmt(r.original_total_vnd)}</td>
      <td className="px-2 py-1 text-right">{r.co_count || "—"}</td>
      <td className={`px-2 py-1 text-right ${coClass(r.co_cost_impact)}`}>
        {r.co_cost_impact === 0 ? "—" : `${r.co_cost_impact > 0 ? "+" : ""}${fmt(r.co_cost_impact)}`}
      </td>
      <td className="px-2 py-1 text-right">{fmt(r.adjusted_total_vnd)}</td>
    </tr>
  );
}

export function DuToanDieuChinhClient({ rows: source, categories }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const tree = useMemo(
    () => buildCategoryTree(source, (r) => r.categoryId, categoriesById),
    [source, categoriesById],
  );
  const grand = useMemo(() => sumRows(source), [source]);

  const toggle = (hm: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(hm)) next.delete(hm);
      else next.add(hm);
      return next;
    });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Dự Toán Điều Chỉnh</h2>
        <p className="text-sm text-muted-foreground">
          Gốc: <strong>{vndFormatter(grand.original)}</strong> | CO:{" "}
          <strong className={coClass(grand.co)}>
            {grand.co >= 0 ? "+" : ""}
            {vndFormatter(grand.co)}
          </strong>{" "}
          | Điều chỉnh: <strong>{vndFormatter(grand.adjusted)}</strong>
        </p>
        <p className="text-xs text-muted-foreground">
          Chế độ xem — dự toán gốc cộng các phát sinh (CO) đã duyệt, nhóm theo hạng mục.
        </p>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left">
              <th className="w-28 px-2 py-2">Mã</th>
              <th className="px-2 py-2">Tên vật tư / công việc</th>
              <th className="w-16 px-2 py-2">ĐVT</th>
              <th className="w-24 px-2 py-2 text-right">SL gốc</th>
              <th className="w-28 px-2 py-2 text-right">Đơn giá gốc</th>
              <th className="w-32 px-2 py-2 text-right">Tổng gốc</th>
              <th className="w-16 px-2 py-2 text-right">Số CO</th>
              <th className="w-32 px-2 py-2 text-right">Tác động CO</th>
              <th className="w-32 px-2 py-2 text-right">Tổng điều chỉnh</th>
            </tr>
          </thead>
          <tbody>
            {tree.map((hm) => (
              <HmBlock
                key={hm.hmCode}
                hm={hm}
                grand={grand}
                isCollapsed={collapsed.has(hm.hmCode)}
                onToggle={() => toggle(hm.hmCode)}
              />
            ))}
            {tree.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="px-2 py-6 text-center text-muted-foreground">
                  Chưa có dữ liệu dự toán.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="sticky bottom-0 bg-muted font-bold">
              <td colSpan={2} className="px-2 py-1.5">TỔNG CỘNG</td>
              <td />
              <SubtotalCells sums={grand} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function HmBlock({
  hm,
  grand,
  isCollapsed,
  onToggle,
}: {
  hm: HmGroup<EstimateAdjustedRow>;
  grand: Sums;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const hmRows = [...hm.sections.flatMap((s) => s.rows), ...hm.directRows];
  const hmSums = sumRows(hmRows);
  return (
    <>
      <tr className="cursor-pointer border-t bg-muted/40 font-semibold hover:bg-muted/60" onClick={onToggle}>
        <td colSpan={2} className="px-2 py-2">
          <span className="mr-1 inline-block w-4 text-muted-foreground">{isCollapsed ? "▸" : "▾"}</span>
          {hm.hmLabel}
        </td>
        <td />
        <SubtotalCells sums={hmSums} grand={grand} />
      </tr>
      {!isCollapsed &&
        hm.sections.map((section) => (
          <SectionBlock key={section.categoryId} section={section} hmSums={hmSums} />
        ))}
      {!isCollapsed && hm.directRows.map((r) => <ItemRow key={r.estimate_id} r={r} />)}
    </>
  );
}

function SectionBlock({
  section,
  hmSums,
}: {
  section: SectionGroup<EstimateAdjustedRow>;
  hmSums: Sums;
}) {
  const sums = sumRows(section.rows);
  return (
    <>
      <tr className="border-t bg-muted/20">
        <td colSpan={2} className="px-2 py-1.5 pl-6 font-medium">
          {section.categoryCode} — {section.categoryName}
          <span className="ml-2 text-xs text-muted-foreground">{section.rows.length} dòng</span>
        </td>
        <td />
        <SubtotalCells sums={sums} grand={hmSums.adjusted > 0 ? { ...hmSums } : undefined} />
      </tr>
      {section.rows.map((r) => (
        <ItemRow key={r.estimate_id} r={r} />
      ))}
    </>
  );
}
