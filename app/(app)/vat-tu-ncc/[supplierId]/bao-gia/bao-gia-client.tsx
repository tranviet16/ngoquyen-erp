"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  createPriceQuote,
  softDeletePriceQuote,
} from "@/lib/vat-tu-ncc/price-quote-service";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { Plus } from "lucide-react";
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

type ItemOption = { id: number; code: string; name: string; unit: string };

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

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const sortColumns = useMemo(() => ({
    item: { accessor: (row: QuoteRow) => {
      const item = itemMap.get(row.itemId);
      return item ? `${item.code} - ${item.name}` : `#${row.itemId}`;
    }, kind: "text" as const },
    price: { accessor: (row: QuoteRow) => Number(row.unitPrice), kind: "currency" as const },
    effectiveFrom: { accessor: (row: QuoteRow) => row.effectiveFrom, kind: "date" as const },
    note: { accessor: (row: QuoteRow) => row.note, kind: "text" as const },
  }), [itemMap]);
  const { sort, sortedRows, toggleSort } = useSortableRows(initialData, sortColumns);

  async function handleCreate() {
    const price = Number(unitPrice);
    if (!itemId || !effectiveFrom || !Number.isFinite(price) || price < 0) {
      toast.error("Chọn vật tư, nhập đơn giá >= 0 và ngày hiệu lực");
      return;
    }
    setSaving(true);
    try {
      await createPriceQuote({
        supplierId,
        itemId: Number(itemId),
        unitPrice: price,
        effectiveFrom,
        note: note || undefined,
      });
      toast.success("Đã thêm báo giá");
      setUnitPrice("");
      setNote("");
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
          mới, không sửa dòng cũ.
        </p>
      </div>

      {canCreate && (
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
          <Button onClick={handleCreate} disabled={saving}>
            <Plus className="size-4" aria-hidden="true" />
            {saving ? "Đang lưu…" : "Thêm báo giá"}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-[600px] w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <SortableTableHead column="item" label="Vật tư" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="price" label="Đơn giá" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
              <SortableTableHead column="effectiveFrom" label="Hiệu lực từ" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="note" label="Ghi chú" sort={sort} onToggle={toggleSort} className="font-medium" />
              <th className="px-3 py-2 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {initialData.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                Chưa có báo giá nào. Thêm mức giá đầu tiên để chốt kỳ tự điền giá theo ngày phiếu.
              </td></tr>
            )}
            {sortedRows.map((q) => {
              const item = itemMap.get(q.itemId);
              return (
                <tr key={q.id} className="border-t">
                  <td className="px-3 py-2">{item ? `${item.code} - ${item.name}` : `#${q.itemId}`}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatNumber(Number(q.unitPrice))}{item ? ` đ/${item.unit}` : ""}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(q.effectiveFrom)}</td>
                  <td className="px-3 py-2 max-w-56 truncate">{q.note ?? ""}</td>
                  <td className="px-3 py-2 text-right">
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(q.id)}>Xóa</Button>
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
