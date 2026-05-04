"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLoanContract } from "@/lib/tai-chinh/loan-service";

const SCHEDULES = [
  { value: "monthly", label: "Hàng tháng" },
  { value: "quarterly", label: "Hàng quý" },
  { value: "bullet", label: "Một lần cuối kỳ" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function LoanFormDialog({ open, onOpenChange, onCreated }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    lenderName: "",
    principalVnd: "",
    interestRatePct: "0.08",
    startDate: today,
    endDate: "",
    paymentSchedule: "monthly" as "monthly" | "quarterly" | "bullet",
    contractDoc: "",
    note: "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.lenderName || !form.principalVnd || !form.endDate) {
      toast.error("Vui lòng nhập đầy đủ thông tin bắt buộc");
      return;
    }
    setLoading(true);
    try {
      await createLoanContract({
        lenderName: form.lenderName,
        principalVnd: form.principalVnd,
        interestRatePct: form.interestRatePct,
        startDate: form.startDate,
        endDate: form.endDate,
        paymentSchedule: form.paymentSchedule,
        contractDoc: form.contractDoc || null,
        note: form.note || null,
      });
      toast.success("Đã tạo hợp đồng vay");
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <CrudDialog title="Tạo hợp đồng vay" open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>Bên cho vay *</Label>
          <Input value={form.lenderName} onChange={e => set("lenderName", e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Số tiền vay (VND) *</Label>
            <Input type="number" min="0" value={form.principalVnd} onChange={e => set("principalVnd", e.target.value)} required />
          </div>
          <div>
            <Label>Lãi suất/năm (vd: 0.08)</Label>
            <Input type="number" min="0" max="1" step="0.001" value={form.interestRatePct} onChange={e => set("interestRatePct", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Ngày bắt đầu *</Label>
            <Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} required />
          </div>
          <div>
            <Label>Ngày đáo hạn *</Label>
            <Input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} required />
          </div>
        </div>
        <div>
          <Label>Lịch trả nợ</Label>
          <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={form.paymentSchedule} onChange={e => set("paymentSchedule", e.target.value as typeof form.paymentSchedule)}>
            {SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <Label>Hồ sơ hợp đồng (URL)</Label>
          <Input value={form.contractDoc} onChange={e => set("contractDoc", e.target.value)} />
        </div>
        <div>
          <Label>Ghi chú</Label>
          <Input value={form.note} onChange={e => set("note", e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Hủy</Button>
          <Button type="submit" disabled={loading}>{loading ? "Đang tạo..." : "Tạo hợp đồng"}</Button>
        </div>
      </form>
    </CrudDialog>
  );
}
