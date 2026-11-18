"use client";

/**
 * Sổ Hóa đơn: form thêm dòng (giữ lại ngày / số HĐ / NCC / VAT % cho dòng kế tiếp của cùng hóa đơn)
 * + lưới sửa tại ô. Mỗi lần sửa chỉ gửi ô vừa đổi; server gộp vào dòng đang lưu và tính lại thành
 * tiền / tiền VAT. NCC chỉ chọn trong danh sách NCC đang hoạt động (NCC mới do quản trị tạo).
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
import type { InvoiceLinePatch } from "@/lib/du-an/dt-hd-tt/entry-schemas";
import { formNumber, isoToDmy, parseDateCell, parseNumberCell } from "@/lib/du-an/dt-hd-tt/entry-cell-parse";
import { createInvoiceLine, softDeleteInvoiceLine, updateInvoiceLine, type InvoiceLineRow } from "@/lib/du-an/dt-hd-tt/invoice-service";

const DataGrid = dynamic(() => import("@/components/data-grid").then((m) => m.DataGrid), { ssr: false }) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

interface GridRow extends RowWithId {
  /** Ô chữ dd/mm/yyyy (hoặc chữ ngày gốc của file khi chưa đọc được). */
  invoiceDate: string;
  invoiceNo: string;
  supplierId: number;
  itemName: string;
  unit: string;
  qty: number | null;
  unitPrice: number | null;
  amountVnd: number;
  vatPercent: number | null;
  vatVnd: number;
  totalVnd: number;
  mapping: string;
  note: string;
}

const toGrid = (r: InvoiceLineRow): GridRow => ({
  id: r.id, invoiceDate: r.invoiceDate ? isoToDmy(r.invoiceDate) : r.invoiceDateText ?? "", invoiceNo: r.invoiceNo, supplierId: r.supplierId,
  itemName: r.itemName, unit: r.unit, qty: r.qty, unitPrice: r.unitPrice, amountVnd: r.amountVnd,
  vatPercent: r.vatPct === null ? null : Math.round(r.vatPct * 10_000) / 100, vatVnd: r.vatVnd, totalVnd: r.amountVnd + r.vatVnd,
  mapping: r.mapped ? "" : "chưa gán", note: r.note ?? "",
});

/** Ô vừa sửa → bản sửa một phần gửi server (chữ / số không đọc được thì báo lỗi, không lưu). */
function cellPatch(col: string, value: unknown): InvoiceLinePatch {
  const text = value == null ? "" : String(value);
  switch (col) {
    case "invoiceDate": return { invoiceDate: parseDateCell(value) };
    case "invoiceNo": return { invoiceNo: text };
    case "supplierId": {
      const supplierId = parseNumberCell(value, "NCC");
      if (supplierId === null) throw new Error("Chọn NCC");
      return { supplierId };
    }
    case "itemName": return { itemName: text };
    case "unit": return { unit: text };
    case "note": return { note: text || null };
    case "qty": return { qty: parseNumberCell(value, "SL") };
    case "unitPrice": return { unitPrice: parseNumberCell(value, "Đơn giá") };
    case "amountVnd": return { amountVnd: parseNumberCell(value, "Thành tiền") };
    case "vatPercent": {
      const pct = parseNumberCell(value, "VAT %");
      return { vatPct: pct === null ? null : pct / 100 };
    }
    case "vatVnd": return { vatVnd: parseNumberCell(value, "Tiền VAT") };
    default: throw new Error(`Cột "${col}" không sửa được`);
  }
}

const EMPTY_FORM = { invoiceDate: "", invoiceNo: "", supplierId: "", itemName: "", unit: "", qty: "", unitPrice: "", amountVnd: "", vatPercent: "", vatVnd: "", note: "" };
type FormState = typeof EMPTY_FORM;

interface Props {
  projectId: number;
  rows: InvoiceLineRow[];
  suppliers: SelectOption[];
  canCreate: boolean;
  canEdit: boolean;
}

