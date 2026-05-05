"use client";

import { Fragment } from "react";

interface EntityInfo {
  id: number;
  name: string;
}

export interface DebtMatrixCell {
  openTt: number;
  openHd: number;
  layTt: number;
  layHd: number;
  traTt: number;
  traHd: number;
  closeTt: number;
  closeHd: number;
}

export interface DebtMatrixRow {
  partyId: number;
  partyName: string;
  cells: Record<string, DebtMatrixCell>;
  totals: DebtMatrixCell;
}

interface Props {
  rows: DebtMatrixRow[];
  entities: EntityInfo[];
  partyLabel: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n);

const cellCls = (n: number) =>
  `border p-1 text-right text-xs tabular-nums ${n < 0 ? "text-destructive" : ""}`;

const GROUPS: Array<{ label: string; tt: keyof DebtMatrixCell; hd: keyof DebtMatrixCell }> = [
  { label: "Đầu kỳ", tt: "openTt", hd: "openHd" },
  { label: "Lấy hàng", tt: "layTt", hd: "layHd" },
  { label: "Trả tiền", tt: "traTt", hd: "traHd" },
  { label: "Cuối kỳ", tt: "closeTt", hd: "closeHd" },
];

function emptyCell(): DebtMatrixCell {
  return { openTt: 0, openHd: 0, layTt: 0, layHd: 0, traTt: 0, traHd: 0, closeTt: 0, closeHd: 0 };
}

function addInto(t: DebtMatrixCell, s: DebtMatrixCell) {
  t.openTt += s.openTt; t.openHd += s.openHd;
  t.layTt += s.layTt;  t.layHd += s.layHd;
  t.traTt += s.traTt;  t.traHd += s.traHd;
  t.closeTt += s.closeTt; t.closeHd += s.closeHd;
}

export function DebtMatrix({ rows, entities, partyLabel }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Không có dữ liệu</p>;
  }

  // Column totals per entity + grand totals
  const colTotals: Record<string, DebtMatrixCell> = {};
  for (const e of entities) colTotals[String(e.id)] = emptyCell();
  const grand: DebtMatrixCell = emptyCell();
  for (const row of rows) {
    for (const e of entities) {
      const cell = row.cells[String(e.id)];
      if (cell) addInto(colTotals[String(e.id)], cell);
    }
    addInto(grand, row.totals);
  }

  return (
    <div className="border rounded-md max-h-[80vh] overflow-auto">
      <table className="text-sm border-collapse">
        <thead>
          {/* Tier 1: party label + entity names + Tổng */}
          <tr>
            <th
              className="border p-2 text-left min-w-[180px] sticky left-0 top-0 bg-muted z-30"
              rowSpan={3}
            >
              {partyLabel}
            </th>
            {entities.map((e) => (
              <th key={e.id} className="border p-2 text-center sticky top-0 bg-muted z-20" colSpan={8}>
                {e.name}
              </th>
            ))}
            <th className="border p-2 text-center sticky top-0 bg-muted z-20" colSpan={8}>Tổng</th>
          </tr>
          {/* Tier 2: 4 group labels per entity */}
          <tr>
            {entities.map((e) =>
              GROUPS.map((g) => (
                <th
                  key={`${e.id}-${g.label}`}
                  className="border p-1 text-center text-xs sticky top-[37px] bg-muted/95 z-20"
                  colSpan={2}
                >
                  {g.label}
                </th>
              )),
            )}
            {GROUPS.map((g) => (
              <th
                key={`tot-${g.label}`}
                className="border p-1 text-center text-xs sticky top-[37px] bg-muted/95 z-20"
                colSpan={2}
              >
                {g.label}
              </th>
            ))}
          </tr>
          {/* Tier 3: TT / HĐ */}
          <tr>
            {entities.map((e) =>
              GROUPS.map((g) => (
                <Fragment key={`${e.id}-${g.label}-sub`}>
                  <th className="border p-1 text-center text-[11px] min-w-[80px] sticky top-[63px] bg-muted/90 z-20">TT</th>
                  <th className="border p-1 text-center text-[11px] min-w-[80px] sticky top-[63px] bg-muted/90 z-20">HĐ</th>
                </Fragment>
              )),
            )}
            {GROUPS.map((g) => (
              <Fragment key={`tot-${g.label}-sub`}>
                <th className="border p-1 text-center text-[11px] min-w-[80px] sticky top-[63px] bg-muted/90 z-20">TT</th>
                <th className="border p-1 text-center text-[11px] min-w-[80px] sticky top-[63px] bg-muted/90 z-20">HĐ</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.partyId} className="hover:bg-muted/30">
              <td className="border p-2 font-medium sticky left-0 bg-background z-10">
                {row.partyName || `${partyLabel} #${row.partyId}`}
              </td>
              {entities.map((e) => {
                const c = row.cells[String(e.id)] ?? emptyCell();
                return GROUPS.map((g) => (
                  <Fragment key={`${row.partyId}-${e.id}-${g.label}`}>
                    <td className={cellCls(c[g.tt])}>{fmt(c[g.tt])}</td>
                    <td className={cellCls(c[g.hd])}>{fmt(c[g.hd])}</td>
                  </Fragment>
                ));
              })}
              {GROUPS.map((g) => (
                <Fragment key={`${row.partyId}-tot-${g.label}`}>
                  <td className={`${cellCls(row.totals[g.tt])} font-semibold`}>{fmt(row.totals[g.tt])}</td>
                  <td className={`${cellCls(row.totals[g.hd])} font-semibold`}>{fmt(row.totals[g.hd])}</td>
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted font-semibold">
            <td className="border p-2 sticky left-0 bg-muted z-10">Tổng</td>
            {entities.map((e) => {
              const c = colTotals[String(e.id)];
              return GROUPS.map((g) => (
                <Fragment key={`foot-${e.id}-${g.label}`}>
                  <td className={cellCls(c[g.tt])}>{fmt(c[g.tt])}</td>
                  <td className={cellCls(c[g.hd])}>{fmt(c[g.hd])}</td>
                </Fragment>
              ));
            })}
            {GROUPS.map((g) => (
              <Fragment key={`foot-tot-${g.label}`}>
                <td className={cellCls(grand[g.tt])}>{fmt(grand[g.tt])}</td>
                <td className={cellCls(grand[g.hd])}>{fmt(grand[g.hd])}</td>
              </Fragment>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
