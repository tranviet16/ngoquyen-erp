"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TransactionInput } from "@/lib/cong-no-vt/schemas";
import type { LookupOption, TransactionRow } from "./transaction-grid";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  entities: LookupOption[];
  suppliers: LookupOption[];
  projects: LookupOption[];
  items: LookupOption[];
  defaultValues?: Partial<TransactionRow>;
  onSubmit: (data: TransactionInput) => Promise<void>;
}

const TX_TYPES: { value: string; label: string }[] = [
  { value: "lay_hang", label: "Lấy hàng" },
  { value: "thanh_toan", label: "Thanh toán" },
  { value: "dieu_chinh", label: "Điều chỉnh" },
];

export function TransactionFormDialog({ open, onOpenChange, title, entities, suppliers, projects, items, defaultValues, onSubmit }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<TransactionInput>({
    date: defaultValues?.date ? String(defaultValues.date).slice(0, 10) : today,
    transactionType: (defaultValues?.transactionType as TransactionInput["transactionType"]) ?? "lay_hang",
    entityId: defaultValues?.entityId ?? 0,
    partyId: defaultValues?.partyId ?? 0,
    projectId: defaultValues?.projectId ?? null,
    itemId: defaultValues?.itemId ?? null,
    amountTt: defaultValues?.amountTt != null ? String(defaultValues.amountTt) : "0",
    vatPctTt: defaultValues?.vatPctTt != null ? String(defaultValues.vatPctTt) : "0",
    amountHd: defaultValues?.amountHd != null ? String(defaultValues.amountHd) : "0",
    vatPctHd: defaultValues?.vatPctHd != null ? String(defaultValues.vatPctHd) : "0",
    invoiceNo: defaultValues?.invoiceNo ?? null,
    content: defaultValues?.content ?? null,
    status: (defaultValues?.status as TransactionInput["status"]) ?? "pending",
    note: defaultValues?.note ?? null,
  });

  function set<K extends keyof TransactionInput>(key: K, value: TransactionInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.entityId || !form.partyId) {
      toast.error("Vui lòng chọn Chủ thể và NCC");
      return;
    }
    setLoading(true);
    try {
      await onSubmit(form);
      toast.success("Đã lưu");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <CrudDialog title={title} open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Ngày</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />
          </div>
          <div>
            <Label>Loại giao dịch</Label>
            <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" value={form.transactionType}
              onChange={(e) => set("transactionType", e.target.value as TransactionInput["transactionType"])}>
              {TX_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Chủ thể</Label>
            <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" value={form.entityId}
              onChange={(e) => set("entityId", Number(e.target.value))}>
              <option value={0}>-- Chọn --</option>
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <Label>NCC</Label>
            <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" value={form.partyId}
              onChange={(e) => set("partyId", Number(e.target.value))}>
              <option value={0}>-- Chọn --</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Dự án (tùy chọn)</Label>
            <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" value={form.projectId ?? ""}
              onChange={(e) => set("projectId", e.target.value ? Number(e.target.value) : null)}>
              <option value="">-- Không chọn --</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Vật tư (tùy chọn)</Label>
            <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm" value={form.itemId ?? ""}
              onChange={(e) => set("itemId", e.target.value ? Number(e.target.value) : null)}>
              <option value="">-- Không chọn --</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        </div>

        <div className="border rounded p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Thực Tế (TT)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Số tiền TT (VND)</Label>
              <Input type="number" min="0" value={form.amountTt} onChange={(e) => set("amountTt", e.target.value)} />
            </div>
            <div>
              <Label>VAT% TT (0–1)</Label>
              <Input type="number" min="0" max="1" step="0.01" value={form.vatPctTt} onChange={(e) => set("vatPctTt", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="border rounded p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Hóa Đơn (HĐ)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Số tiền HĐ (VND)</Label>
              <Input type="number" min="0" value={form.amountHd} onChange={(e) => set("amountHd", e.target.value)} />
            </div>
            <div>
              <Label>VAT% HĐ (0–1)</Label>
              <Input type="number" min="0" max="1" step="0.01" value={form.vatPctHd} onChange={(e) => set("vatPctHd", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Số HĐ</Label>
            <Input value={form.invoiceNo ?? ""} onChange={(e) => set("invoiceNo", e.target.value || null)} />
          </div>
          <div>
            <Label>Nội dung</Label>
            <Input value={form.content ?? ""} onChange={(e) => set("content", e.target.value || null)} />
          </div>
        </div>

        <div>
          <Label>Ghi chú</Label>
          <Input value={form.note ?? ""} onChange={(e) => set("note", e.target.value || null)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Hủy</Button>
          <Button type="submit" disabled={loading}>{loading ? "Đang lưu..." : "Lưu"}</Button>
        </div>
      </form>
    </CrudDialog>
  );
}