export function HoaDonClient({ projectId, rows, suppliers, canCreate, canEdit }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  // NCC đã ngừng dùng vẫn hiện tên ở dòng cũ, nhưng không có trong danh sách chọn cho dòng mới.
  const activeIds = new Set(suppliers.map((s) => String(s.id)));
  const gridOptions: SelectOption[] = [...suppliers];
  for (const r of rows) {
    if (!activeIds.has(String(r.supplierId))) { activeIds.add(String(r.supplierId)); gridOptions.push({ id: r.supplierId, name: `${r.supplierName} (ngừng dùng)` }); }
  }
  const totals = rows.reduce((t, r) => ({ amount: t.amount + r.amountVnd, vat: t.vat + r.vatVnd }), { amount: 0, vat: 0 });
  const unmapped = rows.filter((r) => !r.mapped).length;
  const locked = !canEdit; // cột nhập được chỉ sửa khi có quyền `edit`

  const columns: DataGridColumn<GridRow>[] = [
    { id: "invoiceDate", title: "Ngày", kind: "text", width: 100, readonly: locked },
    { id: "invoiceNo", title: "Số HĐ", kind: "text", width: 100, readonly: locked },
    { id: "supplierId", title: "NCC", kind: "select", width: 200, options: gridOptions, readonly: locked },
    { id: "itemName", title: "Tên hàng", kind: "text", width: 240, readonly: locked },
    { id: "unit", title: "ĐVT", kind: "text", width: 60, readonly: locked },
    { id: "qty", title: "SL", kind: "number", width: 90, readonly: locked },
    { id: "unitPrice", title: "Đơn giá", kind: "currency", width: 110, readonly: locked },
    { id: "amountVnd", title: "Thành tiền chưa VAT", kind: "currency", width: 140, readonly: locked },
    { id: "vatPercent", title: "VAT %", kind: "number", width: 70, readonly: locked },
    { id: "vatVnd", title: "Tiền VAT", kind: "currency", width: 120, readonly: locked },
    { id: "totalVnd", title: "Gồm VAT", kind: "currency", width: 130, readonly: true },
    { id: "mapping", title: "Ánh xạ", kind: "text", width: 80, readonly: true },
    { id: "note", title: "Ghi chú", kind: "text", width: 180, readonly: locked },
  ];

  const handlers: DataGridHandlers<GridRow> = {
    // Lỗi ném ra ở đây: lưới hiện thông điệp và trả ô về giá trị cũ.
    onCellEdit: async (id, col, value) => {
      const result = await updateInvoiceLine(id, projectId, cellPatch(col, value));
      if (!result.ok) throw new Error(result.message);
      if (result.warning) toast.warning(result.warning);
      refresh();
      return toGrid(result.row);
    },
    onDeleteRows: async (ids) => {
      try {
        for (const id of ids) {
          const result = await softDeleteInvoiceLine(id, projectId);
          if (!result.ok) throw new Error(result.message);
        }
      } finally {
        refresh(); // lỗi giữa chừng: tải lại để thấy đúng các dòng đã xóa
      }
    },
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.supplierId) { toast.error("Chọn NCC"); return; }
    setSaving(true);
    try {
      const vatPercent = formNumber(form.vatPercent, "VAT %");
      const result = await createInvoiceLine({
        projectId, supplierId: Number(form.supplierId), invoiceNo: form.invoiceNo, invoiceDate: form.invoiceDate || null, itemName: form.itemName,
        unit: form.unit, qty: formNumber(form.qty, "SL"), unitPrice: formNumber(form.unitPrice, "Đơn giá"), amountVnd: formNumber(form.amountVnd, "Thành tiền"),
        vatPct: vatPercent === null ? null : vatPercent / 100, vatVnd: formNumber(form.vatVnd, "Tiền VAT"), note: form.note || null,
      });
      if (!result.ok) { toast.error(result.message); return; }
      toast.success("Đã thêm dòng hóa đơn");
      // Giữ phần đầu hóa đơn để nhập tiếp dòng hàng kế tiếp của cùng hóa đơn.
      setForm({ ...EMPTY_FORM, invoiceDate: form.invoiceDate, invoiceNo: form.invoiceNo, supplierId: form.supplierId, vatPercent: form.vatPercent });
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
          <h2 className="text-lg font-semibold">Sổ Hóa đơn</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} dòng · Chưa VAT <strong>{vndFormatter(totals.amount)}</strong> · VAT <strong>{vndFormatter(totals.vat)}</strong> · Gồm VAT{" "}
            <strong>{vndFormatter(totals.amount + totals.vat)}</strong>
          </p>
        </div>
        {unmapped > 0 && (
          <Link href={`/du-an/${projectId}/dt-hd-tt/anh-xa`} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900 hover:underline">
            {unmapped} dòng chưa gán — mở Ánh xạ
          </Link>
        )}
      </div>

      {canCreate && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 rounded border p-3 md:grid-cols-6">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Ngày</span>
            <DateInput value={form.invoiceDate} onChange={(iso) => setForm({ ...form, invoiceDate: iso })} className="h-8" />
          </label>
          {field("invoiceNo", "Số HĐ *", { required: true })}
          <label className="col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">NCC *</span>
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required className="h-8 rounded-md border bg-transparent px-2 text-sm">
              <option value="">— Chọn NCC —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="col-span-2">{field("itemName", "Tên hàng *", { required: true })}</div>
          {field("unit", "ĐVT")}
          {field("qty", "SL", { type: "number", step: "any" })}
          {field("unitPrice", "Đơn giá", { type: "number", step: "any" })}
          {field("amountVnd", "Thành tiền chưa VAT", { type: "number", step: "any", placeholder: "= SL × đơn giá" })}
          {field("vatPercent", "VAT %", { type: "number", step: "any", min: 0, max: 100 })}
          {field("vatVnd", "Tiền VAT", { type: "number", step: "any", placeholder: "= thành tiền × VAT %" })}
          <div className="col-span-2 md:col-span-5">{field("note", "Ghi chú")}</div>
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
