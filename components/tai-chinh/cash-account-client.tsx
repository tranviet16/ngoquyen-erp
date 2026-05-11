"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { formatVND } from "@/lib/utils/format";
import {
  createCashAccount,
  updateCashAccount,
  softDeleteCashAccount,
} from "@/lib/tai-chinh/cash-account-service";

interface CashAccountRow {
  id: number;
  name: string;
  openingBalanceVnd: string;
  displayOrder: number;
}

interface Props {
  rows: CashAccountRow[];
}

export function CashAccountClient({ rows }: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<CashAccountRow | null>(null);
  const [form, setForm] = useState({ name: "", openingBalanceVnd: "0", displayOrder: "0" });
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function openCreate() {
    setEditRow(null);
    setForm({ name: "", openingBalanceVnd: "0", displayOrder: String(rows.length + 1) });
    setDialogOpen(true);
  }

  function openEdit(row: CashAccountRow) {
    setEditRow(row);
    setForm({
      name: row.name,
      openingBalanceVnd: row.openingBalanceVnd,
      displayOrder: String(row.displayOrder),
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Nhập tên nguồn tiền"); return; }
    setLoading(true);
    try {
      const input = {
        name: form.name.trim(),
        openingBalanceVnd: form.openingBalanceVnd || "0",
        displayOrder: Number(form.displayOrder || "0"),
      };
      if (editRow) await updateCashAccount(editRow.id, input);
      else await createCashAccount(input);
      toast.success("Đã lưu");
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(row: CashAccountRow) {
    if (!confirm(`Xóa nguồn tiền "${row.name}"?`)) return;
    try {
      await softDeleteCashAccount(row.id);
      toast.success("Đã xóa");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const totalOpening = rows.reduce((s, r) => s + Number(r.openingBalanceVnd), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Nguồn tiền</h1>
          <p className="text-sm text-muted-foreground">Quản lý danh sách tài khoản tiền mặt + ngân hàng + số dư đầu kỳ.</p>
        </div>
        <Button onClick={openCreate} size="sm">+ Thêm nguồn tiền</Button>
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-16">#</th>
              <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tên nguồn</th>
              <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Số dư đầu kỳ</th>
              <th className="border-b px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground w-32">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Chưa có nguồn tiền</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="even:bg-muted/20 hover:bg-muted/40">
                <td className="border-b px-3 py-2 tabular-nums">{r.displayOrder}</td>
                <td className="border-b px-3 py-2 font-medium">{r.name}</td>
                <td className="border-b px-3 py-2 text-right tabular-nums">{formatVND(Number(r.openingBalanceVnd))}</td>
                <td className="border-b px-3 py-2 text-center">
                  <button onClick={() => openEdit(r)} className="text-xs text-primary underline mr-3">Sửa</button>
                  <button onClick={() => handleDelete(r)} className="text-xs text-red-500 underline">Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-muted/30 font-semibold">
                <td className="px-3 py-2" colSpan={2}>Tổng số dư đầu kỳ</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatVND(totalOpening)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <CrudDialog
        title={editRow ? "Sửa nguồn tiền" : "Thêm nguồn tiền"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Tên nguồn *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="VD: VCB - 899" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Số dư đầu kỳ (VND)</Label>
              <Input
                type="number"
                value={form.openingBalanceVnd}
                onChange={(e) => set("openingBalanceVnd", e.target.value)}
                step="1"
              />
            </div>
            <div>
              <Label>Thứ tự hiển thị</Label>
              <Input
                type="number"
                value={form.displayOrder}
                onChange={(e) => set("displayOrder", e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={loading}>Hủy</Button>
            <Button type="submit" disabled={loading}>{loading ? "Đang lưu..." : "Lưu"}</Button>
          </div>
        </form>
      </CrudDialog>
    </div>
  );
}
