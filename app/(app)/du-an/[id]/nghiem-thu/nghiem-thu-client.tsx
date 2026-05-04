"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ColDef } from "ag-grid-community";
import { AgGridBase, VND_COL_DEF, vndFormatter } from "@/components/ag-grid-base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { acceptanceSchema, type AcceptanceInput } from "@/lib/du-an/schemas";
import { createAcceptance, updateAcceptance, softDeleteAcceptance } from "@/lib/du-an/acceptance-service";

type AcceptanceRow = {
  id: number; projectId: number; categoryId: number; checkItem: string;
  planEnd: Date | null; actualEnd: Date | null; inspector: string | null;
  result: string | null; defectCount: number; acceptedAt: Date | null;
  amountCdtVnd: unknown; amountInternalVnd: unknown; acceptanceBatch: string | null; note: string | null;
};
type CategoryOption = { id: number; code: string; name: string };

const RESULT_LABELS: Record<string, string> = { pass: "Đạt", fail: "Không đạt", partial: "Đạt một phần" };

interface Props {
  projectId: number;
  initialData: AcceptanceRow[];
  categories: CategoryOption[];
}

function AcceptanceForm({ projectId, categories, defaultValues, onSubmit }: {
  projectId: number; categories: CategoryOption[];
  defaultValues?: Partial<AcceptanceInput>; onSubmit: (d: AcceptanceInput) => Promise<void>;
}) {
  const form = useForm<AcceptanceInput>({
    resolver: zodResolver(acceptanceSchema),
    defaultValues: { projectId, categoryId: categories[0]?.id ?? 0, defectCount: 0, amountCdtVnd: 0, amountInternalVnd: 0, ...defaultValues },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField control={form.control} name="checkItem" render={({ field }) => (
          <FormItem><FormLabel>Hạng mục kiểm tra</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="categoryId" render={({ field }) => (
          <FormItem><FormLabel>Hạng mục</FormLabel><FormControl>
            <select {...field} onChange={(e) => field.onChange(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
          </FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="planEnd" render={({ field }) => (
            <FormItem><FormLabel>Ngày KH</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="actualEnd" render={({ field }) => (
            <FormItem><FormLabel>Ngày thực tế</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="inspector" render={({ field }) => (
            <FormItem><FormLabel>Người kiểm tra</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="result" render={({ field }) => (
            <FormItem><FormLabel>Kết quả</FormLabel><FormControl>
              <select {...field} value={field.value ?? ""} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="">-- Chưa có --</option>
                {Object.entries(RESULT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="amountCdtVnd" render={({ field }) => (
            <FormItem><FormLabel>SL NT CĐT (VND)</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="amountInternalVnd" render={({ field }) => (
            <FormItem><FormLabel>SL NT nội bộ (VND)</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="acceptanceBatch" render={({ field }) => (
          <FormItem><FormLabel>Đợt nghiệm thu</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="VD: Đợt 1" /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="flex justify-end pt-2"><Button type="submit">Lưu</Button></div>
      </form>
    </Form>
  );
}

export function NghiemThuClient({ projectId, initialData, categories }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AcceptanceRow | null>(null);
  const [, startTransition] = useTransition();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, `${c.code} - ${c.name}`]));
  const totalCdt = initialData.reduce((s, r) => s + Number(r.amountCdtVnd), 0);
  const totalInternal = initialData.reduce((s, r) => s + Number(r.amountInternalVnd), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "checkItem", headerName: "Hạng mục kiểm tra", flex: 2, minWidth: 180 },
    { field: "categoryId", headerName: "Hạng mục", valueFormatter: (p) => categoryMap[p.value as number] ?? "", width: 140 },
    { field: "acceptanceBatch", headerName: "Đợt NT", width: 90 },
    { field: "planEnd", headerName: "Ngày KH", valueFormatter: (p) => p.value ? new Date(p.value as Date).toLocaleDateString("vi-VN") : "", width: 110 },
    { field: "actualEnd", headerName: "Ngày TT", valueFormatter: (p) => p.value ? new Date(p.value as Date).toLocaleDateString("vi-VN") : "", width: 110 },
    { field: "inspector", headerName: "Người KT", width: 120 },
    { field: "result", headerName: "Kết quả", valueFormatter: (p) => RESULT_LABELS[p.value as string] ?? (p.value ?? ""), width: 110 },
    { field: "amountCdtVnd", headerName: "SL NT CĐT", ...VND_COL_DEF, width: 130 },
    { field: "amountInternalVnd", headerName: "SL NT nội bộ", ...VND_COL_DEF, width: 130 },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headerName: "Thao tác", width: 120, cellRenderer: (p: { data: any }) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="outline" size="sm" onClick={() => setEditTarget(p.data)}>Sửa</Button>
          <DeleteConfirmDialog itemName={p.data.checkItem} onConfirm={async () => { await softDeleteAcceptance(p.data.id, projectId); startTransition(() => router.refresh()); }}
            trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Nghiệm Thu</h2>
          <p className="text-sm text-muted-foreground">
            CĐT: <strong>{vndFormatter(totalCdt)}</strong> | Nội bộ: <strong>{vndFormatter(totalInternal)}</strong>
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Thêm nghiệm thu</Button>
      </div>
      <AgGridBase rowData={initialData} columnDefs={colDefs} height={500} />
      <CrudDialog title="Thêm nghiệm thu" open={createOpen} onOpenChange={setCreateOpen}>
        <AcceptanceForm projectId={projectId} categories={categories} onSubmit={async (d) => { await createAcceptance(d); setCreateOpen(false); startTransition(() => router.refresh()); }} />
      </CrudDialog>
      <CrudDialog title="Sửa nghiệm thu" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <AcceptanceForm projectId={projectId} categories={categories}
            defaultValues={{ projectId, categoryId: editTarget.categoryId, checkItem: editTarget.checkItem, planEnd: editTarget.planEnd ? new Date(editTarget.planEnd).toISOString().split("T")[0] : "", actualEnd: editTarget.actualEnd ? new Date(editTarget.actualEnd).toISOString().split("T")[0] : "", inspector: editTarget.inspector ?? "", result: editTarget.result as AcceptanceInput["result"], defectCount: editTarget.defectCount, amountCdtVnd: Number(editTarget.amountCdtVnd), amountInternalVnd: Number(editTarget.amountInternalVnd), acceptanceBatch: editTarget.acceptanceBatch ?? "" }}
            onSubmit={async (d) => { await updateAcceptance(editTarget.id, d); setEditTarget(null); startTransition(() => router.refresh()); }} />
        )}
      </CrudDialog>
    </div>
  );
}
