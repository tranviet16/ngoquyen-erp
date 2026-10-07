"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import {
  previewPeriodClose,
  commitPeriodClose,
  type PeriodClosePreview,
  type PeriodRangeInput,
} from "@/lib/vat-tu-ncc/period-close-service";
import { formatVND } from "@/lib/utils/format";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useSortableRows } from "@/components/sortable-table/use-sortable-rows";

interface Props {
  supplierId: number;
  canEdit: boolean;
  /** Xem trước kỳ gợi ý, tính ở server khi mở trang. */
  initialPreview: PeriodClosePreview;
}

const initialPrices = (data: PeriodClosePreview) => {
  const init: Record<number, string> = {};
  for (const d of data.deliveries) {
    const price = d.currentUnitPrice ?? d.suggestedUnitPrice;
    init[d.id] = price == null ? "" : String(price);
  }
  return init;
};

const REASON_LABEL: Record<string, string> = {
  missing_project: "thiếu công trình",
  missing_entity: "công trình chưa gán Chủ Thể",
};

export function ChotKyClient({ supplierId, canEdit, initialPreview }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(initialPreview.periodFrom);
  const [to, setTo] = useState(initialPreview.periodTo);
  const [preview, setPreview] = useState<PeriodClosePreview | null>(initialPreview);
  const [prices, setPrices] = useState<Record<number, string>>(() => initialPrices(initialPreview));
  const [loading, setLoading] = useState(false);
  const [committing, startCommit] = useTransition();
  type Delivery = PeriodClosePreview["deliveries"][number];
  const sortColumns = useMemo(() => ({
    date: { accessor: (row: Delivery) => row.date, kind: "date" as const },
    item: { accessor: (row: Delivery) => row.itemLabel, kind: "text" as const },
    qty: { accessor: (row: Delivery) => row.qty, kind: "number" as const },
    unit: { accessor: (row: Delivery) => row.unit, kind: "text" as const },
    project: { accessor: (row: Delivery) => row.projectLabel, kind: "text" as const },
    entity: { accessor: (row: Delivery) => row.entityName, kind: "text" as const },
    price: { accessor: (row: Delivery) => prices[row.id] === "" ? null : Number(prices[row.id]), kind: "currency" as const },
    amount: { accessor: (row: Delivery) => prices[row.id] === "" ? null : row.qty * Number(prices[row.id]), kind: "currency" as const },
  }), [prices]);
  const deliverySort = useSortableRows(preview?.deliveries ?? [], sortColumns);

  async function loadPreview(range: PeriodRangeInput) {
    if (!range.from || !range.to) {
      toast.error("Nhập đủ Từ ngày và Đến ngày.");
      return;
    }
    setLoading(true);
    try {
      const data = await previewPeriodClose(supplierId, range);
      setPreview(data);
      setFrom(data.periodFrom);
      setTo(data.periodTo);
      setPrices(initialPrices(data));
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
        const range = { from: preview.periodFrom, to: preview.periodTo };
        const payload = preview.deliveries
          .filter((d) => prices[d.id] !== "" && Number.isFinite(Number(prices[d.id])))
          .map((d) => ({ deliveryId: d.id, unitPrice: Number(prices[d.id]) }));
        const result = await commitPeriodClose(supplierId, range, payload);
        toast.success(
          `Đã chốt kỳ: ${result.closedCount} phiếu, phát sinh ${formatVND(Number(result.totalAmountTt))}`,
        );
        await loadPreview(range);
        router.refresh();
      } catch (err) {
        toast.error("Chốt kỳ thất bại: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  // Ngày đang nhập khác kỳ đang xem → phải bấm "Xem kỳ" trước khi chốt.
  const rangeDirty = !!preview && (from !== preview.periodFrom || to !== preview.periodTo);
  const blocked =
    !preview ||
    rangeDirty ||
    preview.boundsError != null ||
    preview.signedBlocked ||
    preview.violations.length > 0 ||
    missingPriceCount > 0;

  function applyNextStandardPeriod() {
    if (!preview) return;
    // Kỳ 27→26 tiếp theo = kỳ gợi ý: bắt đầu ngay sau marker gần nhất, kết thúc ngày 26 kế tiếp.
    const range = preview.suggestedRange;
    setFrom(range.from);
    setTo(range.to);
    void loadPreview(range);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Chốt kỳ vật tư</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Chọn biên kỳ (mặc định 27 → 26), gắn đơn giá cho phiếu trong kỳ rồi chốt để sinh phát
            sinh vào công nợ vật tư. Kỳ mới phải bắt đầu ngay sau kỳ gần nhất.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="text-sm space-y-1">
            <span className="block text-muted-foreground">Từ ngày</span>
            <DateInput value={from} onChange={setFrom} aria-label="Từ ngày" />
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-muted-foreground">Đến ngày</span>
            <DateInput value={to} onChange={setTo} aria-label="Đến ngày" />
          </label>
          <Button variant="outline" onClick={() => loadPreview({ from, to })} disabled={loading}>
            {loading ? "Đang tải…" : "Xem kỳ"}
          </Button>
          <Button variant="ghost" onClick={applyNextStandardPeriod} disabled={loading || !preview}>
            Kỳ 27→26 tiếp theo
          </Button>
        </div>
      </div>

      {preview && (
        <>
          <div className="text-sm text-muted-foreground space-y-0.5">
            <p>
              Marker gần nhất:{" "}
              {preview.latestMarker ? (
                <strong className="text-foreground">
                  {preview.latestMarker.label} ({preview.latestMarker.signed ? "đã ký" : "chưa ký"})
                </strong>
              ) : (
                "chưa có kỳ nào"
              )}
              {preview.openingAsOf && <> · Mốc số dư ban đầu: {preview.openingAsOf.split("-").reverse().join("/")}</>}
            </p>
          </div>

          <div className="text-sm">
            Kỳ <strong>{preview.periodLabel}</strong> — {preview.deliveries.length} phiếu.
            {preview.signedBlocked && (
              <span className="text-destructive font-medium"> Kỳ đã được NCC ký — chỉ xem, không chốt lại được.</span>
            )}
            {rangeDirty && (
              <span className="text-amber-600"> Biên kỳ đã đổi — bấm &quot;Xem kỳ&quot; để tải lại trước khi chốt.</span>
            )}
          </div>

          {preview.boundsError && !preview.signedBlocked && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {preview.boundsError}
            </div>
          )}

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
            <table className="min-w-[600px] w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <SortableTableHead column="date" label="Ngày" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} className="font-medium" />
                  <SortableTableHead column="item" label="Vật tư" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} className="font-medium" />
                  <SortableTableHead column="qty" label="SL" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} align="right" className="font-medium" />
                  <SortableTableHead column="unit" label="ĐVT" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} className="font-medium" />
                  <SortableTableHead column="project" label="Công trình" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} className="font-medium" />
                  <SortableTableHead column="entity" label="Chủ Thể" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} className="font-medium" />
                  <SortableTableHead column="price" label="Đơn giá" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} align="right" className="w-36 font-medium" />
                  <SortableTableHead column="amount" label="Thành tiền" sort={deliverySort.sort} onToggle={deliverySort.toggleSort} align="right" className="font-medium" />
                </tr>
              </thead>
              <tbody>
                {deliverySort.sortedRows.map((d) => {
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
