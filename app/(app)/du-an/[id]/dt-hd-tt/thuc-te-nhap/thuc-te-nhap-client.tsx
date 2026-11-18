"use client";

/**
 * Sổ Thực tế nhập (thành tiền gồm VAT): form thêm dòng — bắt buộc chọn đầu mối — và lưới sửa tại ô.
 * Mỗi lần sửa chỉ gửi ô vừa đổi; server gộp vào dòng đang lưu (KL / đơn giá đổi → tính lại thành
 * tiền). Đầu mối đã gắn không được bỏ trống.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useTransition, type ComponentProps, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { vndFormatter } from "@/lib/format";
import type { ReceiptPatch } from "@/lib/du-an/dt-hd-tt/entry-schemas";
import { formNumber, isoToDmy, parseDateCell, parseNumberCell } from "@/lib/du-an/dt-hd-tt/entry-cell-parse";
import { createReceipt, softDeleteReceipt, updateReceipt, type ReceiptRow } from "@/lib/du-an/dt-hd-tt/receipt-service";

const DataGrid = dynamic(() => import("@/components/data-grid").then((m) => m.DataGrid), { ssr: false }) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

interface GridRow extends RowWithId {
  /** Ô chữ dd/mm/yyyy (hoặc chữ ngày gốc của file khi chưa đọc được). */
  date: string;
  itemName: string;
  unit: string;
  qty: number | null;
  unitPrice: number | null;
  amountVnd: number;
  counterpartyId: number | string;
  mapping: string;
  note: string;
}

const toGrid = (r: ReceiptRow): GridRow => ({
  id: r.id, date: r.date ? isoToDmy(r.date) : r.dateText ?? "", itemName: r.itemName, unit: r.unit, qty: r.qty, unitPrice: r.unitPrice,
  amountVnd: r.amountVnd, counterpartyId: r.counterpartyId ?? "", mapping: r.mapped ? "" : "chưa gán", note: r.note ?? "",
});

/** Ô vừa sửa → bản sửa một phần gửi server (chữ / số không đọc được thì báo lỗi, không lưu). */
function cellPatch(col: string, value: unknown): ReceiptPatch {
  const text = value == null ? "" : String(value);
  switch (col) {
    case "date": return { date: parseDateCell(value) };
    case "itemName": return { itemName: text };
    case "unit": return { unit: text };
    case "note": return { note: text || null };
    case "counterpartyId": return { counterpartyId: parseNumberCell(value, "Đầu mối") };
    case "qty": return { qty: parseNumberCell(value, "KL") };
    case "unitPrice": return { unitPrice: parseNumberCell(value, "Đơn giá") };
    case "amountVnd": return { amountVnd: parseNumberCell(value, "Thành tiền") };
    default: throw new Error(`Cột "${col}" không sửa được`);
  }
}

const EMPTY_FORM = { date: "", itemName: "", unit: "", qty: "", unitPrice: "", amountVnd: "", counterpartyId: "", note: "" };
type FormState = typeof EMPTY_FORM;

interface Props {
  projectId: number;
  rows: ReceiptRow[];
  counterparties: SelectOption[];
  canCreate: boolean;
  canEdit: boolean;
}

