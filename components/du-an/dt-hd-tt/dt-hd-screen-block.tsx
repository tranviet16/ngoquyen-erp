/**
 * Một khối đầu mối trên màn DT-HĐ (phần của dt-hd-screen.tsx): dòng tóm tắt (bấm để mở) và, khi mở, bảng
 * con nhóm → dòng dự toán → "↳" dòng HĐ (chỉ khi bật "Hiện dòng hóa đơn"). Mọi số là ô của báo cáo, định
 * dạng bằng đúng hàm của bản in. Bảng con không có `<thead>` để không dính chồng lên đầu bảng tóm tắt.
 * Hook đo: `data-dt-hd-summary-row` (+ `data-open`, `data-statuses`), `data-dt-hd-line` (mã tình trạng).
 */

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { DtHdInvoiceRow, DtHdLineRow } from "@/lib/du-an/dt-hd-tt/dt-hd-report";
import {
  blockTotals, invoiceText, statusLabel, statusSlug, SUMMARY_COLUMNS, type ScreenBlock, type ScreenGroup, type ScreenStatus, type StatusCount,
  type SummaryColumnId,
} from "@/lib/du-an/dt-hd-tt/dt-hd-screen-model";
import type { TieOut } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { dauMoiQuery, NONE_FILTER_VALUE, screenHref, UNSETTLED_ACTUAL, type DtHdBlockKey } from "@/lib/du-an/dt-hd-tt/screen-links";
import { cn } from "@/lib/utils";
import { money, moneyOrZero, qty, TD, TD_NUM, TH } from "./report-bits";

/** Số cột của bảng tóm tắt: đầu mối + các cột số + tình trạng. */
export const SUMMARY_COLS = SUMMARY_COLUMNS.length + 2;
const INNER_HEAD = ["Mã nhóm / vật tư / dòng HĐ", "ĐVT", "KL dự toán", "KL HĐ (quy đổi)", "KL thiếu", "KL vượt", "Giá trị DT", "Giá trị HĐ", "Còn lại (DT − HĐ)", "Tình trạng"];
const STATUS_TONE: Record<ScreenStatus, StatusTone> = {
  vuot: "danger", "con-thieu": "warning", "chua-co-hd": "neutral", "thieu-he-so": "info", "theo-gia-tri": "neutral", du: "success",
};

/** Huy hiệu đếm thu gọn (cao một dòng chữ nhỏ) để 30 dòng tóm tắt khi đóng hết vẫn ngắn. */
const COUNT_BADGE = "gap-1 px-1.5 py-0 text-[11px] leading-4";

export function StatusCounts({ statuses }: { statuses: StatusCount[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {statuses.map((s) => (
        <StatusBadge key={s.slug} tone={STATUS_TONE[s.slug]} label={`${s.label} ${s.count}`} className={COUNT_BADGE} />
      ))}
    </span>
  );
}

function LineStatus({ line }: { line: DtHdLineRow }) {
  const slug = statusSlug(line.status);
  return slug ? <StatusBadge tone={STATUS_TONE[slug]} label={statusLabel(line.status)} /> : null;
}

/** Dòng đối soát lệch: huy hiệu chữ + kỳ vọng ≠ thực tế — lệch Δ (Δ = thực tế − kỳ vọng, như bản in). */
export function BrokenTieOut({ t }: { t: TieOut }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-red-700 dark:text-red-300">
      <StatusBadge tone="danger" label="Lệch đối soát" />
      {t.label}: {moneyOrZero(t.expected)} ≠ {moneyOrZero(t.actual)} — lệch {moneyOrZero(t.actual - t.expected)}
    </p>
  );
}

function summaryCell(projectId: number, key: DtHdBlockKey, id: SummaryColumnId, value: number | null): ReactNode {
  if (id !== "actualExVat" || value !== null || key === NONE_FILTER_VALUE) return money(value);
  const href = screenHref(projectId, "dau-moi", { query: dauMoiQuery({ actual: UNSETTLED_ACTUAL }) });
  return <Link href={href} className="text-amber-700 hover:underline dark:text-amber-300">chưa chốt</Link>;
}

function InvoiceRow({ i, tag }: { i: DtHdInvoiceRow; tag?: string }) {
  return (
    <tr className="text-muted-foreground" data-dt-hd-invoice="">
      <td className={`${TD} pl-10`}>
        {invoiceText(i)}
        {tag && <StatusBadge tone="neutral" label={tag} className="ml-2" />}
      </td>
      <td className={TD}>{i.unit}</td>
      <td className={TD_NUM} />
      <td className={TD_NUM}>{qty(i.qtyConverted ?? i.qty)}</td>
      <td className={TD_NUM} colSpan={3} />
      <td className={TD_NUM}>{money(i.amount)}</td>
      <td className={TD_NUM} />
      <td className={TD} />
    </tr>
  );
}

interface GroupProps {
  g: ScreenGroup;
  open: boolean;
  onToggle: (key: string) => void;
  showInvoices: boolean;
  linesFiltered: boolean;
}

