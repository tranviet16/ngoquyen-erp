"use client";

/**
 * Form thêm dòng của sổ Hóa đơn, hai hàng: đầu hóa đơn (Ngày, Số HĐ, NCC, VAT %) rồi dòng hàng. Sau
 * "Thêm dòng" giữ lại ngày / số HĐ / NCC / VAT % để nhập tiếp dòng hàng kế tiếp của cùng hóa đơn, và
 * đưa con trỏ về Tên hàng. NCC chọn bằng ô có tìm, chỉ trong danh sách NCC đang hoạt động.
 */

import { useRef, useState, type ComponentProps, type FormEvent } from "react";
import { toast } from "sonner";
import type { SelectOption } from "@/components/data-grid/types";
import { AddFormField, CollapsibleAddForm } from "@/components/du-an/dt-hd-tt/collapsible-add-form";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formNumber } from "@/lib/du-an/dt-hd-tt/entry-cell-parse";
import { createInvoiceLine } from "@/lib/du-an/dt-hd-tt/invoice-service";

const EMPTY_FORM = { invoiceDate: "", invoiceNo: "", supplierId: "", itemName: "", unit: "", qty: "", unitPrice: "", amountVnd: "", vatPercent: "", vatVnd: "", note: "" };
type FormState = typeof EMPTY_FORM;

interface Props {
  projectId: number;
  suppliers: SelectOption[];
  /** Sau khi thêm được: tải lại lưới. */
  onAdded: () => void;
}

export function HoaDonAddForm({ projectId, suppliers, onAdded }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const itemNameRef = useRef<HTMLInputElement>(null);
  const supplierOptions = suppliers.map((s) => ({ value: String(s.id), label: s.name }));

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
      itemNameRef.current?.focus();
      onAdded();
    } catch (err) {
      toast.error("Không thêm được: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof FormState, label: string, className: string, props: ComponentProps<typeof Input> = {}) => (
    <AddFormField label={label} className={className}>
      <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="h-8" {...props} />
    </AddFormField>
  );

  return (
    <CollapsibleAddForm
      name="hoa-don"
      title="Thêm dòng hóa đơn"
      onSubmit={submit}
      submitLabel="Thêm dòng"
      saving={saving}
      firstRow={
        <>
          <AddFormField label="Ngày" className="w-36">
            <DateInput value={form.invoiceDate} onChange={(iso) => setForm({ ...form, invoiceDate: iso })} className="h-8" />
          </AddFormField>
          {field("invoiceNo", "Số HĐ *", "w-32", { required: true })}
          <AddFormField label="NCC *" className="min-w-64 flex-1">
            <SearchableSelect
              name="hoa-don-ncc"
              options={supplierOptions}
              value={form.supplierId}
              onChange={(supplierId) => setForm({ ...form, supplierId })}
              placeholder="— Chọn NCC —"
              required
            />
          </AddFormField>
          {field("vatPercent", "VAT %", "w-20", { type: "number", step: "any", min: 0, max: 100 })}
        </>
      }
      secondRow={
        <>
          {field("itemName", "Tên hàng *", "min-w-48 flex-1", { required: true, ref: itemNameRef })}
          {field("unit", "ĐVT", "w-16")}
          {field("qty", "SL", "w-20", { type: "number", step: "any" })}
          {field("unitPrice", "Đơn giá", "w-28", { type: "number", step: "any" })}
          {field("amountVnd", "Thành tiền chưa VAT", "w-32", { type: "number", step: "any", placeholder: "= SL × đơn giá" })}
          {field("vatVnd", "Tiền VAT", "w-28", { type: "number", step: "any", placeholder: "= thành tiền × VAT %" })}
          {field("note", "Ghi chú", "w-40")}
        </>
      }
    />
  );
}
