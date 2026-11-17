/**
 * Màn hình "DT-TT": Phần I vật tư chính (KL, đơn giá, giá trị DT vs TT chưa VAT, chênh tách do KL /
 * do đơn giá), Phần II mỗi đầu mối một dòng (A NCC, B tổ nhân công, C khoản khác — C ngoài tổng),
 * Phần III tổng hợp theo cấp chi phí. Chênh = DT − TT ("+" là tiết kiệm).
 */

import type { DtTtReport, PhanIIRow } from "@/lib/du-an/dt-hd-tt/dt-tt-report";
import type { PhanIIIReport } from "@/lib/du-an/dt-hd-tt/phan-iii";
import { money, moneyOrZero, pct, qty, ReportTable, TD, TD_NUM, TH, TieOutLine } from "./report-bits";

function PhanI({ report }: { report: DtTtReport }) {
  const head = (
    <tr>
      {["Vật tư", "ĐVT", "KL dự toán", "KL thực nhận", "Đơn giá DT", "Đơn giá TT (chưa VAT)", "Giá trị DT", "Giá trị TT (chưa VAT)", "Chênh DT − TT", "Do KL", "Do đơn giá"].map((h) => (
        <th key={h} className={TH}>{h}</th>
      ))}
    </tr>
  );
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">Phần I. Vật tư chính — dự toán và thực tế</h3>
      {report.phanI.length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có mã nhóm nào đánh dấu là vật tư chính.</p>
      ) : (
        <ReportTable head={head}>
          {report.phanI.map((g) => [
            <tr key={`g${g.groupCodeId}`} className="bg-muted/30 font-medium">
              <td className={TD} colSpan={6}>{`${g.code} — ${g.name}`}</td>
              <td className={TD_NUM}>{moneyOrZero(g.valueDt)}</td>
              <td className={TD_NUM}>{moneyOrZero(g.valueTtExVat)}</td>
              <td className={TD_NUM}>{moneyOrZero(g.diff)}</td>
              <td className={TD} colSpan={2} />
            </tr>,
            ...g.rows.map((r, i) => (
              <tr key={`${g.groupCodeId}-${i}`} className={r.groupOnly ? "text-muted-foreground" : undefined}>
                <td className={`${TD} ${r.groupOnly ? "pl-6" : "pl-4"}`}>{r.label}</td>
                <td className={TD}>{r.unit}</td>
                <td className={TD_NUM}>{qty(r.qtyDt)}</td>
                <td className={TD_NUM}>{r.qtyTt === null && !r.groupOnly ? "thiếu hệ số" : qty(r.qtyTt)}</td>
                <td className={TD_NUM}>{money(r.priceDt)}</td>
                <td className={TD_NUM}>{money(r.priceTt)}</td>
                <td className={TD_NUM}>{money(r.valueDt)}</td>
                <td className={TD_NUM}>{money(r.valueTtExVat)}</td>
                <td className={TD_NUM}>{moneyOrZero(r.diff)}</td>
                <td className={TD_NUM}>{money(r.diffByQty)}</td>
                <td className={TD_NUM}>{money(r.diffByPrice)}</td>
              </tr>
            )),
          ])}
        </ReportTable>
      )}
      {report.checks.length > 0 && report.checks.every((c) => c.ok) ? (
        <p className="text-xs text-emerald-700">✓ Do KL + do đơn giá = chênh ở cả {report.checks.length} dòng</p>
      ) : (
        report.checks.filter((c) => !c.ok).map((c) => <TieOutLine key={c.label} t={c} />)
      )}
    </section>
  );
}

