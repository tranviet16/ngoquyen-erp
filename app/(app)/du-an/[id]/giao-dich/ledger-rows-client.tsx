"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import { PendingDeliveriesNotice } from "@/components/du-an/pending-deliveries-notice";
import { formatNumber } from "@/lib/utils/format";
import { TRANSACTION_TYPE_LABELS } from "@/lib/ledger/transaction-classification";
import type { PairTotals } from "@/lib/du-an/contract-detail/list-figures";
import type { PendingSummary } from "@/lib/du-an/project-ledger/supplier-balances";
import type { ProjectLedgerOpeningView, ProjectLedgerRowView } from "@/lib/du-an/project-ledger/project-ledger-loader";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

interface Props {
  rows: ProjectLedgerRowView[];
  openings: ProjectLedgerOpeningView[];
  totals: PairTotals;
  pending: PendingSummary;
}

interface LedgerGridRow extends RowWithId {
  date: string;
  supplierName: string;
  typeLabel: string;
  itemName: string;
  qty: number | null;
  invoiceNo: string;
  incTt: number;
  decTt: number;
  incHd: number;
  decHd: number;
  content: string;
}

/** Ô trống thay cho số 0 để lưới dễ đọc (tăng / giảm luôn ≥ 0). */
const blankZero = (v: unknown) => (Number(v) === 0 ? "" : formatNumber(Number(v)));

const COLUMNS: DataGridColumn<LedgerGridRow>[] = [
  { id: "date", title: "Ngày", kind: "date", width: 110, readonly: true },
  { id: "supplierName", title: "Nhà cung cấp", kind: "text", width: 220, readonly: true },
  { id: "typeLabel", title: "Loại", kind: "text", width: 120, readonly: true },
  { id: "itemName", title: "Vật tư", kind: "text", width: 200, readonly: true },
  { id: "qty", title: "SL", kind: "number", width: 90, readonly: true, format: (v) => (v == null ? "" : formatNumber(Number(v))) },
  { id: "invoiceNo", title: "Số HĐ", kind: "text", width: 110, readonly: true },
  { id: "incTt", title: "Tăng nợ TT", kind: "currency", width: 140, readonly: true, format: blankZero },
  { id: "decTt", title: "Giảm nợ TT", kind: "currency", width: 140, readonly: true, format: blankZero },
  { id: "incHd", title: "Tăng nợ HĐ", kind: "currency", width: 140, readonly: true, format: blankZero },
  { id: "decHd", title: "Giảm nợ HĐ", kind: "currency", width: 140, readonly: true, format: blankZero },
  { id: "content", title: "Nội dung", kind: "text", width: 260, readonly: true },
];

/** Lưới chỉ đọc các dòng sổ Công nợ vật tư của công trình; số dư đầu kỳ nằm ở dải riêng phía trên lưới. */
export function LedgerRowsClient({ rows, openings, totals, pending }: Props) {
  const gridRows: LedgerGridRow[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    supplierName: r.supplierName,
    typeLabel: TRANSACTION_TYPE_LABELS[r.transactionType] ?? r.transactionType,
    itemName: r.itemName ?? "",
    qty: r.qty == null ? null : Number(r.qty),
    invoiceNo: r.invoiceNo ?? "",
    incTt: Number(r.incTt),
    decTt: Number(r.decTt),
    incHd: Number(r.incHd),
    decHd: Number(r.decHd),
    content: r.content ?? "",
  }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Figure label="Đầu kỳ TT" value={totals.openingTt} />
        <Figure label="Phát sinh TT" value={totals.phatSinhTt} />
        <Figure label="Đã trả TT" value={totals.daTraTt} />
        <Figure label="Còn nợ TT" value={totals.cuoiKyTt} highlight />
        <Figure label="Còn nợ HĐ" value={totals.cuoiKyHd} />
      </div>

      <PendingDeliveriesNotice count={pending.count} unpricedCount={pending.unpricedCount} />

      {openings.length > 0 && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Số dư đầu kỳ (không là dòng của lưới)</div>
          <ul className="space-y-0.5">
            {openings.map((o) => (
              <li key={`${o.supplierId}:${o.entityId}`} className="tabular-nums">
                {o.supplierName} · {o.entityName}: TT {formatNumber(o.openingTt)}, HĐ {formatNumber(o.openingHd)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Chỉ xem. Nguồn: sổ Công nợ vật tư, mọi Chủ thể, lũy kế toàn bộ.</span>
        <Link href="/cong-no-vt/nhap-lieu" className="font-medium text-primary hover:underline">
          Sửa ở Công nợ vật tư →
        </Link>
      </div>

      <DataGrid<LedgerGridRow> columns={COLUMNS} rows={gridRows} handlers={{}} height={560} />
    </div>
  );
}

function Figure({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"mt-1 text-base font-semibold tabular-nums " + (highlight ? "text-destructive" : "")}>{formatNumber(value)}</div>
    </div>
  );
}
