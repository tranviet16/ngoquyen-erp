"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { createPrAdjustment } from "@/lib/tai-chinh/pr-adjustment-service";
import { Prisma } from "@prisma/client";

interface ConsolidatedRow {
  source: "material_ledger" | "labor_ledger" | "manual";
  partyName: string;
  type: "payable" | "receivable";
  amountVnd: string;
  dueDate: Date | null;
  status: string;
  note: string | null;
}

interface Props {
  rows: ConsolidatedRow[];
}

const VND = new Intl.NumberFormat("vi-VN");
const SOURCE_LABELS: Record<string, string> = {
  material_ledger: "Công nợ VT",
  labor_ledger: "Công nợ NC",
  manual: "Điều chỉnh",
};

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  partyType: "other" as "supplier" | "contractor" | "other",
  partyName: "",
  type: "payable" as "payable" | "receivable",
  amountVnd: "",
  dueDate: "",
  note: "",
};

export function PrClient({ rows }: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<"" | "payable" | "receivable">("");

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partyName || !form.amountVnd) { toast.error("Nhập đầy đủ thông tin"); return; }
    setLoading(true);
    try {
      await createPrAdjustment({ ...form, dueDate: form.dueDate || null, note: form.note || null });
      toast.success("Đã thêm điều chỉnh");
      setDialogOpen(false);
      router.refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }

  const filtered = filterType ? rows.filter(r => r.type === filterType) : rows;
  const totalPayable = rows.filter(r => r.type === "payable").reduce((s, r) => s.plus(r.amountVnd), new Prisma.Decimal(0));
  const totalReceivable = rows.filter(r => r.type === "receivable").reduce((s, r) => s.plus(r.amountVnd), new Prisma.Decimal(0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Phải thu / Phải trả (Tổng hợp)</h1>
        <Button onClick={() => setDialogOpen(true)} size="sm">+ Thêm điều chỉnh</Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-3 border-red-200 bg-red-50">
          <p className="text-xs text-muted-foreground">Tổng phải trả</p>
          <p className="text-xl font-bold text-red-600">{VND.format(Number(totalPayable))} ₫</p>
        </div>
        <div className="rounded-lg border p-3 border-green-200 bg-green-50">
          <p className="text-xs text-muted-foreground">Tổng phải thu</p>
          <p className="text-xl font-bold text-green-600">{VND.format(Number(totalReceivable))} ₫</p>
        </div>
      </div>

      <div className="flex gap-2">
        {(["", "payable", "receivable"] as const).map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1 text-xs rounded-full border ${filterType === t ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {t === "" ? "Tất cả" : t === "payable" ? "Phải trả" : "Phải thu"}
          </button>
        ))}
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2">Nguồn</th>
              <th className="text-left px-3 py-2">Đối tác</th>
              <th className="text-left px-3 py-2">Loại</th>
              <th className="text-right px-3 py-2">Số tiền (VND)</th>
              <th className="text-left px-3 py-2">Hạn</th>
              <th className="text-left px-3 py-2">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Không có dữ liệu</td></tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs">{SOURCE_LABELS[r.source]}</td>
                  <td className="px-3 py-2">{r.partyName}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.type === "payable" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                      {r.type === "payable" ? "Phải trả" : "Phải thu"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{VND.format(Number(r.amountVnd))}</td>
                  <td className="px-3 py-2 text-xs">{r.dueDate ? new Date(r.dueDate).toLocaleDateString("vi-VN") : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CrudDialog title="Thêm điều chỉnh phải thu/trả" open={dialogOpen} onOpenChange={setDialogOpen}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Ngày *</Label><Input type="date" value={form.date} onChange={e => set("date", e.target.value)} required /></div>
            <div>
              <Label>Loại *</Label>
              <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={form.type} onChange={e => set("type", e.target.value as typeof form.type)}>
                <option value="payable">Phải trả</option>
                <option value="receivable">Phải thu</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Loại đối tác</Label>
              <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={form.partyType} onChange={e => set("partyType", e.target.value as typeof form.partyType)}>
                <option value="supplier">Nhà cung cấp</option>
                <option value="contractor">Nhà thầu</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div><Label>Tên đối tác *</Label><Input value={form.partyName} onChange={e => set("partyName", e.target.value)} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Số tiền (VND) *</Label><Input type="number" min="0" value={form.amountVnd} onChange={e => set("amountVnd", e.target.value)} required /></div>
            <div><Label>Ngày hạn</Label><Input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} /></div>
          </div>
          <div><Label>Ghi chú</Label><Input value={form.note} onChange={e => set("note", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={loading}>Hủy</Button>
            <Button type="submit" disabled={loading}>{loading ? "Đang lưu..." : "Lưu"}</Button>
          </div>
        </form>
      </CrudDialog>
    </div>
  );
}
