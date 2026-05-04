"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ColDef } from "ag-grid-community";
import { AgGridBase, VND_COL_DEF, NUMBER_COL_DEF, vndFormatter } from "@/components/ag-grid-base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { transactionSchema, type TransactionInput } from "@/lib/du-an/schemas";
import { createTransaction, updateTransaction, softDeleteTransaction } from "@/lib/du-an/transaction-service";

type TxRow = {
  id: number; projectId: number; date: Date; transactionType: string;
  categoryId: number; itemCode: string; itemName: string; partyName: string | null;
  qty: unknown; unit: string; unitPriceHd: unknown; unitPriceTt: unknown;
  amountHd: unknown; amountTt: unknown; invoiceNo: string | null; status: string; note: string | null;
};
type CategoryOption = { id: number; code: string; name: string };

const TYPE_LABELS: Record<string, string> = { lay_hang: "Lấy hàng", nhan_cong: "Nhân công", may_moc: "Máy móc" };
const STATUS_LABELS: Record<string, string> = { pending: "Chờ", approved: "Đã duyệt", paid: "Đã thanh toán" };

interface Props {
  projectId: number; initialData: TxRow[]; categories: CategoryOption[];
}

function TransactionForm({ projectId, categories, defaultValues, onSubmit }: {
  projectId: number; categories: CategoryOption[];
  defaultValues?: Partial<TransactionInput>; onSubmit: (d: TransactionInput) => Promise<void>;
}) {
  const form = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: { projectId, transactionType: "lay_hang", status: "pending", unitPriceHd: 0, unitPriceTt: 0, categoryId: categories[0]?.id ?? 0, ...defaultValues },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="date" render={({ field }) => (
            <FormItem><FormLabel>Ngày</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="transactionType" render={({ field }) => (
            <FormItem><FormLabel>Loại</FormLabel><FormControl>
              <select {...field} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="categoryId" render={({ field }) => (
          <FormItem><FormLabel>Hạng mục</FormLabel><FormControl>
            <select {...field} onChange={(e) => field.onChange(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
          </FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="itemCode" render={({ field }) => (
            <FormItem><FormLabel>Mã hàng</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="unit" render={({ field }) => (
            <FormItem><FormLabel>ĐVT</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="itemName" render={({ field }) => (
          <FormItem><FormLabel>Tên hàng</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="partyName" render={({ field }) => (
          <FormItem><FormLabel>Nhà cung cấp / Đội</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="qty" render={({ field }) => (
            <FormItem><FormLabel>SL</FormLabel><FormControl>
              <Input type="number" step="0.0001" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="unitPriceHd" render={({ field }) => (
            <FormItem><FormLabel>Đơn giá HĐ</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="unitPriceTt" render={({ field }) => (
            <FormItem><FormLabel>Đơn giá TT</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="invoiceNo" render={({ field }) => (
            <FormItem><FormLabel>Số hóa đơn</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem><FormLabel>Trạng thái</FormLabel><FormControl>
              <select {...field} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="flex justify-end pt-2"><Button type="submit">Lưu</Button></div>
      </form>
    </Form>
  );
}

export function GiaoDichClient({ projectId, initialData, categories }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TxRow | null>(null);
  const [, startTransition] = useTransition();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, `${c.code} - ${c.name}`]));
  const totalTt = initialData.reduce((s, r) => s + Number(r.amountTt), 0);
  const totalHd = initialData.reduce((s, r) => s + Number(r.amountHd), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "date", headerName: "Ngày", valueFormatter: (p) => p.value ? new Date(p.value as Date).toLocaleDateString("vi-VN") : "", width: 100 },
    { field: "transactionType", headerName: "Loại", valueFormatter: (p) => TYPE_LABELS[p.value as string] ?? "", width: 100 },
    { field: "itemCode", headerName: "Mã hàng", width: 100 },
    { field: "itemName", headerName: "Tên hàng", flex: 2, minWidth: 150 },
    { field: "categoryId", headerName: "Hạng mục", valueFormatter: (p) => categoryMap[p.value as number] ?? "", width: 130 },
    { field: "partyName", headerName: "Nhà cung cấp", width: 140 },
    { field: "qty", headerName: "SL", ...NUMBER_COL_DEF, width: 90 },
    { field: "unit", headerName: "ĐVT", width: 60 },
    { field: "amountHd", headerName: "Giá trị HĐ", ...VND_COL_DEF, width: 130 },
    { field: "amountTt", headerName: "Giá trị TT", ...VND_COL_DEF, width: 130 },
    { field: "status", headerName: "TT", valueFormatter: (p) => STATUS_LABELS[p.value as string] ?? "", width: 100 },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headerName: "Thao tác", width: 120, cellRenderer: (p: { data: any }) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="outline" size="sm" onClick={() => setEditTarget(p.data)}>Sửa</Button>
          <DeleteConfirmDialog itemName={p.data.itemName} onConfirm={async () => { await softDeleteTransaction(p.data.id, projectId); startTransition(() => router.refresh()); }}
            trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>} />
        </div>
      ),
    },
  ];

  async function handleCreate(data: TransactionInput) {
    await createTransaction(data);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(data: TransactionInput) {
    if (!editTarget) return;
    await updateTransaction(editTarget.id, data);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Giao Dịch Dự Án</h2>
          <p className="text-sm text-muted-foreground">
            HĐ: <strong>{vndFormatter(totalHd)}</strong> | TT: <strong>{vndFormatter(totalTt)}</strong>
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Thêm giao dịch</Button>
      </div>
      <AgGridBase rowData={initialData} columnDefs={colDefs} height={500} />
      <CrudDialog title="Thêm giao dịch" open={createOpen} onOpenChange={setCreateOpen}>
        <TransactionForm projectId={projectId} categories={categories} onSubmit={handleCreate} />
      </CrudDialog>
      <CrudDialog title="Sửa giao dịch" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <TransactionForm projectId={projectId} categories={categories}
            defaultValues={{ projectId, date: new Date(editTarget.date).toISOString().split("T")[0], transactionType: editTarget.transactionType as TransactionInput["transactionType"], categoryId: editTarget.categoryId, itemCode: editTarget.itemCode, itemName: editTarget.itemName, partyName: editTarget.partyName ?? "", qty: Number(editTarget.qty), unit: editTarget.unit, unitPriceHd: Number(editTarget.unitPriceHd), unitPriceTt: Number(editTarget.unitPriceTt), invoiceNo: editTarget.invoiceNo ?? "", status: editTarget.status as TransactionInput["status"] }}
            onSubmit={handleEdit} />
        )}
      </CrudDialog>
    </div>
  );
}
