"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { formatVND, formatDate } from "@/lib/utils/format";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { acceptanceSchema, type AcceptanceInput } from "@/lib/du-an/schemas";
import { createAcceptance, updateAcceptance, softDeleteAcceptance, adminPatchAcceptance } from "@/lib/du-an/acceptance-service";
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

type AcceptanceRow = {
  id: number; projectId: number; categoryId: number; checkItem: string;
  planEnd: Date | null; actualEnd: Date | null; inspector: string | null;
  result: string | null; defectCount: number; acceptedAt: Date | null;
  amountCdtVnd: unknown; amountInternalVnd: unknown; acceptanceBatch: string | null; note: string | null;
};
type CategoryOption = { id: number; code: string; name: string };

const RESULT_LABELS: Record<string, string> = { pass: "Đạt", fail: "Không đạt", partial: "Đạt một phần" };

interface AcceptanceGridRow extends RowWithId {
  checkItem: string;
  categoryLabel: string;
  acceptanceBatch: string;
  planEnd: string;
  actualEnd: string;
  inspector: string;
  result: string;
  defectCount: number;
  amountCdtVnd: number;
  amountInternalVnd: number;
  note: string;
}

interface Props {
  projectId: number;
  initialData: AcceptanceRow[];
  categories: CategoryOption[];
  role?: string;
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
            <FormItem><FormLabel>Ngày KH</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="actualEnd" render={({ field }) => (
            <FormItem><FormLabel>Ngày thực tế</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
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

export function NghiemThuClient({ projectId, initialData, categories, role }: Props) {
  const isAdmin = role === "admin";
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AcceptanceRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, `${c.code} - ${c.name}`]));
  const totalCdt = initialData.reduce((s, r) => s + Number(r.amountCdtVnd), 0);
  const totalInternal = initialData.reduce((s, r) => s + Number(r.amountInternalVnd), 0);
  const rowsById = new Map(initialData.map((r) => [r.id, r]));

  const rows: AcceptanceGridRow[] = initialData.map((r) => ({
    id: r.id,
    checkItem: r.checkItem,
    categoryLabel: categoryMap[r.categoryId] ?? "",
    acceptanceBatch: r.acceptanceBatch ?? "",
    planEnd: formatDate(r.planEnd, ""),
    actualEnd: formatDate(r.actualEnd, ""),
    inspector: r.inspector ?? "",
    result: r.result ?? "",
    defectCount: r.defectCount,
    amountCdtVnd: Number(r.amountCdtVnd),
    amountInternalVnd: Number(r.amountInternalVnd),
    note: r.note ?? "",
  }));

  const resultOptions: SelectOption[] = [
    { id: "", name: "—" },
    ...Object.entries(RESULT_LABELS).map(([v, l]) => ({ id: v, name: l })),
  ];

  const patchAcceptance = async (id: number, patch: Partial<AcceptanceGridRow>) => {
    const current = rowsById.get(id);
    if (!current) throw new Error(`#${id} không tồn tại`);
    const input: AcceptanceInput = {
      projectId,
      categoryId: current.categoryId,
      checkItem: typeof patch.checkItem === "string" ? patch.checkItem : current.checkItem,
      planEnd: current.planEnd ? new Date(current.planEnd).toISOString().split("T")[0] : undefined,
      actualEnd: current.actualEnd ? new Date(current.actualEnd).toISOString().split("T")[0] : undefined,
      inspector: typeof patch.inspector === "string" ? (patch.inspector || undefined) : (current.inspector ?? undefined),
      result: (typeof patch.result === "string" ? (patch.result || undefined) : (current.result || undefined)) as AcceptanceInput["result"],
      defectCount: typeof patch.defectCount === "number" ? patch.defectCount : current.defectCount,
      amountCdtVnd: typeof patch.amountCdtVnd === "number" ? patch.amountCdtVnd : Number(current.amountCdtVnd),
      amountInternalVnd: typeof patch.amountInternalVnd === "number" ? patch.amountInternalVnd : Number(current.amountInternalVnd),
      acceptanceBatch: typeof patch.acceptanceBatch === "string" ? (patch.acceptanceBatch || undefined) : (current.acceptanceBatch ?? undefined),
      note: typeof patch.note === "string" ? (patch.note || undefined) : (current.note ?? undefined),
    };
    await updateAcceptance(id, input);
  };

  const columns: DataGridColumn<AcceptanceGridRow>[] = [
    { id: "checkItem", title: "Hạng mục kiểm tra", kind: "text", width: 220 },
    { id: "categoryLabel", title: "Hạng mục", kind: "text", width: 140, readonly: true },
    { id: "acceptanceBatch", title: "Đợt NT", kind: "text", width: 90 },
    { id: "planEnd", title: "Ngày KH", kind: "text", width: 110, readonly: adminEditable<AcceptanceGridRow>(true) },
    { id: "actualEnd", title: "Ngày TT", kind: "text", width: 110, readonly: adminEditable<AcceptanceGridRow>(true) },
    { id: "inspector", title: "Người KT", kind: "text", width: 120 },
    {
      id: "result", title: "Kết quả", kind: "select", width: 110, options: resultOptions,
      format: (v) => RESULT_LABELS[String(v)] ?? "",
    },
    { id: "defectCount", title: "Lỗi", kind: "number", width: 70 },
    { id: "amountCdtVnd", title: "SL NT CĐT", kind: "currency", width: 130 },
    { id: "amountInternalVnd", title: "SL NT nội bộ", kind: "currency", width: 130 },
    { id: "note", title: "Ghi chú", kind: "text", width: 200 },
  ];

  const ADMIN_RAW_COLS = new Set<keyof AcceptanceGridRow>(["planEnd", "actualEnd"]);

  const handlers: DataGridHandlers<AcceptanceGridRow> = {
    onCellEdit: async (id, col, value) => {
      try {
        if (isAdmin && ADMIN_RAW_COLS.has(col as keyof AcceptanceGridRow)) {
          await adminPatchAcceptance(id, { [col]: value === "" ? null : value } as never, projectId);
        } else {
          await patchAcceptance(id, { [col]: value } as Partial<AcceptanceGridRow>);
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
        await softDeleteAcceptance(id, projectId);
      }
      startTransition(() => router.refresh());
    },
  };

  const editSelected = () => {
    if (selectedIds.length !== 1) return;
    const target = rowsById.get(selectedIds[0]);
    if (target) setEditTarget(target);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Nghiệm thu</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            CĐT: <strong className="tabular-nums">{formatVND(totalCdt)}</strong> · Nội bộ:{" "}
            <strong className="tabular-nums">{formatVND(totalInternal)}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={selectedIds.length !== 1} onClick={editSelected}>
            Sửa đầy đủ
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Thêm nghiệm thu
          </Button>
        </div>
      </div>

      <DataGrid<AcceptanceGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        role={role}
        height={500}
        onSelectionChange={setSelectedIds}
      />

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
