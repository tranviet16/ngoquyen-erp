"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkPeriodConsistency,
  type PeriodCheckResult,
} from "@/lib/vat-tu-ncc/period-recon-check-service";
import { formatDate, formatVND, formatNumber } from "@/lib/utils/format";

interface Props {
  supplierId: number;
}

export function KiemTraKhopClient({ supplierId }: Props) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [result, setResult] = useState<PeriodCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

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
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr className="text-left">
                <th className="px-3 py-2 font-medium">Phiếu</th>
                <th className="px-3 py-2 font-medium">Ngày</th>
                <th className="px-3 py-2 font-medium text-right">KL</th>
                <th className="px-3 py-2 font-medium text-right">Đơn giá</th>
              </tr></thead>
              <tbody>
                {result.orphanDeliveries.map((r) => (
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
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr className="text-left">
                <th className="px-3 py-2 font-medium">Giao dịch</th>
                <th className="px-3 py-2 font-medium">Ngày</th>
                <th className="px-3 py-2 font-medium text-right">Số tiền</th>
                <th className="px-3 py-2 font-medium">Nội dung</th>
              </tr></thead>
              <tbody>
                {result.orphanEvents.map((r) => (
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
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr className="text-left">
                <th className="px-3 py-2 font-medium">Phiếu</th>
                <th className="px-3 py-2 font-medium">Giao dịch</th>
                <th className="px-3 py-2 font-medium">Ngày</th>
                <th className="px-3 py-2 font-medium text-right">Tiền phiếu</th>
                <th className="px-3 py-2 font-medium text-right">Tiền sổ cái</th>
                <th className="px-3 py-2 font-medium text-right">Chênh</th>
              </tr></thead>
              <tbody>
                {result.mismatches.map((r) => (
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
