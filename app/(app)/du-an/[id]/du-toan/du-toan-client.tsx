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
import { estimateSchema, type EstimateInput } from "@/lib/du-an/schemas";
import { createEstimate, updateEstimate, softDeleteEstimate } from "@/lib/du-an/estimate-service";

type EstimateRow = {
  id: number;
  projectId: number;
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: unknown;
  unitPrice: unknown;
  totalVnd: unknown;
  note: string | null;
};

type CategoryOption = { id: number; code: string; name: string };

interface Props {
  projectId: number;
  initialData: EstimateRow[];
  categories: CategoryOption[];
}

function EstimateForm({ projectId, categories, defaultValues, onSubmit }: {
  projectId: number;
  categories: CategoryOption[];
  defaultValues?: Partial<EstimateInput>;
  onSubmit: (d: EstimateInput) => Promise<void>;
}) {
  const form = useForm<EstimateInput>({
    resolver: zodResolver(estimateSchema),
    defaultValues: { projectId, categoryId: categories[0]?.id ?? 0, ...defaultValues },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
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
            <FormItem><FormLabel>Đơn vị</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="itemName" render={({ field }) => (
          <FormItem><FormLabel>Tên vật tư/công việc</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="qty" render={({ field }) => (
            <FormItem><FormLabel>Số lượng</FormLabel><FormControl>
              <Input type="number" step="0.0001" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="unitPrice" render={({ field }) => (
            <FormItem><FormLabel>Đơn giá (VND)</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="flex justify-end pt-2"><Button type="submit">Lưu</Button></div>
      </form>
    </Form>
  );
}

export function DuToanClient({ projectId, initialData, categories }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EstimateRow | null>(null);
  const [, startTransition] = useTransition();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, `${c.code} - ${c.name}`]));
  const grandTotal = initialData.reduce((sum, r) => sum + Number(r.totalVnd), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "itemCode", headerName: "Mã hàng", width: 110 },
    { field: "itemName", headerName: "Tên vật tư/công việc", flex: 2, minWidth: 200 },
    { field: "categoryId", headerName: "Hạng mục", valueFormatter: (p) => categoryMap[p.value as number] ?? "", width: 150 },
    { field: "unit", headerName: "ĐVT", width: 70 },
    { field: "qty", headerName: "SL", ...NUMBER_COL_DEF, width: 100 },
    { field: "unitPrice", headerName: "Đơn giá", ...VND_COL_DEF, width: 130 },
    { field: "totalVnd", headerName: "Thành tiền", ...VND_COL_DEF, width: 140 },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headerName: "Thao tác", width: 120, cellRenderer: (p: { data: any }) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="outline" size="sm" onClick={() => setEditTarget(p.data)}>Sửa</Button>
          <DeleteConfirmDialog
            itemName={p.data.itemName}
            onConfirm={async () => { await softDeleteEstimate(p.data.id, projectId); startTransition(() => router.refresh()); }}
            trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>}
          />
        </div>
      ),
    },
  ];

  async function handleCreate(data: EstimateInput) {
    await createEstimate(data);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(data: EstimateInput) {
    if (!editTarget) return;
    await updateEstimate(editTarget.id, data);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dự Toán Gốc</h2>
          <p className="text-sm text-muted-foreground">Tổng: <strong>{vndFormatter(grandTotal)}</strong></p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Thêm hạng mục</Button>
      </div>

      <AgGridBase rowData={initialData} columnDefs={colDefs} height={500} />

      <CrudDialog title="Thêm hạng mục dự toán" open={createOpen} onOpenChange={setCreateOpen}>
        <EstimateForm projectId={projectId} categories={categories} onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog title="Sửa hạng mục dự toán" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <EstimateForm
            projectId={projectId}
            categories={categories}
            defaultValues={{
              projectId,
              categoryId: editTarget.categoryId,
              itemCode: editTarget.itemCode,
              itemName: editTarget.itemName,
              unit: editTarget.unit,
              qty: Number(editTarget.qty),
              unitPrice: Number(editTarget.unitPrice),
            }}
            onSubmit={handleEdit}
          />
        )}
      </CrudDialog>
    </div>
  );
}
