"use client";

import { useState, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridApi } from "ag-grid-community";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createJournalEntry, updateJournalEntry, softDeleteJournalEntry } from "@/lib/tai-chinh/journal-service";
import type { Prisma } from "@prisma/client";

interface CategoryOption { id: number; name: string; code: string }
interface JournalRow {
  id: number;
  date: Date;
  entryType: string;
  amountVnd: Prisma.Decimal;
  fromAccount: string | null;
  toAccount: string | null;
  description: string;
  note: string | null;
  expenseCategory: CategoryOption | null;
  refModule: string | null;
  refId: number | null;
}

interface Props {
  rows: JournalRow[];
  categories: CategoryOption[];
}

const VND = new Intl.NumberFormat("vi-VN");
const ENTRY_TYPES = [
  { value: "thu", label: "Thu" },
  { value: "chi", label: "Chi" },
  { value: "chuyen_khoan", label: "Chuyển khoản" },
];

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  entryType: "chi" as "thu" | "chi" | "chuyen_khoan",
  amountVnd: "",
  fromAccount: "",
  toAccount: "",
  expenseCategoryId: "" as string | number,
  description: "",
  note: "",
};

export function JournalGridClient({ rows, categories }: Props) {
  const router = useRouter();
  const gridRef = useRef<GridApi | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(row: JournalRow) {
    setEditId(row.id);
    setForm({
      date: new Date(row.date).toISOString().slice(0, 10),
      entryType: row.entryType as typeof form.entryType,
      amountVnd: String(row.amountVnd),
      fromAccount: row.fromAccount ?? "",
      toAccount: row.toAccount ?? "",
      expenseCategoryId: row.expenseCategory?.id ?? "",
      description: row.description,
      note: row.note ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amountVnd || !form.description) { toast.error("Nhập đủ thông tin"); return; }
    setLoading(true);
    try {
      const input = {
        date: form.date,
        entryType: form.entryType,
        amountVnd: form.amountVnd,
        fromAccount: form.fromAccount || null,
        toAccount: form.toAccount || null,
        expenseCategoryId: form.expenseCategoryId ? Number(form.expenseCategoryId) : null,
        description: form.description,
        note: form.note || null,
      };
      if (editId) { await updateJournalEntry(editId, input); } else { await createJournalEntry(input); }
      toast.success("Đã lưu");
      setDialogOpen(false);
      router.refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Xóa bút toán này?")) return;
    try { await softDeleteJournalEntry(id); toast.success("Đã xóa"); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
  }

  const colDefs: ColDef<JournalRow>[] = [
    { field: "date", headerName: "Ngày", width: 110, valueFormatter: p => p.value ? new Date(p.value).toLocaleDateString("vi-VN") : "" },
    { field: "entryType", headerName: "Loại", width: 110, valueFormatter: p => ENTRY_TYPES.find(t => t.value === p.value)?.label ?? p.value },
    { field: "description", headerName: "Nội dung", flex: 1, minWidth: 160 },
    { field: "amountVnd", headerName: "Số tiền (VND)", width: 140, type: "rightAligned", valueFormatter: p => p.value ? VND.format(Number(p.value)) : "" },
    { field: "fromAccount", headerName: "Tài khoản chi", width: 130 },
    { field: "toAccount", headerName: "Tài khoản thu", width: 130 },
    { headerName: "Phân loại", width: 130, valueGetter: p => p.data?.expenseCategory?.name ?? "" },
    { field: "note", headerName: "Ghi chú", width: 130 },
    {
      headerName: "", width: 120, pinned: "right",
      cellRenderer: (p: { data: JournalRow }) => (
        <div className="flex gap-1 items-center h-full">
          <button onClick={() => openEdit(p.data)} className="text-xs text-primary underline">Sửa</button>
          <button onClick={() => handleDelete(p.data.id)} className="text-xs text-red-500 underline">Xóa</button>
        </div>
      ),
    },
  ];

  const onGridReady = useCallback((params: { api: GridApi }) => { gridRef.current = params.api; }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Nhật ký giao dịch</h1>
        <Button onClick={openCreate} size="sm">+ Thêm bút toán</Button>
      </div>

      <div className="ag-theme-quartz h-[60vh] rounded-md border">
        <AgGridReact rowData={rows} columnDefs={colDefs} onGridReady={onGridReady} />
      </div>

      <CrudDialog title={editId ? "Sửa bút toán" : "Thêm bút toán"} open={dialogOpen} onOpenChange={setDialogOpen}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Ngày *</Label><Input type="date" value={form.date} onChange={e => set("date", e.target.value)} required /></div>
            <div>
              <Label>Loại *</Label>
              <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={form.entryType} onChange={e => set("entryType", e.target.value as typeof form.entryType)}>
                {ENTRY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div><Label>Số tiền (VND) *</Label><Input type="number" min="0" value={form.amountVnd} onChange={e => set("amountVnd", e.target.value)} required /></div>
          <div><Label>Nội dung *</Label><Input value={form.description} onChange={e => set("description", e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Tài khoản chi</Label><Input value={form.fromAccount} onChange={e => set("fromAccount", e.target.value)} /></div>
            <div><Label>Tài khoản thu</Label><Input value={form.toAccount} onChange={e => set("toAccount", e.target.value)} /></div>
          </div>
          <div>
            <Label>Phân loại chi phí</Label>
            <select className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={form.expenseCategoryId} onChange={e => set("expenseCategoryId", e.target.value)}>
              <option value="">-- Không chọn --</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
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
