"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { scheduleSchema, type ScheduleInput } from "@/lib/du-an/schemas";
import { createSchedule, updateSchedule, softDeleteSchedule, adminPatchSchedule } from "@/lib/du-an/schedule-service";
import { formatDate } from "@/lib/utils/format";
import { adminEditable } from "@/lib/utils/admin-editable";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  role?: string;
  height?: number | string;
  onSelectionChange?: (ids: number[]) => void;
}) => ReactElement;

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

interface ScheduleGridRow extends RowWithId {
  taskName: string;
  categoryLabel: string;
  planStart: string;
  planEnd: string;
  actualStart: string;
  actualEnd: string;
  pctComplete: number;
  status: string;
  note: string;
}

interface Props {
  projectId: number;
  initialData: ScheduleRow[];
  categories: CategoryOption[];
  role?: string;
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
            <FormItem><FormLabel>BĐ kế hoạch</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="planEnd" render={({ field }) => (
            <FormItem><FormLabel>KT kế hoạch</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="actualStart" render={({ field }) => (
            <FormItem><FormLabel>BĐ thực tế</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="actualEnd" render={({ field }) => (
            <FormItem><FormLabel>KT thực tế</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
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

export function TienDoClient({ projectId, initialData, categories, role }: Props) {
  const isAdmin = role === "admin";
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduleRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, `${c.code} - ${c.name}`]));
  const rowsById = new Map(initialData.map((r) => [r.id, r]));

  const rows: ScheduleGridRow[] = initialData.map((r) => ({
    id: r.id,
    taskName: r.taskName,
    categoryLabel: categoryMap[r.categoryId] ?? "",
    planStart: formatDate(r.planStart, ""),
    planEnd: formatDate(r.planEnd, ""),
    actualStart: formatDate(r.actualStart, ""),
    actualEnd: formatDate(r.actualEnd, ""),
    pctComplete: Number(r.pctComplete),
    status: r.status,
    note: r.note ?? "",
  }));

  const statusOptions: SelectOption[] = Object.entries(STATUS_LABELS).map(([v, l]) => ({ id: v, name: l }));

  const patchSchedule = async (id: number, patch: Partial<ScheduleGridRow>) => {
    const current = rowsById.get(id);
    if (!current) throw new Error(`#${id} không tồn tại`);
    let pct = typeof patch.pctComplete === "number" ? patch.pctComplete : Number(current.pctComplete);
    pct = Math.min(1, Math.max(0, pct));
    const input: ScheduleInput = {
      projectId,
      categoryId: current.categoryId,
      taskName: typeof patch.taskName === "string" ? patch.taskName : current.taskName,
      planStart: new Date(current.planStart).toISOString().split("T")[0],
      planEnd: new Date(current.planEnd).toISOString().split("T")[0],
      actualStart: current.actualStart ? new Date(current.actualStart).toISOString().split("T")[0] : undefined,
      actualEnd: current.actualEnd ? new Date(current.actualEnd).toISOString().split("T")[0] : undefined,
      pctComplete: pct,
      status: (typeof patch.status === "string" ? patch.status : current.status) as ScheduleInput["status"],
      note: typeof patch.note === "string" ? (patch.note || undefined) : (current.note ?? undefined),
    };
    await updateSchedule(id, input);
  };

  const columns: DataGridColumn<ScheduleGridRow>[] = [
    { id: "taskName", title: "Công việc", kind: "text", width: 240 },
    { id: "categoryLabel", title: "Hạng mục", kind: "text", width: 150, readonly: true },
    { id: "planStart", title: "BĐ KH", kind: "text", width: 110, readonly: adminEditable<ScheduleGridRow>(true) },
    { id: "planEnd", title: "KT KH", kind: "text", width: 110, readonly: adminEditable<ScheduleGridRow>(true) },
    { id: "actualStart", title: "BĐ TT", kind: "text", width: 110, readonly: adminEditable<ScheduleGridRow>(true) },
    { id: "actualEnd", title: "KT TT", kind: "text", width: 110, readonly: adminEditable<ScheduleGridRow>(true) },
    {
      id: "pctComplete", title: "% HT", kind: "number", width: 80,
      format: (v) => `${(Number(v) * 100).toFixed(0)}%`,
    },
    {
      id: "status", title: "Trạng thái", kind: "select", width: 140, options: statusOptions,
      format: (v) => STATUS_LABELS[String(v)] ?? String(v ?? ""),
    },
    { id: "note", title: "Ghi chú", kind: "text", width: 200 },
  ];

  const ADMIN_RAW_COLS = new Set<keyof ScheduleGridRow>(["planStart", "planEnd", "actualStart", "actualEnd"]);

  const handlers: DataGridHandlers<ScheduleGridRow> = {
    onCellEdit: async (id, col, value) => {
      try {
        if (isAdmin && ADMIN_RAW_COLS.has(col as keyof ScheduleGridRow)) {
          await adminPatchSchedule(id, { [col]: value === "" ? null : value } as never, projectId);
        } else {
          await patchSchedule(id, { [col]: value } as Partial<ScheduleGridRow>);
        }
        toast.success("Đã lưu");
        startTransition(() => router.refresh());
      } catch (err) {
        toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
        startTransition(() => router.refresh());
      }
    },
    onDeleteRows: async (ids) => {
      for (const id of ids) {
        await softDeleteSchedule(id, projectId);
      }
      startTransition(() => router.refresh());
    },
  };

  const editSelected = () => {
    if (selectedIds.length !== 1) return;
    const target = rowsById.get(selectedIds[0]);
    if (target) setEditTarget(target);
  };

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
        <div>
          <h2 className="text-lg font-semibold">Tiến độ thi công</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Theo dõi kế hoạch, thực tế và % hoàn thành theo từng công việc.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={selectedIds.length !== 1} onClick={editSelected}>
            Sửa đầy đủ
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Thêm công việc</Button>
        </div>
      </div>

      <DataGrid<ScheduleGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        role={role}
        height={500}
        onSelectionChange={setSelectedIds}
      />

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