function PhanIIRows({ title, rows, total, note }: { title: string; rows: PhanIIRow[]; total: number; note?: string }) {
  return [
    <tr key={`h-${title}`} className="bg-muted/30 font-medium">
      <td className={TD} colSpan={5}>{title}</td>
    </tr>,
    ...rows.map((r) => (
      <tr key={r.counterpartyId}>
        <td className={`${TD} pl-4`}>{r.name}</td>
        <td className={TD_NUM}>{money(r.dtExVat)}</td>
        <td className={TD_NUM}>{money(r.dtInclVat)}</td>
        <td className={TD_NUM}>{r.actual === null ? "chưa chốt" : moneyOrZero(r.actual)}</td>
        <td className={TD_NUM}>{r.diff === null ? "" : moneyOrZero(r.diff)}</td>
      </tr>
    )),
    <tr key={`t-${title}`} className="font-semibold">
      <td className={TD}>{`Cộng ${title.split(".")[0]}${note ? ` (${note})` : ""}`}</td>
      <td className={TD_NUM} colSpan={2} />
      <td className={TD_NUM}>{moneyOrZero(total)}</td>
      <td className={TD_NUM} />
    </tr>,
  ];
}

function PhanII({ report }: { report: DtTtReport }) {
  const p = report.phanII;
  const head = (
    <tr>
      {["Đầu mối", "Dự toán chưa VAT", "Dự toán gồm VAT", "Thực tế gồm VAT", "Chênh DT − TT"].map((h) => (
        <th key={h} className={TH}>{h}</th>
      ))}
    </tr>
  );
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">Phần II. Theo đầu mối</h3>
      <ReportTable head={head}>
        {PhanIIRows({ title: "A. Nhà cung cấp", rows: p.a, total: p.totalA })}
        {PhanIIRows({ title: "B. Tổ nhân công", rows: p.b, total: p.totalB })}
        <tr className="font-semibold">
          <td className={TD}>TỔNG A + B</td>
          <td className={TD_NUM} colSpan={2} />
          <td className={TD_NUM}>{moneyOrZero(p.totalAB)}</td>
          <td className={TD_NUM} />
        </tr>
        {PhanIIRows({ title: "C. Khoản khác", rows: p.c, total: p.totalC, note: "ngoài tổng A + B" })}
      </ReportTable>
      {Math.round(report.untaggedReceipts) !== 0 && (
        <p className="text-xs text-amber-800">Thực tế nhập chưa gắn đầu mối: {moneyOrZero(report.untaggedReceipts)} (không cộng vào đầu mối nào).</p>
      )}
    </section>
  );
}

function PhanIII({ report }: { report: PhanIIIReport }) {
  const strong = new Set(["direct", "indirect", "beforeTax", "total"]);
  const head = (
    <tr>
      {["Khoản mục chi phí", "Tỷ lệ", "Dự toán", "Thực tế", "Chênh DT − TT"].map((h) => (
        <th key={h} className={TH}>{h}</th>
      ))}
    </tr>
  );
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">Phần III. Tổng hợp theo cấp chi phí</h3>
      <ReportTable head={head}>
        {report.rows.map((r) => (
          <tr key={r.key} className={strong.has(r.key) ? "font-semibold" : undefined}>
            <td className={TD}>{r.label}</td>
            <td className={TD_NUM}>{pct(r.rate)}</td>
            <td className={TD_NUM}>{moneyOrZero(r.estimate)}</td>
            <td className={TD_NUM}>{r.actual === null ? "" : moneyOrZero(r.actual)}</td>
            <td className={TD_NUM}>{r.actual === null ? "" : moneyOrZero(r.estimate - r.actual)}</td>
          </tr>
        ))}
      </ReportTable>
      {Math.round(report.dtWithoutKind) !== 0 && (
        <p className="text-xs font-medium text-red-700">
          ✗ Có {moneyOrZero(report.dtWithoutKind)} dự toán chưa xác định loại VL / NC / MTC — chi phí trực tiếp đang thiếu khoản này.
        </p>
      )}
    </section>
  );
}

export function DtTtView({ report, phanIII }: { report: DtTtReport; phanIII: PhanIIIReport }) {
  return (
    <div className="space-y-6">
      <PhanI report={report} />
      <PhanII report={report} />
      <PhanIII report={phanIII} />
    </div>
  );
}
