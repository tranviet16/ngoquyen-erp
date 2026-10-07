"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  createPriceQuote,
  updatePriceQuote,
  softDeletePriceQuote,
} from "@/lib/vat-tu-ncc/price-quote-service";
import { annotateQuoteHistory, resolveQuote, type QuoteTrend } from "@/lib/vat-tu-ncc/quote-resolver";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { Plus, Save, X } from "lucide-react";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useSortableRows } from "@/components/sortable-table/use-sortable-rows";

type QuoteRow = {
  id: number;
  supplierId: number;
  itemId: number;
  unitPrice: unknown;
  effectiveFrom: Date | string;
  note: string | null;
};

type AnnotatedRow = ReturnType<typeof annotateQuoteHistory<{
  id: number; supplierId: number; itemId: number; unitPrice: number; effectiveFrom: Date; note: string | null;
}>>[number];

type ItemOption = { id: number; code: string; name: string; unit: string };

const TREND_BADGE: Record<QuoteTrend, { label: string; className: string }> = {
  moi: { label: "Mới", className: "bg-blue-100 text-blue-700" },
  tang: { label: "Tăng", className: "bg-red-100 text-red-700" },
  giam: { label: "Giảm", className: "bg-green-100 text-green-700" },
  giu_nguyen: { label: "Giữ nguyên", className: "bg-muted text-muted-foreground" },
};

const toIsoDay = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

interface Props {
  supplierId: number;
  initialData: QuoteRow[];
  items: ItemOption[];
  canCreate: boolean;
  canEdit: boolean;
}

