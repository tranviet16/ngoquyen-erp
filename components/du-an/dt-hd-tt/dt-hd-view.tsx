/**
 * Màn hình "DT-HĐ": mỗi đầu mối một khối (nhóm → dòng dự toán → "↳" dòng HĐ), cuối khối là dòng
 * đối soát với sổ Hóa đơn; Phần B là HĐ ngoài dự toán / chưa gán; cuối cùng là kiểm tổng.
 */

import type { DtHdBlock, DtHdInvoiceRow, DtHdReport } from "@/lib/du-an/dt-hd-tt/dt-hd-report";
import { money, moneyOrZero, qty, ReportTable, TD, TD_NUM, TH, TieOutLine } from "./report-bits";

const COLS = 10;

function Head() {
  return (
    <tr>
      <th className={TH}>Mã nhóm / vật tư / dòng HĐ</th>
      <th className={TH}>ĐVT</th>
      <th className={TH}>KL dự toán</th>
      <th className={TH}>KL HĐ (quy đổi)</th>
      <th className={TH}>KL thiếu</th>
      <th className={TH}>KL vượt</th>
      <th className={TH}>Giá trị DT</th>
      <th className={TH}>Giá trị HĐ</th>
      <th className={TH}>Còn lại (DT − HĐ)</th>
      <th className={TH}>Tình trạng</th>
    </tr>
  );
}

function invoiceLabel(i: DtHdInvoiceRow): string {
  const conv = i.qty === null ? "" : i.factor === null ? ` (SL ${qty(i.qty)}, thiếu hệ số)` : i.factor === 1 ? "" : ` (SL ${qty(i.qty)} × ${qty(i.factor)})`;
  return `↳ ${i.supplierName} · HĐ ${i.invoiceNo || "—"} · ${i.itemName}${conv}`;
}

function InvoiceRow({ i, tag }: { i: DtHdInvoiceRow; tag?: string }) {
  return (
    <tr className="text-muted-foreground">
      <td className={`${TD} pl-6`}>{invoiceLabel(i)}</td>
      <td className={TD}>{i.unit}</td>
      <td className={TD_NUM} />
      <td className={TD_NUM}>{qty(i.qtyConverted ?? i.qty)}</td>
      <td className={TD_NUM} colSpan={3} />
      <td className={TD_NUM}>{money(i.amount)}</td>
      <td className={TD_NUM} />
      <td className={TD}>{tag ? <span className="rounded bg-amber-100 px-1 text-amber-900">{tag}</span> : null}</td>
    </tr>
  );
}

function BlockSummary({ b }: { b: DtHdBlock }) {
  const parts = [
    `Dự toán ${moneyOrZero(b.valueDt)}`,
    `HĐ do NCC xuất ${moneyOrZero(b.invoiceTotal)}`,
    b.actual === null ? "chưa chốt thực tế" : `thực tế gồm VAT ${moneyOrZero(b.actual)} (chưa VAT ${moneyOrZero(b.actualExVat)})`,
    `HĐ trong nhóm của mình ${moneyOrZero(b.inOwnGroups)}`,
    `ngoài dự toán ${moneyOrZero(b.outsideDt)}`,
    `ở nhóm của khối khác ${moneyOrZero(b.crossAssigned)}`,
  ];
  if (Math.round(b.fromOtherSuppliers) !== 0) parts.push(`nhóm của khối có HĐ của NCC khác ${moneyOrZero(b.fromOtherSuppliers)}`);
  if (b.remainingVsActual !== null) parts.push(`còn phải lấy HĐ so thực tế ${moneyOrZero(b.remainingVsActual)}`);
  return <p className="text-xs text-muted-foreground">{parts.join(" · ")}</p>;
}

function Block({ b }: { b: DtHdBlock }) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">{b.counterpartyId === null ? b.name : `Đầu mối: ${b.name}`}</h3>
      <BlockSummary b={b} />
      <ReportTable head={<Head />}>
        {b.groups.map((g) => [
          <tr key={`g${g.groupCodeId ?? "none"}`} className="bg-muted/30 font-medium">
            <td className={TD}>{g.code ? `${g.code} — ${g.name}` : g.name}</td>
            <td className={TD} colSpan={5} />
            <td className={TD_NUM}>{moneyOrZero(g.valueDt)}</td>
            <td className={TD_NUM}>{moneyOrZero(g.valueHd)}</td>
            <td className={TD_NUM}>{moneyOrZero(g.balance)}</td>
            <td className={TD}>{g.statusSummary}</td>
          </tr>,
          ...g.lines.flatMap((l) => [
            <tr key={l.key}>
              <td className={`${TD} pl-4`}>{l.itemName}</td>
              <td className={TD}>{l.unit}</td>
              <td className={TD_NUM}>{qty(l.qtyDt)}</td>
              <td className={TD_NUM}>{qty(l.qtyHd)}</td>
              <td className={TD_NUM}>{l.qtyShort ? qty(l.qtyShort) : ""}</td>
              <td className={TD_NUM}>{l.qtyOver ? qty(l.qtyOver) : ""}</td>
              <td className={TD_NUM}>{money(l.valueDt)}</td>
              <td className={TD_NUM}>{money(l.valueHd)}</td>
              <td className={TD_NUM}>{moneyOrZero(l.balance)}</td>
              <td className={TD}>{l.status}</td>
            </tr>,
            ...l.invoices.map((i) => <InvoiceRow key={`${l.key}-${i.invoiceLineId}`} i={i} />),
          ]),
          ...g.groupOnly.map((i) => <InvoiceRow key={`go${i.invoiceLineId}`} i={i} tag="Chỉ gán tới nhóm" />),
        ])}
        <tr className="font-semibold">
          <td className={TD}>Cộng khối</td>
          <td className={TD} colSpan={5} />
          <td className={TD_NUM}>{moneyOrZero(b.valueDt)}</td>
          <td className={TD_NUM}>{moneyOrZero(b.groupsHd)}</td>
          <td className={TD_NUM}>{moneyOrZero(b.valueDt - b.groupsHd)}</td>
          <td className={TD} />
        </tr>
      </ReportTable>
      <TieOutLine t={b.tieOut} />
    </section>
  );
}

export function DtHdView({ report }: { report: DtHdReport }) {
  return (
    <div className="space-y-6">
      {report.blocks.map((b) => (
        <Block key={b.counterpartyId ?? "none"} b={b} />
      ))}
      <section className="space-y-1">
        <h3 className="text-sm font-semibold">B. Hóa đơn ngoài dự toán / chưa gán dòng dự toán</h3>
        {report.partB.length === 0 ? (
          <p className="text-xs text-muted-foreground">Không có.</p>
        ) : (
          <ReportTable head={<Head />}>
            {report.partB.map((s) => [
              <tr key={`s${s.supplierId}`} className="bg-muted/30 font-medium">
                <td className={TD}>{s.supplierName}</td>
                <td className={TD} colSpan={6} />
                <td className={TD_NUM}>{moneyOrZero(s.total)}</td>
                <td className={TD} colSpan={COLS - 8} />
              </tr>,
              ...s.lines.map((i) => <InvoiceRow key={`b${i.invoiceLineId}`} i={i} tag="Ngoài DT / chưa gán" />),
            ])}
            <tr className="font-semibold">
              <td className={TD}>Cộng Phần B</td>
              <td className={TD} colSpan={6} />
              <td className={TD_NUM}>{moneyOrZero(report.partBTotal)}</td>
              <td className={TD} colSpan={COLS - 8} />
            </tr>
          </ReportTable>
        )}
      </section>
      <TieOutLine t={report.grandCheck} />
    </div>
  );
}
