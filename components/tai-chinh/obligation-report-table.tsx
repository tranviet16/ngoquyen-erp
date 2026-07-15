import { formatVND } from "@/lib/utils/format";
import type { ObligationReportRow } from "@/lib/tai-chinh/state-obligation-report";

interface Props {
  rows: ObligationReportRow[];
}

const CATEGORY_LABELS: Record<string, string> = {
  thue: "Thuế",
  bao_hiem: "Bảo hiểm",
  khac: "Khác",
};
const CATEGORY_ORDER = ["thue", "bao_hiem", "khac"];

const n = (v: string) => Number(v);

interface Totals {
  opening: number;
  increase: number;
  decrease: number;
  closing: number;
}

const ZERO: Totals = { opening: 0, increase: 0, decrease: 0, closing: 0 };

function sum(rows: ObligationReportRow[]): Totals {
  return rows.reduce(
    (acc, r) => ({
      opening: acc.opening + n(r.opening),
      increase: acc.increase + n(r.increase),
      decrease: acc.decrease + n(r.decrease),
      closing: acc.closing + n(r.closing),
    }),
    { ...ZERO },
  );
}

export function ObligationReportTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Chưa có danh mục nghĩa vụ nào.
      </p>
    );
  }

  const grand = sum(rows);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="border-b px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nghĩa vụ
            </th>
            <th className="border-b px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Đầu kỳ
            </th>
            <th className="border-b px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              PS phải trả
            </th>
            <th className="border-b px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Đã nộp
            </th>
            <th className="border-b px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cuối kỳ
            </th>
          </tr>
        </thead>
        <tbody>
          {CATEGORY_ORDER.map((cat) => {
            const catRows = rows.filter((r) => r.category === cat);
            if (catRows.length === 0) return null;
            const catTotal = sum(catRows);
            return (
              <GroupBlock key={cat} label={CATEGORY_LABELS[cat] ?? cat} rows={catRows} totals={catTotal} />
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-[3px] border-indigo-500 bg-indigo-50 font-bold dark:border-indigo-400 dark:bg-indigo-950/60">
            <td className="px-4 py-2.5">TỔNG CỘNG</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatVND(grand.opening)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatVND(grand.increase)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatVND(grand.decrease)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatVND(grand.closing)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function GroupBlock({
  label,
  rows,
  totals,
}: {
  label: string;
  rows: ObligationReportRow[];
  totals: Totals;
}) {
  return (
    <>
      <tr className="bg-muted/60">
        <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider">
          Nhóm {label}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.typeId} className="even:bg-muted/20 hover:bg-muted/40">
          <td className="border-b px-4 py-2 font-medium">
            {r.name}
            {r.code ? <span className="ml-1 text-xs text-muted-foreground">({r.code})</span> : null}
          </td>
          <td className="border-b px-4 py-2 text-right tabular-nums">{formatVND(n(r.opening))}</td>
          <td className="border-b px-4 py-2 text-right tabular-nums text-amber-700 dark:text-amber-300">
            {formatVND(n(r.increase))}
          </td>
          <td className="border-b px-4 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatVND(n(r.decrease))}
          </td>
          <td className="border-b px-4 py-2 text-right font-semibold tabular-nums">
            {formatVND(n(r.closing))}
          </td>
        </tr>
      ))}
      <tr className="bg-muted/30 font-semibold">
        <td className="px-4 py-2">Cộng nhóm {label}</td>
        <td className="px-4 py-2 text-right tabular-nums">{formatVND(totals.opening)}</td>
        <td className="px-4 py-2 text-right tabular-nums">{formatVND(totals.increase)}</td>
        <td className="px-4 py-2 text-right tabular-nums">{formatVND(totals.decrease)}</td>
        <td className="px-4 py-2 text-right tabular-nums">{formatVND(totals.closing)}</td>
      </tr>
    </>
  );
}
