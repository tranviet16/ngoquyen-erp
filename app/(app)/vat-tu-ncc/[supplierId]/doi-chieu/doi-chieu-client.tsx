"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type ColDef } from "ag-grid-community";
import { AgGridBase, VND_COL_DEF } from "@/components/ag-grid-base";
import { Button } from "@/components/ui/button";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { createReconciliation, updateReconciliation, softDeleteReconciliation } from "@/lib/vat-tu-ncc/reconciliation-service";
import { type ReconciliationInput } from "@/lib/vat-tu-ncc/schemas";
import { ReconciliationForm } from "@/components/vat-tu-ncc/reconciliation-form";

type ReconciliationRow = {
  id: number;
  supplierId: number;
  periodFrom: Date;
  periodTo: Date;
  openingBalance: unknown;
  totalIn: unknown;
  totalPaid: unknown;
  closingBalance: unknown;
  signedBySupplier: boolean;
  signedDate: Date | null;
  note: string | null;
};

interface Props {
  supplierId: number;
  initialData: ReconciliationRow[];
}

export function DoiChieuClient({ supplierId, initialData }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReconciliationRow | null>(null);
  const [, startTransition] = useTransition();

  const fmtDate = (d: Date) => new Date(d).toLocaleDateString("vi-VN");
  const fmtPeriod = (r: ReconciliationRow) =>
    `${fmtDate(r.periodFrom)} – ${fmtDate(r.periodTo)}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { headerName: "Kỳ đối chiếu", flex: 2, minWidth: 200, valueGetter: (p) => fmtPeriod(p.data) },
    { field: "openingBalance", headerName: "Dư đầu kỳ", ...VND_COL_DEF, width: 140 },
    { field: "totalIn", headerName: "Phát sinh", ...VND_COL_DEF, width: 130 },
    { field: "totalPaid", headerName: "Thanh toán", ...VND_COL_DEF, width: 130 },
    { field: "closingBalance", headerName: "Dư cuối kỳ", ...VND_COL_DEF, width: 140 },
    {
      field: "signedBySupplier", headerName: "NCC ký", width: 90,
      valueFormatter: (p) => p.value ? "Đã ký" : "Chưa ký",
    },
    { field: "note", headerName: "Ghi chú", flex: 1, minWidth: 100 },
    {
      headerName: "Thao tác", width: 150,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cellRenderer: (p: { data: any }) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="outline" size="sm" onClick={() => setEditTarget(p.data)}>Sửa</Button>
          <DeleteConfirmDialog
            itemName={fmtPeriod(p.data)}
            onConfirm={async () => { await softDeleteReconciliation(p.data.id, supplierId); startTransition(() => router.refresh()); }}
            trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>}
          />
        </div>
      ),
    },
  ];

  async function handleCreate(data: ReconciliationInput) {
    try {
      await createReconciliation(data);
      toast.success("Đã tạo kỳ đối chiếu");
      setCreateOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleEdit(data: ReconciliationInput) {
    if (!editTarget) return;
    try {
      await updateReconciliation(editTarget.id, data);
      toast.success("Đã cập nhật");
      setEditTarget(null);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  const editDefaults: Partial<ReconciliationInput> | undefined = editTarget ? {
    supplierId,
    periodFrom: new Date(editTarget.periodFrom).toISOString().split("T")[0],
    periodTo: new Date(editTarget.periodTo).toISOString().split("T")[0],
    openingBalance: Number(editTarget.openingBalance),
    totalIn: Number(editTarget.totalIn),
    totalPaid: Number(editTarget.totalPaid),
    signedBySupplier: editTarget.signedBySupplier,
    signedDate: editTarget.signedDate ? new Date(editTarget.signedDate).toISOString().split("T")[0] : undefined,
    note: editTarget.note ?? undefined,
  } : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Đối chiếu công nợ</h2>
        <Button onClick={() => setCreateOpen(true)}>Tạo kỳ đối chiếu</Button>
      </div>

      <AgGridBase rowData={initialData} columnDefs={colDefs} height={400} />

      <CrudDialog title="Tạo kỳ đối chiếu" open={createOpen} onOpenChange={setCreateOpen}>
        <ReconciliationForm supplierId={supplierId} onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog title="Sửa kỳ đối chiếu" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <ReconciliationForm supplierId={supplierId} defaultValues={editDefaults} onSubmit={handleEdit} />
        )}
      </CrudDialog>
    </div>
  );
}
