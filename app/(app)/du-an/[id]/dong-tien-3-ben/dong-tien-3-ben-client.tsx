"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import { adminEditable } from "@/lib/utils/admin-editable";
import { formatVND, formatDate } from "@/lib/utils/format";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { cashflowSchema, type CashflowInput } from "@/lib/du-an/schemas";
import { createCashflow, updateCashflow, softDeleteCashflow, adminPatchCashflow } from "@/lib/du-an/cashflow-service";

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

type CfRow = {
  id: number;
  projectId: number;
  date: Date;
  flowDirection: string;
  category: string;
  payerName: string;
  payeeName: string;
  amountVnd: unknown;
  batch: string | null;
  refDoc: string | null;
  note: string | null;
};

const FLOW_LABELS: Record<string, string> = {
  cdt_to_cty: "CĐT → Cty", cty_to_doi: "Cty → Đội", doi_to_cty: "Đội → Cty",
  cty_to_cdt: "Cty → CĐT", doi_refund: "Đội hoàn",
};
const CAT_LABELS: Record<string, string> = {
  tam_ung: "Tạm ứng", nop_lai: "Nộp lại", thanh_toan: "Thanh toán", hoan_ung: "Hoàn ứng",
};

interface CfGridRow extends RowWithId {
  date: string;
  flowDirection: string;
  category: string;
  payerName: string;
  payeeName: string;
  amountVnd: number;
  batch: string;
  refDoc: string;
}

interface Summary { cdtToCty: number; ctyToDoi: number; doiToCty: number; ctyToCdt: number; doiRefund: number; total: number; }
interface Props { projectId: number; initialData: CfRow[]; summary: Summary; role?: string; }

