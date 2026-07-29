"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  previewPeriodClose,
  commitPeriodClose,
  type PeriodClosePreview,
} from "@/lib/vat-tu-ncc/period-close-service";
import { formatVND } from "@/lib/utils/format";

interface Props {
  supplierId: number;
  canEdit: boolean;
}

const REASON_LABEL: Record<string, string> = {
  missing_project: "thiếu công trình",
  missing_entity: "công trình chưa gán Chủ Thể",
};

export function ChotKyClient({ supplierId, canEdit }: Props) {
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [preview, setPreview] = useState<PeriodClosePreview | null>(null);
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [committing, startCommit] = useTransition();

  const parseMonth = () => {
    const [y, m] = month.split("-").map(Number);
    return { year: y, month: m };
  };

  async function loadPreview() {
    setLoading(true);
    try {
      const { year, month: m } = parseMonth();
      const data = await previewPeriodClose(supplierId, year, m);
      setPreview(data);
      const init: Record<number, string> = {};
      for (const d of data.deliveries) {
        const price = d.currentUnitPrice ?? d.suggestedUnitPrice;
        init[d.id] = price == null ? "" : String(price);
      }
      setPrices(init);
    } catch (err) {
      toast.error("Không tải được kỳ: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  function applySuggestedToEmpty() {
    if (!preview) return;
    setPrices((prev) => {
      const next = { ...prev };
      for (const d of preview.deliveries) {
        if (!next[d.id] && d.suggestedUnitPrice != null) next[d.id] = String(d.suggestedUnitPrice);
      }
      return next;
    });
  }

  const missingPriceCount = preview
    ? preview.deliveries.filter((d) => !(Number(prices[d.id]) > 0) && prices[d.id] !== "0").length
    : 0;

  const totalAmount = preview
    ? preview.deliveries.reduce((sum, d) => {
        const p = Number(prices[d.id]);
        return Number.isFinite(p) && prices[d.id] !== "" ? sum + d.qty * p : sum;
      }, 0)
    : 0;

  function handleCommit() {
    if (!preview) return;
    startCommit(async () => {
      try {
        const { year, month: m } = parseMonth();
        const payload = preview.deliveries
          .filter((d) => prices[d.id] !== "" && Number.isFinite(Number(prices[d.id])))
          .map((d) => ({ deliveryId: d.id, unitPrice: Number(prices[d.id]) }));
        const result = await commitPeriodClose(supplierId, year, m, payload);
        toast.success(
          `Đã chốt kỳ: ${result.closedCount} phiếu, phát sinh ${formatVND(Number(result.totalAmountTt))}`,
        );
        await loadPreview();
        router.refresh();
      } catch (err) {
        toast.error("Chốt kỳ thất bại: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  const blocked = !preview || preview.signedBlocked || preview.violations.length > 0 || missingPriceCount > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Chốt kỳ vật tư</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kỳ cố định 27 tháng trước → 26 tháng đích. Gắn đơn giá cho phiếu trong kỳ rồi chốt để
            sinh phát sinh vào công nợ vật tư.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            aria-label="Tháng đích"
          />
          <Button variant="outline" onClick={loadPreview} disabled={loading}>
            {loading ? "Đang tải…" : "Xem kỳ"}
          </Button>
        </div>
      </div>

      {preview && (
        <>
          <div className="text-sm">
            Kỳ <strong>{preview.periodLabel}</strong> — {preview.deliveries.length} phiếu.
            {preview.signedBlocked && (
              <span className="text-destructive font-medium"> Kỳ đã được NCC ký — chỉ xem, không chốt lại được.</span>
            )}
          </div>

          {preview.violations.length > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive mb-1">
                {preview.violations.length} phiếu chưa đủ điều kiện chốt:
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                {preview.violations.slice(0, 10).map((v) => (
                  <li key={v.deliveryId}>
                    Phiếu #{v.deliveryId} ({v.date}): {REASON_LABEL[v.reason] ?? v.reason}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-1">
                Bổ sung công trình cho phiếu (tab Vật tư ngày) hoặc gán Chủ Thể cho công trình (Danh mục dự án).
              </p>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Ngày</th>
                  <th className="px-3 py-2 font-medium">Vật tư</th>
                  <th className="px-3 py-2 font-medium text-right">SL</th>
                  <th className="px-3 py-2 font-medium">ĐVT</th>
                  <th className="px-3 py-2 font-medium">Công trình</th>
                  <th className="px-3 py-2 font-medium">Chủ Thể</th>
                  <th className="px-3 py-2 font-medium text-right w-36">Đơn giá</th>
                  <th className="px-3 py-2 font-medium text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {preview.deliveries.map((d) => {
                  const price = Number(prices[d.id]);
                  const hasPrice = prices[d.id] !== "" && Number.isFinite(price);
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="px-3 py-1.5 whitespace-nowrap">{d.date}</td>
                      <td className="px-3 py-1.5">{d.itemLabel}</td>
                      <td className="px-3 py-1.5 text-right">{d.qty.toLocaleString("vi-VN")}</td>
                      <td className="px-3 py-1.5">{d.unit}</td>
                      <td className="px-3 py-1.5">{d.projectLabel || <span className="text-destructive">—</span>}</td>
                      <td className="px-3 py-1.5">{d.entityName || <span className="text-destructive">—</span>}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          value={prices[d.id] ?? ""}
                          onChange={(e) => setPrices((p) => ({ ...p, [d.id]: e.target.value }))}
                          disabled={!canEdit || preview.signedBlocked}
                          placeholder={d.suggestedUnitPrice != null ? String(d.suggestedUnitPrice) : "—"}
                          className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-right text-sm"
                          aria-label={`Đơn giá phiếu ${d.id}`}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {hasPrice ? formatVND(d.qty * price) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-muted/30">
                <tr>
                  <td colSpan={7} className="px-3 py-2 text-right font-medium">Cộng phát sinh kỳ (B):</td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatVND(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {missingPriceCount > 0 && <span>{missingPriceCount} phiếu chưa có đơn giá. </span>}
              <button type="button" className="underline" onClick={applySuggestedToEmpty}>
                Điền giá gợi ý cho ô trống
              </button>
            </div>
            {canEdit && (
              <Button onClick={handleCommit} disabled={blocked || committing}>
                {committing ? "Đang chốt…" : "Chốt kỳ"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