export function BaoGiaClient({ supplierId, initialData, items, canCreate, canEdit }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [itemId, setItemId] = useState<string>("");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Giá trước/chênh lệch tính trên toàn chuỗi từng vật tư, rồi mới sắp để hiển thị.
  const annotatedRows = useMemo(() => {
    const annotated = annotateQuoteHistory(
      initialData.map((q) => ({
        id: q.id,
        supplierId: q.supplierId,
        itemId: q.itemId,
        note: q.note,
        unitPrice: Number(q.unitPrice),
        effectiveFrom: new Date(q.effectiveFrom),
      })),
    );
    return annotated.sort(
      (a, b) => a.itemId - b.itemId || b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.id - a.id,
    );
  }, [initialData]);

  const currentQuote = useMemo(
    () => (itemId ? resolveQuote(annotatedRows, Number(itemId), new Date()) : null),
    [annotatedRows, itemId],
  );

  const sortColumns = useMemo(() => ({
    item: { accessor: (row: AnnotatedRow) => {
      const item = itemMap.get(row.itemId);
      return item ? `${item.code} - ${item.name}` : `#${row.itemId}`;
    }, kind: "text" as const },
    prevPrice: { accessor: (row: AnnotatedRow) => row.prevPrice, kind: "currency" as const },
    price: { accessor: (row: AnnotatedRow) => row.unitPrice, kind: "currency" as const },
    diff: { accessor: (row: AnnotatedRow) => row.diff, kind: "currency" as const },
    trend: { accessor: (row: AnnotatedRow) => TREND_BADGE[row.trend].label, kind: "text" as const },
    effectiveFrom: { accessor: (row: AnnotatedRow) => row.effectiveFrom, kind: "date" as const },
    note: { accessor: (row: AnnotatedRow) => row.note, kind: "text" as const },
  }), [itemMap]);
  const { sort, sortedRows, toggleSort } = useSortableRows(annotatedRows, sortColumns);

  function resetForm() {
    setEditingId(null);
    setItemId("");
    setUnitPrice("");
    setEffectiveFrom("");
    setNote("");
  }

  function startEdit(q: AnnotatedRow) {
    setEditingId(q.id);
    setItemId(String(q.itemId));
    setUnitPrice(String(q.unitPrice));
    setEffectiveFrom(toIsoDay(q.effectiveFrom));
    setNote(q.note ?? "");
  }

  async function handleSubmit() {
    const price = Number(unitPrice);
    if (!itemId || !effectiveFrom || unitPrice.trim() === "" || !Number.isFinite(price) || price < 0) {
      toast.error("Chọn vật tư, nhập đơn giá >= 0 và ngày hiệu lực");
      return;
    }
    const payload = {
      supplierId,
      itemId: Number(itemId),
      unitPrice: price,
      effectiveFrom,
      note: note || undefined,
    };
    setSaving(true);
    try {
      if (editingId != null) {
        await updatePriceQuote(editingId, payload);
        toast.success("Đã cập nhật báo giá");
        resetForm();
      } else {
        await createPriceQuote(payload);
        toast.success("Đã thêm báo giá");
        setUnitPrice("");
        setNote("");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Xóa mức báo giá này? Phiếu đã chốt giá không bị ảnh hưởng.")) return;
    try {
      await softDeletePriceQuote(id, supplierId);
      toast.success("Đã xóa");
      if (editingId === id) resetForm();
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Báo giá theo thời gian</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Mỗi dòng là một mức giá có hiệu lực <strong>từ ngày</strong> — khi chốt kỳ, từng phiếu tự
          điền mức giá hiệu lực tại đúng ngày lấy hàng (vẫn sửa tay được). Giá đổi thì thêm dòng
          mới; chỉ dùng Sửa khi nhập nhầm.
        </p>
      </div>

      {(canCreate || (canEdit && editingId != null)) && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
          <label className="text-sm space-y-1">
            <span className="block text-muted-foreground">Vật tư</span>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="h-9 min-w-56 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">— Chọn vật tư —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.code} - {i.name} ({i.unit})</option>
              ))}
            </select>
            {itemId && (
              <span className="block text-xs text-muted-foreground">
                {currentQuote
                  ? `Giá hiện hành: ${formatNumber(currentQuote.unitPrice)} từ ${formatDate(currentQuote.effectiveFrom)}`
                  : "Chưa có giá hiện hành"}
              </span>
            )}
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-muted-foreground">Đơn giá</span>
            <input
              type="number" min={0} value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="h-9 w-36 rounded-md border border-input bg-transparent px-2 text-right text-sm"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="block text-muted-foreground">Hiệu lực từ ngày</span>
            <input
              type="date" value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            />
          </label>
          <label className="text-sm space-y-1 flex-1 min-w-40">
            <span className="block text-muted-foreground">Ghi chú</span>
            <input
              type="text" value={note} placeholder="Số báo giá, thỏa thuận…"
              onChange={(e) => setNote(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            />
          </label>
          <Button onClick={handleSubmit} disabled={saving}>
            {editingId != null ? <Save className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
            {saving ? "Đang lưu…" : editingId != null ? "Lưu" : "Thêm báo giá"}
          </Button>
          {editingId != null && (
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              <X className="size-4" aria-hidden="true" />
              Hủy
            </Button>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-[860px] w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <SortableTableHead column="item" label="Vật tư" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="effectiveFrom" label="Hiệu lực từ" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="prevPrice" label="Giá trước" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
              <SortableTableHead column="price" label="Đơn giá" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
              <SortableTableHead column="diff" label="Chênh lệch" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
              <SortableTableHead column="trend" label="Nhận xét" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="note" label="Ghi chú" sort={sort} onToggle={toggleSort} className="font-medium" />
              <th className="px-3 py-2 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {annotatedRows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                Chưa có báo giá nào. Thêm mức giá đầu tiên để chốt kỳ tự điền giá theo ngày phiếu.
              </td></tr>
            )}
            {sortedRows.map((q) => {
              const item = itemMap.get(q.itemId);
              const badge = TREND_BADGE[q.trend];
              const diffClass = q.diff == null || q.diff === 0 ? "" : q.diff > 0 ? "text-red-600" : "text-green-600";
              return (
                <tr key={q.id} className={editingId === q.id ? "border-t bg-muted/40" : "border-t"}>
                  <td className="px-3 py-2">{item ? `${item.code} - ${item.name}` : `#${q.itemId}`}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(q.effectiveFrom)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                    {q.prevPrice == null ? "—" : formatNumber(q.prevPrice)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatNumber(q.unitPrice)}{item ? ` đ/${item.unit}` : ""}
                  </td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap ${diffClass}`}>
                    {q.diff == null ? "—" : `${q.diff > 0 ? "+" : ""}${formatNumber(q.diff)}`}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="px-3 py-2 max-w-56 truncate">{q.note ?? ""}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => startEdit(q)}>Sửa</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(q.id)}>Xóa</Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
