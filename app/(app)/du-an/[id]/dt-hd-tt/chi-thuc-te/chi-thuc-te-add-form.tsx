"use client";

/**
 * Form thêm khoản chi của sổ Chi thực tế, hai hàng: Ngày, Mục, Nội dung rồi tiền + Đầu mối / NCC (ô
 * chọn có tìm, không bắt buộc) + Ghi chú. Sau "Thêm khoản chi" giữ lại ngày và mục, đưa con trỏ về Nội
 * dung. NCC chỉ chọn trong danh sách NCC đang hoạt động.
 */

import { useRef, useState, type ComponentProps, type FormEvent } from "react";
import { toast } from "sonner";
import type { SelectOption } from "@/components/data-grid/types";
import { AddFormField, CollapsibleAddForm } from "@/components/du-an/dt-hd-tt/collapsible-add-form";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formNumber } from "@/lib/du-an/dt-hd-tt/entry-cell-parse";
import { createPayment } from "@/lib/du-an/dt-hd-tt/payment-service";
import { PAYMENT_SECTION_OPTIONS } from "@/lib/du-an/dt-hd-tt/register-ui";

type Section = (typeof PAYMENT_SECTION_OPTIONS)[number];

const EMPTY_FORM = { date: "", content: "", bankVnd: "", cashVnd: "", section: "", counterpartyId: "", supplierId: "", note: "" };
type FormState = typeof EMPTY_FORM;

const toOptions = (list: SelectOption[]) => list.map((o) => ({ value: String(o.id), label: o.name }));

interface Props {
  projectId: number;
  counterparties: SelectOption[];
  suppliers: SelectOption[];
  /** Sau khi thêm được: tải lại lưới. */
  onAdded: () => void;
}

export function ChiThucTeAddForm({ projectId, counterparties, suppliers, onAdded }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.section) { toast.error("Chọn mục I–IV"); return; }
    setSaving(true);
    try {
      const result = await createPayment({
        projectId, date: form.date || null, content: form.content, bankVnd: formNumber(form.bankVnd, "Chuyển khoản"),
        cashVnd: formNumber(form.cashVnd, "Tiền mặt"), section: form.section as Section,
        counterpartyId: form.counterpartyId ? Number(form.counterpartyId) : null, supplierId: form.supplierId ? Number(form.supplierId) : null,
        note: form.note || null,
      });
      if (!result.ok) { toast.error(result.message); return; }
      toast.success("Đã thêm khoản chi");
      setForm({ ...EMPTY_FORM, date: form.date, section: form.section });
      contentRef.current?.focus();
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
  const picker = (key: "counterpartyId" | "supplierId", label: string, name: string, options: SelectOption[]) => (
    <AddFormField label={label} className="min-w-48 flex-1">
      <SearchableSelect name={name} options={toOptions(options)} value={form[key]} onChange={(v) => setForm({ ...form, [key]: v })} emptyLabel="(không gắn)" />
    </AddFormField>
  );

  return (
    <CollapsibleAddForm
      name="chi-thuc-te"
      title="Thêm khoản chi"
      onSubmit={submit}
      submitLabel="Thêm khoản chi"
      saving={saving}
      firstRow={
        <>
          <AddFormField label="Ngày" className="w-36">
            <DateInput value={form.date} onChange={(iso) => setForm({ ...form, date: iso })} className="h-8" />
          </AddFormField>
          <AddFormField label="Mục *" className="w-24">
            <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="h-8 rounded-md border bg-transparent px-2 text-sm">
              <option value="">— Mục —</option>
              {PAYMENT_SECTION_OPTIONS.map((s) => <option key={s} value={s}>Mục {s}</option>)}
            </select>
          </AddFormField>
          {field("content", "Nội dung *", "min-w-64 flex-1", { required: true, ref: contentRef })}
        </>
      }
      secondRow={
        <>
          {field("bankVnd", "Chuyển khoản", "w-32", { type: "number", step: "any" })}
          {field("cashVnd", "Tiền mặt", "w-32", { type: "number", step: "any" })}
          {picker("counterpartyId", "Đầu mối", "chi-thuc-te-dau-moi", counterparties)}
          {picker("supplierId", "NCC", "chi-thuc-te-ncc", suppliers)}
          {field("note", "Ghi chú", "w-36")}
        </>
      }
    />
  );
}