function GroupRows({ g, open, onToggle, showInvoices, linesFiltered }: GroupProps) {
  return (
    <>
      <tr className="bg-muted/30 font-medium" data-dt-hd-group={g.key}>
        <td className={TD}>
          <button type="button" aria-expanded={open} onClick={() => onToggle(g.key)} className="inline-flex items-center gap-1 text-left hover:underline">
            <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} aria-hidden="true" />
            {g.label}
          </button>
        </td>
        <td className={TD} colSpan={5} />
        <td className={TD_NUM}>{moneyOrZero(g.group.valueDt)}</td>
        <td className={TD_NUM}>{moneyOrZero(g.group.valueHd)}</td>
        <td className={TD_NUM}>{moneyOrZero(g.group.balance)}</td>
        <td className={TD}><StatusCounts statuses={g.statuses} /></td>
      </tr>
      {open && g.lines.map((l) => (
        <Fragment key={l.key}>
          <tr data-dt-hd-line={statusSlug(l.status) ?? ""}>
            <td className={`${TD} pl-6`}>{l.itemName}</td>
            <td className={TD}>{l.unit}</td>
            <td className={TD_NUM}>{qty(l.qtyDt)}</td>
            <td className={TD_NUM}>{qty(l.qtyHd)}</td>
            <td className={TD_NUM}>{l.qtyShort ? qty(l.qtyShort) : ""}</td>
            <td className={TD_NUM}>{l.qtyOver ? qty(l.qtyOver) : ""}</td>
            <td className={TD_NUM}>{money(l.valueDt)}</td>
            <td className={TD_NUM}>{money(l.valueHd)}</td>
            <td className={TD_NUM}>{moneyOrZero(l.balance)}</td>
            <td className={TD}><LineStatus line={l} /></td>
          </tr>
          {showInvoices && l.invoices.map((i) => <InvoiceRow key={i.invoiceLineId} i={i} />)}
        </Fragment>
      ))}
      {open && showInvoices && !linesFiltered && g.group.groupOnly.map((i) => <InvoiceRow key={`go${i.invoiceLineId}`} i={i} tag="Chỉ gán tới nhóm" />)}
    </>
  );
}

export interface BlockProps {
  projectId: number;
  sb: ScreenBlock;
  open: boolean;
  onToggle: (key: DtHdBlockKey) => void;
  isGroupOpen: (key: string) => boolean;
  onToggleGroup: (key: string) => void;
  showInvoices: boolean;
  linesFiltered: boolean;
}

export function DtHdScreenBlock({ projectId, sb, open, onToggle, isGroupOpen, onToggleGroup, showInvoices, linesFiltered }: BlockProps) {
  const { key, block: b, summary } = sb;
  const detailId = `dt-hd-dm-${key}`;
  const totals = blockTotals(b);
  return (
    <tbody data-dt-hd-block={key}>
      <tr data-dt-hd-summary-row={key} data-open={open ? "true" : "false"} data-statuses={summary.statuses.map((s) => s.slug).join(" ")} className={open ? "bg-muted/40" : "hover:bg-muted/30"}>
        <td className={TD}>
          <button type="button" aria-expanded={open} aria-controls={open ? detailId : undefined} onClick={() => onToggle(key)} className="inline-flex items-center gap-1 text-left font-medium hover:underline">
            <ChevronRight className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")} aria-hidden="true" />
            {summary.name}
          </button>
        </td>
        {SUMMARY_COLUMNS.map((c) => (
          <td key={c.id} className={TD_NUM}>{summaryCell(projectId, key, c.id, summary.values[c.id])}</td>
        ))}
        <td className={TD}>
          <span className="flex flex-wrap items-center gap-1">
            <StatusCounts statuses={summary.statuses} />
            {summary.brokenTieOut && <StatusBadge tone="danger" label="Lệch đối soát" className={COUNT_BADGE} />}
          </span>
        </td>
      </tr>
      {open && (
        <tr id={detailId} data-dt-hd-block-detail={key}>
          <td colSpan={SUMMARY_COLS} className="border bg-muted/10 px-3 py-2">
            <div className="mb-2 space-y-1 text-xs text-muted-foreground">
              <p>
                Thực tế gồm VAT {b.actual === null ? (key === NONE_FILTER_VALUE ? "—" : "chưa chốt") : moneyOrZero(b.actual)}
                {Math.round(b.fromOtherSuppliers) !== 0 && <> · nhóm của khối có HĐ của NCC khác {moneyOrZero(b.fromOtherSuppliers)}</>}
                {" · "}Cộng khối: DT {moneyOrZero(totals.valueDt)} · HĐ trong các nhóm {moneyOrZero(totals.groupsHd)} · còn lại {moneyOrZero(totals.balance)}
              </p>
              {summary.brokenTieOut && <BrokenTieOut t={summary.brokenTieOut} />}
            </div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                <tr>
                  {INNER_HEAD.map((h) => (
                    <th key={h} className={TH}>{h}</th>
                  ))}
                </tr>
                {sb.groups.map((g) => (
                  <GroupRows key={g.key} g={g} open={isGroupOpen(g.key)} onToggle={onToggleGroup} showInvoices={showInvoices} linesFiltered={linesFiltered} />
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </tbody>
  );
}
