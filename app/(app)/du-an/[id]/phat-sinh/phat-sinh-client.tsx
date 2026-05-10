"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { changeOrderSchema, type ChangeOrderInput } from "@/lib/du-an/schemas";
import { createChangeOrder, updateChangeOrder, softDeleteChangeOrder, adminPatchChangeOrder } from "@/lib/du-an/change-order-service";
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

type CoRow = {
  id: number; projectId: number; date: Date; coCode: string; description: string;
  reason: string | null; categoryId: number | null; itemCode: string | null;
  costImpactVnd: unknown; scheduleImpactDays: number; approvedBy: string | null;
  status: string; newItemName: string | null; note: string | null;
};
type CategoryOption = { id: number; code: string; name: string };
const STATUS_LABELS: Record<string, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" };

interface CoGridRow extends RowWithId {
  date: string;
  coCode: string;
  description: string;
  category: string;
  costImpactVnd: number;
  scheduleImpactDays: number;
  approvedBy: string;
  status: string;
}

interface Props { projectId: number; initialData: CoRow[]; categories: CategoryOption[]; role?: string; }

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
            <FormItem><FormLabel>Ngày</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
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

export function PhatSinhClient({ projectId, initialData, categories, role }: Props) {
  const isAdmin = role === "admin";
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CoRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, `${c.code} - ${c.name}`]));
  const rowsById = new Map(initialData.map((r) => [r.id, r]));

  const rows: CoGridRow[] = initialData.map((r) => ({
    id: r.id,
    date: formatDate(r.date, ""),
    coCode: r.coCode,
    description: r.description,
    category: r.categoryId ? (categoryMap[r.categoryId] ?? "") : "PS mới",
    costImpactVnd: Number(r.costImpactVnd),
    scheduleImpactDays: r.scheduleImpactDays,
    approvedBy: r.approvedBy ?? "",
    status: STATUS_LABELS[r.status] ?? r.status,
  }));

  const columns: DataGridColumn<CoGridRow>[] = [
    { id: "date", title: "Ngày", kind: "text", width: 100, readonly: true },
    { id: "coCode", title: "Mã CO", kind: "text", width: 100, readonly: true },
    { id: "description", title: "Mô tả", kind: "text", width: 280, readonly: adminEditable<CoGridRow>(true) },
    { id: "category", title: "Hạng mục", kind: "text", width: 140, readonly: true },
    { id: "costImpactVnd", title: "Tác động chi phí", kind: "currency", width: 150, readonly: adminEditable<CoGridRow>(true) },
    { id: "scheduleImpactDays", title: "TĐ tiến độ (ngày)", kind: "number", width: 130, readonly: adminEditable<CoGridRow>(true) },
    { id: "approvedBy", title: "Người duyệt", kind: "text", width: 130, readonly: adminEditable<CoGridRow>(true) },
    { id: "status", title: "TT", kind: "text", width: 110, readonly: true },
  ];

  const ADMIN_RAW_COLS = new Set<keyof CoGridRow>(["description", "costImpactVnd", "scheduleImpactDays", "approvedBy"]);

  const handlers: DataGridHandlers<CoGridRow> = {
    onCellEdit: async (id, col, value) => {
      if (!isAdmin || !ADMIN_RAW_COLS.has(col as keyof CoGridRow)) return;
      try {
        await adminPatchChangeOrder(id, { [col]: value } as never, projectId);
        startTransition(() => router.refresh());
      } catch (err) {
        toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
        startTransition(() => router.refresh());
      }
    },
    onDeleteRows: async (ids) => {
      for (const id of ids) {
        await softDeleteChangeOrder(id, projectId);
      }
      startTransition(() => router.refresh());
    },
  };

  const editSelected = () => {
    if (selectedIds.length !== 1) return;
    const target = rowsById.get(selectedIds[0]);
    if (target) setEditTarget(target);
  };

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
        <div>
          <h2 className="text-lg font-semibold">Phát sinh / Change Order (CO)</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Theo dõi tác động chi phí và tiến độ của các phát sinh.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={selectedIds.length !== 1} onClick={editSelected}>
            Sửa
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Thêm CO</Button>
        </div>
      </div>

      <DataGrid<CoGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        role={role}
        height={500}
        onSelectionChange={setSelectedIds}
      />

      <CrudDialog title="Thêm phát sinh" open={createOpen} onOpenChange={setCreateOpen}>
        <CoForm projectId={projectId} categories={categories} onSubmit={handleCreate} />
      </CrudDialog>
      <CrudDialog title="Sửa phát sinh" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <CoForm projectId={projectId} categories={categories}
            defaultValues={{
              projectId,
              date: new Date(editTarget.date).toISOString().split("T")[0],
              coCode: editTarget.coCode,
              description: editTarget.description,
              reason: editTarget.reason ?? "",
              categoryId: editTarget.categoryId ?? undefined,
              itemCode: editTarget.itemCode ?? "",
              costImpactVnd: Number(editTarget.costImpactVnd),
              scheduleImpactDays: editTarget.scheduleImpactDays,
              approvedBy: editTarget.approvedBy ?? "",
              status: editTarget.status as ChangeOrderInput["status"],
              newItemName: editTarget.newItemName ?? "",
            }}
            onSubmit={handleEdit} />
        )}
      </CrudDialog>
    </div>
  );
}