function CfForm({ projectId, defaultValues, onSubmit }: {
  projectId: number; defaultValues?: Partial<CashflowInput>; onSubmit: (d: CashflowInput) => Promise<void>;
}) {
  const form = useForm<CashflowInput>({
    resolver: zodResolver(cashflowSchema),
    defaultValues: { projectId, flowDirection: "cdt_to_cty", category: "tam_ung", ...defaultValues },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField control={form.control} name="date" render={({ field }) => (
          <FormItem><FormLabel>Ngày</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="flowDirection" render={({ field }) => (
            <FormItem><FormLabel>Chiều giao dịch</FormLabel><FormControl>
              <select {...field} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {Object.entries(FLOW_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem><FormLabel>Phân loại</FormLabel><FormControl>
              <select {...field} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {Object.entries(CAT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="payerName" render={({ field }) => (
            <FormItem><FormLabel>Bên thanh toán</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="payeeName" render={({ field }) => (
            <FormItem><FormLabel>Bên nhận</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="amountVnd" render={({ field }) => (
          <FormItem><FormLabel>Số tiền (VND)</FormLabel><FormControl>
            <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
          </FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="batch" render={({ field }) => (
            <FormItem><FormLabel>Đợt</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="refDoc" render={({ field }) => (
            <FormItem><FormLabel>Số chứng từ</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="flex justify-end pt-2"><Button type="submit">Lưu</Button></div>
      </form>
    </Form>
  );
}

export function DongTien3BenClient({ projectId, initialData, summary, role }: Props) {
  const isAdmin = role === "admin";
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CfRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const rowsById = new Map(initialData.map((r) => [r.id, r]));

  const rows: CfGridRow[] = initialData.map((r) => ({
    id: r.id,
    date: formatDate(r.date, ""),
    flowDirection: FLOW_LABELS[r.flowDirection] ?? r.flowDirection,
    category: CAT_LABELS[r.category] ?? r.category,
    payerName: r.payerName,
    payeeName: r.payeeName,
    amountVnd: Number(r.amountVnd),
    batch: r.batch ?? "",
    refDoc: r.refDoc ?? "",
  }));

  const columns: DataGridColumn<CfGridRow>[] = [
    { id: "date", title: "Ngày", kind: "text", width: 100, readonly: true },
    { id: "flowDirection", title: "Chiều GD", kind: "text", width: 120, readonly: true },
    { id: "category", title: "Phân loại", kind: "text", width: 110, readonly: true },
    { id: "payerName", title: "Bên TT", kind: "text", width: 140, readonly: adminEditable<CfGridRow>(true) },
    { id: "payeeName", title: "Bên nhận", kind: "text", width: 140, readonly: adminEditable<CfGridRow>(true) },
    { id: "amountVnd", title: "Số tiền", kind: "currency", width: 130, readonly: adminEditable<CfGridRow>(true) },
    { id: "batch", title: "Đợt", kind: "text", width: 80, readonly: adminEditable<CfGridRow>(true) },
    { id: "refDoc", title: "Chứng từ", kind: "text", width: 110, readonly: adminEditable<CfGridRow>(true) },
  ];

  const ADMIN_RAW_COLS = new Set<keyof CfGridRow>(["payerName", "payeeName", "amountVnd", "batch", "refDoc"]);

  const handlers: DataGridHandlers<CfGridRow> = {
    onCellEdit: async (id, col, value) => {
      if (!isAdmin || !ADMIN_RAW_COLS.has(col as keyof CfGridRow)) return;
      try {
        await adminPatchCashflow(id, { [col]: value } as never, projectId);
        startTransition(() => router.refresh());
      } catch (err) {
        toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
        startTransition(() => router.refresh());
      }
    },
    onDeleteRows: async (ids) => {
      for (const id of ids) {
        await softDeleteCashflow(id, projectId);
      }
      startTransition(() => router.refresh());
    },
  };

  const editSelected = () => {
    if (selectedIds.length !== 1) return;
    const target = rowsById.get(selectedIds[0]);
    if (target) setEditTarget(target);
  };

  async function handleCreate(data: CashflowInput) {
    await createCashflow(data);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(data: CashflowInput) {
    if (!editTarget) return;
    await updateCashflow(editTarget.id, data);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Dòng tiền 3 bên</h2>
          <p className="text-sm text-muted-foreground mt-0.5">CĐT · Công ty · Đội thi công</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={selectedIds.length !== 1} onClick={editSelected}>
            Sửa
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Thêm giao dịch
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-1.5">
          <p className="font-semibold text-sky-700 dark:text-sky-300">Chủ đầu tư (CĐT)</p>
          <p>Đã trả Cty: <strong className="tabular-nums">{formatVND(summary.cdtToCty)}</strong></p>
          <p>Cty hoàn CĐT: <strong className="tabular-nums">{formatVND(summary.ctyToCdt)}</strong></p>
          <p className="text-xs text-muted-foreground">
            Còn phải trả: <span className="tabular-nums">{formatVND(summary.cdtToCty - summary.ctyToCdt)}</span>
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-1.5">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">Công ty</p>
          <p>Nhận từ CĐT: <strong className="tabular-nums">{formatVND(summary.cdtToCty)}</strong></p>
          <p>Đã trả Đội: <strong className="tabular-nums">{formatVND(summary.ctyToDoi)}</strong></p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-1.5">
          <p className="font-semibold text-amber-700 dark:text-amber-300">Đội thi công</p>
          <p>Nhận từ Cty: <strong className="tabular-nums">{formatVND(summary.ctyToDoi)}</strong></p>
          <p>Hoàn lại Cty: <strong className="tabular-nums">{formatVND(summary.doiToCty + summary.doiRefund)}</strong></p>
        </div>
      </div>

      <DataGrid<CfGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        role={role}
        height={500}
        onSelectionChange={setSelectedIds}
      />

      <CrudDialog title="Thêm giao dịch dòng tiền" open={createOpen} onOpenChange={setCreateOpen}>
        <CfForm projectId={projectId} onSubmit={handleCreate} />
      </CrudDialog>
      <CrudDialog title="Sửa giao dịch dòng tiền" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <CfForm projectId={projectId}
            defaultValues={{
              projectId,
              date: new Date(editTarget.date).toISOString().split("T")[0],
              flowDirection: editTarget.flowDirection as CashflowInput["flowDirection"],
              category: editTarget.category as CashflowInput["category"],
              payerName: editTarget.payerName,
              payeeName: editTarget.payeeName,
              amountVnd: Number(editTarget.amountVnd),
              batch: editTarget.batch ?? "",
              refDoc: editTarget.refDoc ?? "",
            }}
            onSubmit={handleEdit} />
        )}
      </CrudDialog>
    </div>
  );
}
