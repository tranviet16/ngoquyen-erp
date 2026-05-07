"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ColDef } from "ag-grid-community";
import { AgGridBase, VND_COL_DEF } from "@/components/ag-grid-base";
import { formatVND, formatDate } from "@/lib/utils/format";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { cashflowSchema, type CashflowInput } from "@/lib/du-an/schemas";
import { createCashflow, updateCashflow, softDeleteCashflow } from "@/lib/du-an/cashflow-service";

type CfRow = {
  id: number; projectId: number; date: Date; flowDirection: string; category: string;
  payerName: string; payeeName: string; amountVnd: unknown; batch: string | null; refDoc: string | null; note: string | null;
};

const FLOW_LABELS: Record<string, string> = {
  cdt_to_cty: "CĐT → Cty", cty_to_doi: "Cty → Đội", doi_to_cty: "Đội → Cty",
  cty_to_cdt: "Cty → CĐT", doi_refund: "Đội hoàn",
};
const CAT_LABELS: Record<string, string> = {
  tam_ung: "Tạm ứng", nop_lai: "Nộp lại", thanh_toan: "Thanh toán", hoan_ung: "Hoàn ứng",
};

interface Summary { cdtToCty: number; ctyToDoi: number; doiToCty: number; ctyToCdt: number; doiRefund: number; total: number; }
interface Props { projectId: number; initialData: CfRow[]; summary: Summary; }

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
          <FormItem><FormLabel>Ngày</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
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

export function DongTien3BenClient({ projectId, initialData, summary }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CfRow | null>(null);
  const [, startTransition] = useTransition();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "date", headerName: "Ngày", valueFormatter: (p) => formatDate(p.value as Date | null, ""), width: 100 },
    { field: "flowDirection", headerName: "Chiều GD", valueFormatter: (p) => FLOW_LABELS[p.value as string] ?? "", width: 120 },
    { field: "category", headerName: "Phân loại", valueFormatter: (p) => CAT_LABELS[p.value as string] ?? "", width: 110 },
    { field: "payerName", headerName: "Bên TT", width: 140 },
    { field: "payeeName", headerName: "Bên nhận", width: 140 },
    { field: "amountVnd", headerName: "Số tiền", ...VND_COL_DEF, width: 130 },
    { field: "batch", headerName: "Đợt", width: 80 },
    { field: "refDoc", headerName: "Chứng từ", width: 110 },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headerName: "Thao tác", width: 120, cellRenderer: (p: { data: any }) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="outline" size="sm" onClick={() => setEditTarget(p.data)}>Sửa</Button>
          <DeleteConfirmDialog itemName={`${FLOW_LABELS[p.data.flowDirection]} ${formatVND(Number(p.data.amountVnd))}`}
            onConfirm={async () => { await softDeleteCashflow(p.data.id, projectId); startTransition(() => router.refresh()); }}
            trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>} />
        </div>
      ),
    },
  ];

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
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Thêm giao dịch
        </Button>
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

      <AgGridBase rowData={initialData} columnDefs={colDefs} height={500} />

      <CrudDialog title="Thêm giao dịch dòng tiền" open={createOpen} onOpenChange={setCreateOpen}>
        <CfForm projectId={projectId} onSubmit={handleCreate} />
      </CrudDialog>
      <CrudDialog title="Sửa giao dịch dòng tiền" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <CfForm projectId={projectId}
            defaultValues={{ projectId, date: new Date(editTarget.date).toISOString().split("T")[0], flowDirection: editTarget.flowDirection as CashflowInput["flowDirection"], category: editTarget.category as CashflowInput["category"], payerName: editTarget.payerName, payeeName: editTarget.payeeName, amountVnd: Number(editTarget.amountVnd), batch: editTarget.batch ?? "", refDoc: editTarget.refDoc ?? "" }}
            onSubmit={handleEdit} />
        )}
      </CrudDialog>
    </div>
  );
}
