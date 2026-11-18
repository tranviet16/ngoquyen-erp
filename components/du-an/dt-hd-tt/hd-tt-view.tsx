/**
 * Màn hình "HĐ-TT": mỗi NCC pháp nhân một dòng, cột theo file của đội (E HĐ gồm VAT, G đã trả theo
 * sổ chi, H thực nộp rà soát, I đã trả, J/K cần nộp thêm / nộp vượt, T thực tế, V nợ thực tế,
 * W/X/Y sẽ lấy về / đã lấy về / còn phải lấy về). Dòng kiểm tổng và giải thích Σ T ở cuối.
 */

import { HD_TT_MONEY_COLS } from "@/lib/du-an/dt-hd-tt/export-sheet-hd-tt";
import type { HdTtReport, HdTtRow } from "@/lib/du-an/dt-hd-tt/hd-tt-report";
import { money, moneyOrZero, pct, ReportTable, TD, TD_NUM, TH, TieOutLine } from "./report-bits";

function Row({ r }: { r: HdTtRow }) {
  return (
    <tr>
      <td className={TD}>{r.supplierName}</td>
      <td className={TD}>{r.counterpartyName ?? <span className="text-muted-foreground">không thuộc đầu mối</span>}</td>
      {HD_TT_MONEY_COLS.map(({ key }) => {
        if (key === "paid") {
          return (
            <td key={key} className={TD_NUM} title={r.paidOverride !== null ? "Thực nộp rà soát (H) nhập tay" : undefined}>
              {money(r.paid)}
              {r.paidOverride !== null ? " (H)" : ""}
            </td>
          );
        }
        if (key === "actual") {
          return (
            <td key={key} className={TD_NUM}>
              {moneyOrZero(r.actual)}
              {r.actualIsTemporary ? " (tạm = HĐ)" : r.split !== null ? " (tách)" : ""}
            </td>
          );
        }
        if (key === "recovered") return <td key={key} className={TD_NUM}>{money(r.recovered)}</td>;
        if (key === "actualMinusInvoice" || key === "debt") return <td key={key} className={TD_NUM}>{moneyOrZero(r[key])}</td>;
        return <td key={key} className={TD_NUM}>{money(r[key])}</td>;
      })}
      <td className={TD_NUM}>{pct(r.paidRatio)}</td>
      <td className={TD}>{r.todo ?? ""}</td>
    </tr>
  );
}

export function HdTtView({ report }: { report: HdTtReport }) {
  const head = (
    <tr>
      <th className={TH}>Nhà cung cấp</th>
      <th className={TH}>Đầu mối</th>
      {HD_TT_MONEY_COLS.map((c) => (
        <th key={c.key} className={TH}>{c.label}</th>
      ))}
      <th className={TH}>L. I / E</th>
      <th className={TH}>Việc cần làm</th>
    </tr>
  );
  const gap = report.actualGap;
  // 13 money columns cannot shrink below one number each: on A4 landscape the name columns would be
  // squeezed to a letter wide. Print at 80 % (the team prints this sheet at 61 %).
  return (
    <div className="space-y-3 print:[zoom:0.8]">
      <ReportTable head={head}>
        {report.rows.map((r) => (
          <Row key={r.supplierId} r={r} />
        ))}
        <tr className="font-semibold">
          <td className={TD} colSpan={2}>TỔNG CỘNG</td>
          {HD_TT_MONEY_COLS.map(({ key }) => (
            <td key={key} className={TD_NUM}>{moneyOrZero(report.totals[key])}</td>
          ))}
          <td className={TD_NUM}>{report.totals.invoiceTotal === 0 ? "" : pct(report.totals.paid / report.totals.invoiceTotal)}</td>
          <td className={TD} />
        </tr>
      </ReportTable>
      {report.checks.map((c) => (
        <TieOutLine key={c.label} t={c} />
      ))}
      {(Math.round(gap.temporaryFromInvoices) !== 0 || gap.counterpartiesWithoutRows.length > 0) && (
        <div className="text-xs text-muted-foreground">
          <p>Σ T khác Σ thực tế các đầu mối NCC vì:</p>
          <ul className="list-disc pl-5">
            {Math.round(gap.temporaryFromInvoices) !== 0 && (
              <li>{moneyOrZero(gap.temporaryFromInvoices)} của các đầu mối chưa chốt thực tế đang tạm lấy bằng HĐ;</li>
            )}
            {gap.counterpartiesWithoutRows.map((c) => (
              <li key={c.name}>
                đầu mối {c.name} ({moneyOrZero(c.actual)}) không có NCC xuất HĐ nên không có dòng ở bảng này;
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
