"use client";

interface EntityInfo {
  id: number;
  name: string;
}

export interface DebtMatrixRow {
  partyId: number;
  partyName: string;
  cells: Record<string, { tt: number; hd: number }>;
  totalTt: number;
  totalHd: number;
}

interface Props {
  rows: DebtMatrixRow[];
  entities: EntityInfo[];
  partyLabel: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

const colorClass = (n: number) => (n < 0 ? "text-destructive" : "");

export function DebtMatrix({ rows, entities, partyLabel }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Không có dữ liệu</p>;
  }

  const colTotals: Record<string, { tt: number; hd: number }> = {};
  for (const e of entities) colTotals[String(e.id)] = { tt: 0, hd: 0 };
  let grandTt = 0;
  let grandHd = 0;
  for (const row of rows) {
    for (const e of entities) {
      const key = String(e.id);
      const cell = row.cells[key];
      if (cell) {
        colTotals[key].tt += cell.tt;
        colTotals[key].hd += cell.hd;
      }
    }
    grandTt += row.totalTt;
    grandHd += row.totalHd;
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
                const tt = cell?.tt ?? 0;
                const hd = cell?.hd ?? 0;
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
