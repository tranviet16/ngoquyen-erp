"use client";

import { Prisma } from "@prisma/client";
import type { MatrixRow } from "@/lib/ledger/ledger-types";

interface EntityInfo {
  id: number;
  name: string;
}

interface Props {
  rows: MatrixRow[];
  entities: EntityInfo[];
  partyLabel: string;
}

function fmt(d: Prisma.Decimal | number): string {
  const n = typeof d === "number" ? d : d.toNumber();
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

function colorClass(d: Prisma.Decimal): string {
  return d.isNegative() ? "text-destructive" : "";
}

export function DebtMatrix({ rows, entities, partyLabel }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Không có dữ liệu</p>;
  }

  const colTotals: Record<string, { tt: Prisma.Decimal; hd: Prisma.Decimal }> = {};
  for (const e of entities) {
    const key = String(e.id);
    colTotals[key] = { tt: new Prisma.Decimal(0), hd: new Prisma.Decimal(0) };
  }
  let grandTt = new Prisma.Decimal(0);
  let grandHd = new Prisma.Decimal(0);
  for (const row of rows) {
    for (const e of entities) {
      const key = String(e.id);
      const cell = row.cells[key];
      if (cell) {
        colTotals[key].tt = colTotals[key].tt.plus(cell.tt);
        colTotals[key].hd = colTotals[key].hd.plus(cell.hd);
      }
    }
    grandTt = grandTt.plus(row.totalTt);
    grandHd = grandHd.plus(row.totalHd);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="border p-2 text-left min-w-[140px]" rowSpan={2}>{partyLabel}</th>
            {entities.map((e) => (
              <th key={e.id} className="border p-2 text-center" colSpan={2}>{e.name}</th>
            ))}
            <th className="border p-2 text-center" colSpan={2}>Tổng</th>
          </tr>
          <tr className="bg-muted/60">
            {entities.map((e) => (
              <>
                <th key={`${e.id}-tt`} className="border p-1 text-center text-xs">TT</th>
                <th key={`${e.id}-hd`} className="border p-1 text-center text-xs">HĐ</th>
              </>
            ))}
            <th className="border p-1 text-center text-xs">TT</th>
            <th className="border p-1 text-center text-xs">HĐ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.partyId} className="hover:bg-muted/30">
              <td className="border p-2 font-medium">{row.partyName || `${partyLabel} #${row.partyId}`}</td>
              {entities.map((e) => {
                const cell = row.cells[String(e.id)];
                const tt = cell?.tt ?? new Prisma.Decimal(0);
                const hd = cell?.hd ?? new Prisma.Decimal(0);
                return (
                  <>
                    <td key={`${e.id}-tt`} className={`border p-1 text-right ${colorClass(tt)}`}>{fmt(tt)}</td>
                    <td key={`${e.id}-hd`} className={`border p-1 text-right ${colorClass(hd)}`}>{fmt(hd)}</td>
                  </>
                );
              })}
              <td className={`border p-1 text-right font-semibold ${colorClass(row.totalTt)}`}>{fmt(row.totalTt)}</td>
              <td className={`border p-1 text-right font-semibold ${colorClass(row.totalHd)}`}>{fmt(row.totalHd)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted font-semibold">
            <td className="border p-2">Tổng</td>
            {entities.map((e) => {
              const col = colTotals[String(e.id)];
              return (
                <>
                  <td key={`${e.id}-tt`} className={`border p-1 text-right ${colorClass(col.tt)}`}>{fmt(col.tt)}</td>
                  <td key={`${e.id}-hd`} className={`border p-1 text-right ${colorClass(col.hd)}`}>{fmt(col.hd)}</td>
                </>
              );
            })}
            <td className={`border p-1 text-right ${colorClass(grandTt)}`}>{fmt(grandTt)}</td>
            <td className={`border p-1 text-right ${colorClass(grandHd)}`}>{fmt(grandHd)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
