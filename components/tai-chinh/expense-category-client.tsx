"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { createExpenseCategory, updateExpenseCategory, softDeleteExpenseCategory } from "@/lib/tai-chinh/expense-category-service";

interface CategoryRow {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  level: number;
}

interface Props {
  categories: CategoryRow[];
}

export function ExpenseCategoryClient({ categories }: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<CategoryRow | null>(null);
  const [form, setForm] = useState({ code: "", name: "", parentId: "" });
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function openCreate() { setEditRow(null); setForm({ code: "", name: "", parentId: "" }); setDialogOpen(true); }
  function openEdit(row: CategoryRow) {
    setEditRow(row);
    setForm({ code: row.code, name: row.name, parentId: row.parentId ? String(row.parentId) : "" });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code || !form.name) { toast.error("Nhập mã và tên"); return; }
    setLoading(true);
    try {
      const input = { code: form.code, name: form.name, parentId: form.parentId ? Number(form.parentId) : null };
      if (editRow) { await updateExpenseCategory(editRow.id, input); } else { await createExpenseCategory(input); }
      toast.success("Đã lưu");
      setDialogOpen(false);
      router.refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Xóa phân loại "${name}"?`)) return;
    try { await softDeleteExpenseCategory(id); toast.success("Đã xóa"); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
  }

  const roots = categories.filter(c => !c.parentId);
  const children = categories.filter(c => c.parentId);

  function renderTree(items: CategoryRow[], level = 0): React.ReactNode {
    return items.map(item => (
      <div key={item.id}>
        <div className={`flex items-center gap-2 py-1.5 border-b last:border-0 ${level > 0 ? "pl-6" : ""}`}>
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{item.code}</span>
          <span className="flex-1 text-sm">{item.name}</span>
          <button onClick={() => openEdit(item)} className="text-xs text-primary underline">Sửa</button>
          <button onClick={() => handleDelete(item.id, item.name)} className="text-xs text-red-500 underline">Xóa</button>
        </div>
        {renderTree(children.filter(c => c.parentId === item.id), level + 1)}
      </div>
    ));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Phân loại chi phí</h1>
        <Button onClick={openCreate} size="sm">+ Thêm phân loại</Button>
      </div>

      <div className="rounded-lg border divide-y">
        {categories.length === 0
          ? <div className="text-center py-8 text-muted-foreground text-sm">Chưa có phân loại</div>
          : renderTree(roots)
        }
      </div>

      <CrudDialog title={editRow ? "Sửa phân loại" : "Thêm phân loại"} open={dialogOpen} onOpenChange={setDialogOpen}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Mã *</Label><Input value={form.code} onChange={e => set("code", e.target.value)} required /></div>
            <div><Label>Tên *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} required /></div>
          </div>
          <div>
            <Label>Phân loại cha (tùy chọn)</Label>
            <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={form.parentId} onChange={e => set("parentId", e.target.value)}>
              <option value="">-- Không có (cấp gốc) --</option>
              {categories.filter(c => c.id !== editRow?.id).map(c => (
                <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
              ))}
            </select>
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
