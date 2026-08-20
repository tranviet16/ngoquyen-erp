"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkPeriodConsistency,
  type PeriodCheckResult,
} from "@/lib/vat-tu-ncc/period-recon-check-service";
import { formatDate, formatVND, formatNumber } from "@/lib/utils/format";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useSortableRows } from "@/components/sortable-table/use-sortable-rows";

interface Props {
  supplierId: number;
}

export function KiemTraKhopClient({ supplierId }: Props) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [result, setResult] = useState<PeriodCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  type OrphanDelivery = PeriodCheckResult["orphanDeliveries"][number];
  type OrphanEvent = PeriodCheckResult["orphanEvents"][number];
  type Mismatch = PeriodCheckResult["mismatches"][number];
  const deliveryColumns = useMemo(() => ({
    delivery: { accessor: (row: OrphanDelivery) => row.deliveryId, kind: "number" as const },
    date: { accessor: (row: OrphanDelivery) => row.date, kind: "date" as const },
    qty: { accessor: (row: OrphanDelivery) => row.qty, kind: "number" as const },
    price: { accessor: (row: OrphanDelivery) => row.unitPrice, kind: "currency" as const },
  }), []);
  const eventColumns = useMemo(() => ({
    transaction: { accessor: (row: OrphanEvent) => row.transactionId, kind: "number" as const },
    date: { accessor: (row: OrphanEvent) => row.date, kind: "date" as const },
    amount: { accessor: (row: OrphanEvent) => row.amountTt, kind: "currency" as const },
    content: { accessor: (row: OrphanEvent) => row.content, kind: "text" as const },
  }), []);
  const mismatchColumns = useMemo(() => ({
    delivery: { accessor: (row: Mismatch) => row.deliveryId, kind: "number" as const },
    transaction: { accessor: (row: Mismatch) => row.transactionId, kind: "number" as const },
    date: { accessor: (row: Mismatch) => row.date, kind: "date" as const },
    deliveryAmount: { accessor: (row: Mismatch) => row.deliveryAmount, kind: "currency" as const },
    ledgerAmount: { accessor: (row: Mismatch) => row.ledgerAmount, kind: "currency" as const },
    diff: { accessor: (row: Mismatch) => row.diff, kind: "currency" as const },
  }), []);
  const deliverySort = useSortableRows(result?.orphanDeliveries ?? [], deliveryColumns);
  const eventSort = useSortableRows(result?.orphanEvents ?? [], eventColumns);
  const mismatchSort = useSortableRows(result?.mismatches ?? [], mismatchColumns);

  async function runCheck() {
    if (!dateFrom || !dateTo) {
      toast.error("Chọn khoảng ngày cần kiểm tra");
      return;
    }
    setLoading(true);
    try {
      setResult(await checkPeriodConsistency(supplierId, dateFrom, dateTo));
    } catch (err) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  const clean =
    result &&
    result.orphanDeliveries.length === 0 &&
    result.orphanEvents.length === 0 &&
    result.mismatches.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Kiểm tra khớp phiếu ↔ sổ cái</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Lưới an toàn: phát hiện phiếu chưa chốt, phát sinh nhập tay không link phiếu, và chênh
          số tiền giữa phiếu và sổ công nợ vật tư trong một khoảng ngày.
        </p>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-sm space-y-1">
          <span className="block text-muted-foreground">Từ ngày</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
        </label>
        <label className="text-sm space-y-1">
          <span className="block text-muted-foreground">Đến ngày</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" />
        </label>
        <Button onClick={runCheck} disabled={loading}>{loading ? "Đang kiểm tra…" : "Kiểm tra"}</Button>
      </div>

      {clean && (
        <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300">
          Khớp hoàn toàn: 0 phiếu mồ côi, 0 phát sinh mồ côi, 0 chênh lệch.
        </p>
      )}

      {result && result.orphanDeliveries.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-medium text-sm">
            Phiếu chưa có phát sinh sổ cái ({result.orphanDeliveries.length}) — chưa chốt kỳ hoặc chốt sót
          </h3>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[600px] w-full text-sm">
              <thead className="bg-muted/50"><tr className="text-left">
                <SortableTableHead column="delivery" label="Phiếu" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} className="font-medium" />
                <SortableTableHead column="date" label="Ngày" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} className="font-medium" />
                <SortableTableHead column="qty" label="KL" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} align="right" className="font-medium" />
                <SortableTableHead column="price" label="Đơn giá" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} align="right" className="font-medium" />
              </tr></thead>
              <tbody>
                {deliverySort.sortedRows.map((r) => (
                  <tr key={r.deliveryId} className="border-t">
                    <td className="px-3 py-1.5">#{r.deliveryId}</td>
                    <td className="px-3 py-1.5">{formatDate(r.date)}</td>
                    <td className="px-3 py-1.5 text-right">{formatNumber(r.qty)}</td>
                    <td className="px-3 py-1.5 text-right">{r.unitPrice == null ? "—" : formatNumber(r.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result && result.orphanEvents.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-medium text-sm">
            Phát sinh sổ cái không link phiếu ({result.orphanEvents.length}) — nhập tay/lịch sử, rà soát nếu bất thường
          </h3>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[600px] w-full text-sm">
              <thead className="bg-muted/50"><tr className="text-left">
                <SortableTableHead column="transaction" label="Giao dịch" sort={eventSort.sort} onToggle={eventSort.toggleSort} className="font-medium" />
                <SortableTableHead column="date" label="Ngày" sort={eventSort.sort} onToggle={eventSort.toggleSort} className="font-medium" />
                <SortableTableHead column="amount" label="Số tiền" sort={eventSort.sort} onToggle={eventSort.toggleSort} align="right" className="font-medium" />
                <SortableTableHead column="content" label="Nội dung" sort={eventSort.sort} onToggle={eventSort.toggleSort} className="font-medium" />
              </tr></thead>
              <tbody>
                {eventSort.sortedRows.map((r) => (
                  <tr key={r.transactionId} className="border-t">
                    <td className="px-3 py-1.5">#{r.transactionId}</td>
                    <td className="px-3 py-1.5">{formatDate(r.date)}</td>
                    <td className="px-3 py-1.5 text-right">{formatVND(r.amountTt)}</td>
                    <td className="px-3 py-1.5">{r.content ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result && result.mismatches.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-medium text-sm text-destructive">
            Chênh lệch phiếu vs sổ cái ({result.mismatches.length}) — chốt lại kỳ để đồng bộ
          </h3>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[600px] w-full text-sm">
              <thead className="bg-muted/50"><tr className="text-left">
                <SortableTableHead column="delivery" label="Phiếu" sort={mismatchSort.sort} onToggle={mismatchSort.toggleSort} className="font-medium" />
                <SortableTableHead column="transaction" label="Giao dịch" sort={mismatchSort.sort} onToggle={mismatchSort.toggleSort} className="font-medium" />
                <SortableTableHead column="date" label="Ngày" sort={mismatchSort.sort} onToggle={mismatchSort.toggleSort} className="font-medium" />
                <SortableTableHead column="deliveryAmount" label="Tiền phiếu" sort={mismatchSort.sort} onToggle={mismatchSort.toggleSort} align="right" className="font-medium" />
                <SortableTableHead column="ledgerAmount" label="Tiền sổ cái" sort={mismatchSort.sort} onToggle={mismatchSort.toggleSort} align="right" className="font-medium" />
                <SortableTableHead column="diff" label="Chênh" sort={mismatchSort.sort} onToggle={mismatchSort.toggleSort} align="right" className="font-medium" />
              </tr></thead>
              <tbody>
                {mismatchSort.sortedRows.map((r) => (
                  <tr key={r.deliveryId} className="border-t">
                    <td className="px-3 py-1.5">#{r.deliveryId}</td>
                    <td className="px-3 py-1.5">#{r.transactionId}</td>
                    <td className="px-3 py-1.5">{formatDate(r.date)}</td>
                    <td className="px-3 py-1.5 text-right">{formatVND(r.deliveryAmount)}</td>
                    <td className="px-3 py-1.5 text-right">{formatVND(r.ledgerAmount)}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-destructive">{formatVND(r.diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
