"use client";

import { Fragment } from "react";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useSortableRows, type SortableColumn } from "@/components/sortable-table/use-sortable-rows";
import { stableSemanticSort } from "@/lib/table/semantic-compare";
import {
  PIVOT_AMOUNT_KEYS,
  PIVOT_GROUP_LABELS,
  PIVOT_SIDE_LABELS,
  pivotColumns,
  type PivotAmounts,
  type PivotColumnMode,
  type PivotGroup,
  type PivotNode,
  type ProjectPivot,
} from "@/lib/cong-no-vt/project-debt-pivot";

interface Props {
  pivot: ProjectPivot;
  mode: PivotColumnMode;
}

const numberFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function amountColumns<T extends PivotNode>(): Record<string, SortableColumn<T>> {
  return Object.fromEntries(
    PIVOT_AMOUNT_KEYS.map((key) => [key, { accessor: (node: T) => node.amounts[key], kind: "currency" as const }]),
  );
}

// Sắp xếp cột tên cấp 1 → sắp nhóm; cột tên cấp 2 → sắp dòng con trong từng nhóm;
// cột số → sắp cả nhóm (theo tổng nhóm) lẫn dòng con trong nhóm.
const GROUP_SORT: Record<string, SortableColumn<PivotGroup>> = {
  level1: { accessor: (g) => g.name, kind: "text" },
  ...amountColumns<PivotGroup>(),
};
const CHILD_SORT: Record<string, SortableColumn<PivotNode>> = {
  level2: { accessor: (c) => c.name, kind: "text" },
  ...amountColumns<PivotNode>(),
};

const HEAD_CLS = "border bg-muted text-xs font-semibold";
const CELL_CLS = "border px-3 py-1.5 text-right tabular-nums";

export function ProjectDebtPivotTable({ pivot, mode }: Props) {
  const columns = pivotColumns(mode);
  const labels = PIVOT_GROUP_LABELS[pivot.groupBy];
  const { sort, sortedRows: groups, toggleSort } = useSortableRows(pivot.groups, GROUP_SORT);

  const sortChildren = (children: PivotNode[]): PivotNode[] => {
    if (sort.mode === "default") return children;
    const column = CHILD_SORT[sort.col];
    return column ? stableSemanticSort(children, column.accessor, sort.mode, column.kind) : children;
  };

  const renderAmounts = (prefix: string, amounts: PivotAmounts) =>
    columns.map((c) => (
      <td key={`${prefix}-${c.key}`} className={`${CELL_CLS} ${amounts[c.key] < 0 ? "text-destructive" : ""}`}>
        {numberFmt.format(amounts[c.key])}
      </td>
    ));

  if (pivot.groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Không có dữ liệu phù hợp với bộ lọc hiện tại.
      </p>
    );
  }

  return (
    <div className="max-h-[80vh] overflow-auto rounded-md border">
      <table className="w-full min-w-[1180px] border-collapse text-sm">
        <thead className="sticky top-0 z-20">
          <tr>
            <SortableTableHead column="level1" label={labels.level1} sort={sort} onToggle={toggleSort}
              rowSpan={2} className={`${HEAD_CLS} min-w-[200px]`} />
            <SortableTableHead column="level2" label={labels.level2} sort={sort} onToggle={toggleSort}
              rowSpan={2} className={`${HEAD_CLS} min-w-[200px]`} />
            <th colSpan={4} className={`${HEAD_CLS} px-3 py-2 text-center`}>{PIVOT_SIDE_LABELS.tt}</th>
            <th colSpan={4} className={`${HEAD_CLS} px-3 py-2 text-center`}>{PIVOT_SIDE_LABELS.hd}</th>
          </tr>
          <tr>
            {columns.map((c) => (
              <SortableTableHead key={c.key} column={c.key} label={c.label} sort={sort} onToggle={toggleSort}
                align="right" className={`${HEAD_CLS} min-w-[120px]`} />
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              <tr className="bg-muted/40 font-semibold">
                <td className={`border px-3 py-1.5 ${g.id == null ? "italic text-muted-foreground" : ""}`}>{g.name}</td>
                <td className="border px-3 py-1.5 text-xs font-normal text-muted-foreground">
                  {g.children.length} {labels.level2.toLowerCase()}
                </td>
                {renderAmounts(g.key, g.amounts)}
              </tr>
              {sortChildren(g.children).map((c) => (
                <tr key={`${g.key}/${c.key}`} className="hover:bg-muted/30">
                  <td className="border" />
                  <td className={`border px-3 py-1.5 pl-6 ${c.id == null ? "italic text-muted-foreground" : ""}`}>
                    {c.name}
                  </td>
                  {renderAmounts(`${g.key}/${c.key}`, c.amounts)}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-[3px] border-indigo-500 bg-indigo-50 font-bold text-indigo-950 dark:border-indigo-400 dark:bg-indigo-950/60 dark:text-indigo-50">
            <td colSpan={2} className="border px-3 py-2">TỔNG CỘNG</td>
            {renderAmounts("total", pivot.total)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