export function ThucTeNhapClient({ projectId, rows, counterparties, canCreate, canEdit }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  const total = rows.reduce((s, r) => s + r.amountVnd, 0);
  const unmapped = rows.filter((r) => !r.mapped).length;
  const noCounterparty = rows.filter((r) => r.counterpartyId === null).length;
  const gridOptions: SelectOption[] = [{ id: "", name: "(chưa gắn)" }, ...counterparties];
  const known = new Set(counterparties.map((c) => String(c.id)));
  for (const r of rows) {
    if (r.counterpartyId !== null && !known.has(String(r.counterpartyId))) {
      known.add(String(r.counterpartyId));
      gridOptions.push({ id: r.counterpartyId, name: `${r.counterpartyName ?? `#${r.counterpartyId}`} (đã xóa)` });
    }
  }
  const locked = !canEdit; // cột nhập được chỉ sửa khi có quyền `edit`

  const columns: DataGridColumn<GridRow>[] = [
    { id: "date", title: "Ngày", kind: "text", width: 100, readonly: locked },
    { id: "itemName", title: "Tên", kind: "text", width: 260, readonly: locked },
    { id: "unit", title: "ĐVT", kind: "text", width: 60, readonly: locked },
    { id: "qty", title: "KL", kind: "number", width: 90, readonly: locked },
    { id: "unitPrice", title: "Đơn giá", kind: "currency", width: 110, readonly: locked },
    { id: "amountVnd", title: "Thành tiền gồm VAT", kind: "currency", width: 140, readonly: locked },
    { id: "counterpartyId", title: "Đầu mối", kind: "select", width: 200, options: gridOptions, readonly: locked },
    { id: "mapping", title: "Ánh xạ", kind: "text", width: 80, readonly: true },
    { id: "note", title: "Ghi chú", kind: "text", width: 200, readonly: locked },
  ];

  const handlers: DataGridHandlers<GridRow> = {
    // Lỗi ném ra ở đây: lưới hiện thông điệp và trả ô về giá trị cũ.
    onCellEdit: async (id, col, value) => {
      const result = await updateReceipt(id, projectId, cellPatch(col, value));
      if (!result.ok) throw new Error(result.message);
      refresh();
      return toGrid(result.row);
    },
    onDeleteRows: async (ids) => {
      try {
        for (const id of ids) {
          const result = await softDeleteReceipt(id, projectId);
          if (!result.ok) throw new Error(result.message);
        }
      } finally {
        refresh(); // lỗi giữa chừng: tải lại để thấy đúng các dòng đã xóa
      }
    },
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.counterpartyId) { toast.error("Chọn đầu mối cho dòng thực tế nhập"); return; }
    setSaving(true);
    try {
      const result = await createReceipt({
        projectId, date: form.date || null, itemName: form.itemName, unit: form.unit, qty: formNumber(form.qty, "KL"),
        unitPrice: formNumber(form.unitPrice, "Đơn giá"), amountVnd: formNumber(form.amountVnd, "Thành tiền"),
        counterpartyId: Number(form.counterpartyId), note: form.note || null,
      });
      if (!result.ok) { toast.error(result.message); return; }
      toast.success("Đã thêm dòng thực tế nhập");
      setForm({ ...EMPTY_FORM, date: form.date, counterpartyId: form.counterpartyId });
      refresh();
    } catch (err) {
      toast.error("Không thêm được: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof FormState, label: string, props: ComponentProps<typeof Input> = {}) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="h-8" {...props} />
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Sổ Thực tế nhập</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} dòng · Thành tiền gồm VAT <strong>{vndFormatter(total)}</strong>
            {noCounterparty > 0 && <> · {noCounterparty} dòng chưa gắn đầu mối</>}
          </p>
        </div>
        {unmapped > 0 && (
          <Link href={`/du-an/${projectId}/dt-hd-tt/anh-xa`} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900 hover:underline">
            {unmapped} dòng chưa gán — mở Ánh xạ
          </Link>
        )}
      </div>

      {canCreate && counterparties.length === 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Công trình chưa có đầu mối nào — cần tạo đầu mối trước khi nhập thực tế.
        </p>
      )}
      {canCreate && counterparties.length > 0 && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 rounded border p-3 md:grid-cols-6">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Ngày</span>
            <DateInput value={form.date} onChange={(iso) => setForm({ ...form, date: iso })} className="h-8" />
          </label>
          <div className="col-span-2">{field("itemName", "Tên *", { required: true })}</div>
          {field("unit", "ĐVT")}
          <label className="col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Đầu mối *</span>
            <select value={form.counterpartyId} onChange={(e) => setForm({ ...form, counterpartyId: e.target.value })} required className="h-8 rounded-md border bg-transparent px-2 text-sm">
              <option value="">— Chọn đầu mối —</option>
              {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {field("qty", "KL", { type: "number", step: "any" })}
          {field("unitPrice", "Đơn giá", { type: "number", step: "any" })}
          {field("amountVnd", "Thành tiền gồm VAT", { type: "number", step: "any", placeholder: "= KL × đơn giá" })}
          <div className="col-span-2">{field("note", "Ghi chú")}</div>
          <div className="flex items-end"><Button type="submit" disabled={saving} className="h-8 w-full">Thêm dòng</Button></div>
        </form>
      )}

      <DataGrid<GridRow>
        key={rows.map((r) => r.id).join(",")}
        columns={columns}
        rows={rows.map(toGrid)}
        handlers={canEdit ? handlers : {}}
        height={560}
      />
    </div>
  );
}
