"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ColDef } from "ag-grid-community";
import { AgGridBase } from "@/components/ag-grid-base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { scheduleSchema, type ScheduleInput } from "@/lib/du-an/schemas";
import { createSchedule, updateSchedule, softDeleteSchedule } from "@/lib/du-an/schedule-service";

type ScheduleRow = {
  id: number;
  projectId: number;
  categoryId: number;
  taskName: string;
  planStart: Date;
  planEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  pctComplete: unknown;
  status: string;
  note: string | null;
};

type CategoryOption = { id: number; code: string; name: string };

const STATUS_LABELS: Record<string, string> = {
  pending: "Chưa bắt đầu",
  in_progress: "Đang thực hiện",
  done: "Hoàn thành",
  delayed: "Trễ hạn",
};

function fmt(d: Date | null) {
  return d ? new Date(d).toLocaleDateString("vi-VN") : "";
}

interface Props {
  projectId: number;
  initialData: ScheduleRow[];
  categories: CategoryOption[];
}

function ScheduleForm({ projectId, categories, defaultValues, onSubmit }: {
  projectId: number;
  categories: CategoryOption[];
  defaultValues?: Partial<ScheduleInput>;
  onSubmit: (d: ScheduleInput) => Promise<void>;
}) {
  const form = useForm<ScheduleInput>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { projectId, status: "pending", pctComplete: 0, categoryId: categories[0]?.id ?? 0, ...defaultValues },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField control={form.control} name="taskName" render={({ field }) => (
          <FormItem><FormLabel>Tên công việc</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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
          <FormField control={form.control} name="planStart" render={({ field }) => (
            <FormItem><FormLabel>BĐ kế hoạch</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="planEnd" render={({ field }) => (
            <FormItem><FormLabel>KT kế hoạch</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="actualStart" render={({ field }) => (
            <FormItem><FormLabel>BĐ thực tế</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="actualEnd" render={({ field }) => (
            <FormItem><FormLabel>KT thực tế</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="pctComplete" render={({ field }) => (
            <FormItem><FormLabel>% Hoàn thành (0–1)</FormLabel><FormControl>
              <Input type="number" step="0.01" min="0" max="1" {...field}
                onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
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

export function TienDoClient({ projectId, initialData, categories }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduleRow | null>(null);
  const [, startTransition] = useTransition();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, `${c.code} - ${c.name}`]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "taskName", headerName: "Công việc", flex: 2, minWidth: 200 },
    { field: "categoryId", headerName: "Hạng mục", valueFormatter: (p) => categoryMap[p.value as number] ?? String(p.value), width: 150 },
    { field: "planStart", headerName: "BĐ KH", valueFormatter: (p) => fmt(p.value as Date), width: 110 },
    { field: "planEnd", headerName: "KT KH", valueFormatter: (p) => fmt(p.value as Date), width: 110 },
    { field: "actualStart", headerName: "BĐ TT", valueFormatter: (p) => fmt(p.value as Date | null), width: 110 },
    { field: "actualEnd", headerName: "KT TT", valueFormatter: (p) => fmt(p.value as Date | null), width: 110 },
    { field: "pctComplete", headerName: "% HT", valueFormatter: (p) => `${(Number(p.value) * 100).toFixed(0)}%`, width: 80 },
    { field: "status", headerName: "Trạng thái", valueFormatter: (p) => STATUS_LABELS[p.value as string] ?? String(p.value), width: 140 },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headerName: "Thao tác", width: 120, cellRenderer: (p: { data: any }) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="outline" size="sm" onClick={() => setEditTarget(p.data)}>Sửa</Button>
          <DeleteConfirmDialog
            itemName={p.data.taskName}
            onConfirm={async () => { await softDeleteSchedule(p.data.id, projectId); startTransition(() => router.refresh()); }}
            trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>}
          />
        </div>
      ),
    },
  ];

  async function handleCreate(data: ScheduleInput) {
    await createSchedule(data);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(data: ScheduleInput) {
    if (!editTarget) return;
    await updateSchedule(editTarget.id, data);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tiến Độ Thi Công</h2>
        <Button onClick={() => setCreateOpen(true)}>Thêm công việc</Button>
      </div>

      <AgGridBase rowData={initialData} columnDefs={colDefs} height={500} />

      <CrudDialog title="Thêm công việc" open={createOpen} onOpenChange={setCreateOpen}>
        <ScheduleForm projectId={projectId} categories={categories} onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog title="Sửa công việc" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <ScheduleForm
            projectId={projectId}
            categories={categories}
            defaultValues={{
              projectId,
              categoryId: editTarget.categoryId,
              taskName: editTarget.taskName,
              planStart: new Date(editTarget.planStart).toISOString().split("T")[0],
              planEnd: new Date(editTarget.planEnd).toISOString().split("T")[0],
              actualStart: editTarget.actualStart ? new Date(editTarget.actualStart).toISOString().split("T")[0] : "",
              actualEnd: editTarget.actualEnd ? new Date(editTarget.actualEnd).toISOString().split("T")[0] : "",
              pctComplete: Number(editTarget.pctComplete),
              status: editTarget.status as ScheduleInput["status"],
            }}
            onSubmit={handleEdit}
          />
        )}
      </CrudDialog>
    </div>
  );
}
