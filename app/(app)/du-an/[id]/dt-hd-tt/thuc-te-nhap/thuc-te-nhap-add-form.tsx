"use client";

/**
 * Form thêm dòng của sổ Thực tế nhập, hai hàng: Ngày + Đầu mối (bắt buộc, ô chọn có tìm) rồi dòng hàng.
 * Sau "Thêm dòng" giữ lại ngày và đầu mối, đưa con trỏ về Tên.
 */

import { useRef, useState, type ComponentProps, type FormEvent } from "react";
import { toast } from "sonner";
import type { SelectOption } from "@/components/data-grid/types";
import { AddFormField, CollapsibleAddForm } from "@/components/du-an/dt-hd-tt/collapsible-add-form";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formNumber } from "@/lib/du-an/dt-hd-tt/entry-cell-parse";
import { createReceipt } from "@/lib/du-an/dt-hd-tt/receipt-service";

const EMPTY_FORM = { date: "", itemName: "", unit: "", qty: "", unitPrice: "", amountVnd: "", counterpartyId: "", note: "" };
type FormState = typeof EMPTY_FORM;

interface Props {
  projectId: number;
  counterparties: SelectOption[];
  /** Sau khi thêm được: tải lại lưới. */
  onAdded: () => void;
}

export function ThucTeNhapAddForm({ projectId, counterparties, onAdded }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const itemNameRef = useRef<HTMLInputElement>(null);
  const counterpartyOptions = counterparties.map((c) => ({ value: String(c.id), label: c.name }));

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
      name="thuc-te-nhap"
      title="Thêm dòng thực tế nhập"
      onSubmit={submit}
      submitLabel="Thêm dòng"
      saving={saving}
      firstRow={
        <>
          <AddFormField label="Ngày" className="w-36">
            <DateInput value={form.date} onChange={(iso) => setForm({ ...form, date: iso })} className="h-8" />
          </AddFormField>
          <AddFormField label="Đầu mối *" className="w-96 max-w-full">
            <SearchableSelect
              name="thuc-te-nhap-dau-moi"
              options={counterpartyOptions}
              value={form.counterpartyId}
              onChange={(counterpartyId) => setForm({ ...form, counterpartyId })}
              placeholder="— Chọn đầu mối —"
              required
            />
          </AddFormField>
        </>
      }
      secondRow={
        <>
          {field("itemName", "Tên *", "min-w-48 flex-1", { required: true, ref: itemNameRef })}
          {field("unit", "ĐVT", "w-16")}
          {field("qty", "KL", "w-20", { type: "number", step: "any" })}
          {field("unitPrice", "Đơn giá", "w-28", { type: "number", step: "any" })}
          {field("amountVnd", "Thành tiền gồm VAT", "w-36", { type: "number", step: "any", placeholder: "= KL × đơn giá" })}
          {field("note", "Ghi chú", "w-40")}
        </>
      }
    />
  );
}
