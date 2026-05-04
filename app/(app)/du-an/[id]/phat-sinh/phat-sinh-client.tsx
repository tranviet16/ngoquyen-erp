"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ColDef } from "ag-grid-community";
import { AgGridBase, VND_COL_DEF } from "@/components/ag-grid-base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { changeOrderSchema, type ChangeOrderInput } from "@/lib/du-an/schemas";
import { createChangeOrder, updateChangeOrder, softDeleteChangeOrder } from "@/lib/du-an/change-order-service";

type CoRow = {
  id: number; projectId: number; date: Date; coCode: string; description: string;
  reason: string | null; categoryId: number | null; itemCode: string | null;
  costImpactVnd: unknown; scheduleImpactDays: number; approvedBy: string | null;
  status: string; newItemName: string | null; note: string | null;
};
type CategoryOption = { id: number; code: string; name: string };
const STATUS_LABELS: Record<string, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" };

interface Props { projectId: number; initialData: CoRow[]; categories: CategoryOption[]; }

function CoForm({ projectId, categories, defaultValues, onSubmit }: {
  projectId: number; categories: CategoryOption[];
  defaultValues?: Partial<ChangeOrderInput>; onSubmit: (d: ChangeOrderInput) => Promise<void>;
}) {
  const form = useForm<ChangeOrderInput>({
    resolver: zodResolver(changeOrderSchema),
    defaultValues: { projectId, status: "pending", costImpactVnd: 0, scheduleImpactDays: 0, ...defaultValues },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="date" render={({ field }) => (
            <FormItem><FormLabel>Ngày</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="coCode" render={({ field }) => (
            <FormItem><FormLabel>Mã CO</FormLabel><FormControl><Input {...field} placeholder="CO-001" /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem><FormLabel>Mô tả phát sinh</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="reason" render={({ field }) => (
          <FormItem><FormLabel>Lý do</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="categoryId" render={({ field }) => (
            <FormItem><FormLabel>Hạng mục (tùy chọn)</FormLabel><FormControl>
              <select {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="">-- Phát sinh mới --</option>
                {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.code} - {c.name}</option>)}
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="itemCode" render={({ field }) => (
            <FormItem><FormLabel>Mã hạng mục (tùy chọn)</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        {/* For new item - only show if categoryId is null */}
        <FormField control={form.control} name="newItemName" render={({ field }) => (
          <FormItem><FormLabel>Tên hạng mục mới (nếu PS mới)</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="costImpactVnd" render={({ field }) => (
            <FormItem><FormLabel>Tác động chi phí (VND)</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="scheduleImpactDays" render={({ field }) => (
            <FormItem><FormLabel>Tác động tiến độ (ngày)</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseInt(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="approvedBy" render={({ field }) => (
            <FormItem><FormLabel>Người duyệt</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
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

export function PhatSinhClient({ projectId, initialData, categories }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CoRow | null>(null);
  const [, startTransition] = useTransition();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, `${c.code} - ${c.name}`]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "date", headerName: "Ngày", valueFormatter: (p) => p.value ? new Date(p.value as Date).toLocaleDateString("vi-VN") : "", width: 100 },
    { field: "coCode", headerName: "Mã CO", width: 100 },
    { field: "description", headerName: "Mô tả", flex: 2, minWidth: 180 },
    { field: "categoryId", headerName: "Hạng mục", valueFormatter: (p) => p.value ? (categoryMap[p.value as number] ?? "") : "PS mới", width: 130 },
    { field: "costImpactVnd", headerName: "Tác động chi phí", ...VND_COL_DEF, width: 150 },
    { field: "scheduleImpactDays", headerName: "TĐ tiến độ (ngày)", width: 130, type: "numericColumn" },
    { field: "approvedBy", headerName: "Người duyệt", width: 120 },
    { field: "status", headerName: "TT", valueFormatter: (p) => STATUS_LABELS[p.value as string] ?? "", width: 100 },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headerName: "Thao tác", width: 120, cellRenderer: (p: { data: any }) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="outline" size="sm" onClick={() => setEditTarget(p.data)}>Sửa</Button>
          <DeleteConfirmDialog itemName={p.data.coCode} onConfirm={async () => { await softDeleteChangeOrder(p.data.id, projectId); startTransition(() => router.refresh()); }}
            trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>} />
        </div>
      ),
    },
  ];

  async function handleCreate(data: ChangeOrderInput) {
    await createChangeOrder(data);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(data: ChangeOrderInput) {
    if (!editTarget) return;
    await updateChangeOrder(editTarget.id, data);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Phát Sinh / Change Order (CO)</h2>
        <Button onClick={() => setCreateOpen(true)}>Thêm CO</Button>
      </div>
      <AgGridBase rowData={initialData} columnDefs={colDefs} height={500} />
      <CrudDialog title="Thêm phát sinh" open={createOpen} onOpenChange={setCreateOpen}>
        <CoForm projectId={projectId} categories={categories} onSubmit={handleCreate} />
      </CrudDialog>
      <CrudDialog title="Sửa phát sinh" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <CoForm projectId={projectId} categories={categories}
            defaultValues={{ projectId, date: new Date(editTarget.date).toISOString().split("T")[0], coCode: editTarget.coCode, description: editTarget.description, reason: editTarget.reason ?? "", categoryId: editTarget.categoryId ?? undefined, itemCode: editTarget.itemCode ?? "", costImpactVnd: Number(editTarget.costImpactVnd), scheduleImpactDays: editTarget.scheduleImpactDays, approvedBy: editTarget.approvedBy ?? "", status: editTarget.status as ChangeOrderInput["status"], newItemName: editTarget.newItemName ?? "" }}
            onSubmit={handleEdit} />
        )}
      </CrudDialog>
    </div>
  );
}
