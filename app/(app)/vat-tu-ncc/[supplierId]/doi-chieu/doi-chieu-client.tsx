"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import {
  createReconciliation,
  updateReconciliation,
  softDeleteReconciliation,
} from "@/lib/vat-tu-ncc/reconciliation-service";
import { type ReconciliationInput } from "@/lib/vat-tu-ncc/schemas";
import { ReconciliationForm } from "@/components/vat-tu-ncc/reconciliation-form";
import { formatDate } from "@/lib/utils/format";
import { Plus } from "lucide-react";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  onSelectionChange?: (ids: number[]) => void;
}) => ReactElement;

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

interface ReconGridRow extends RowWithId {
  period: string;
  openingBalance: number;
  totalIn: number;
  totalPaid: number;
  closingBalance: number;
  signedBySupplier: boolean;
  note: string;
}

interface Props {
  supplierId: number;
  initialData: ReconciliationRow[];
}

export function DoiChieuClient({ supplierId, initialData }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ReconciliationRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const fmtPeriod = (r: ReconciliationRow) =>
    `${formatDate(r.periodFrom, "")} – ${formatDate(r.periodTo, "")}`;

  const rows: ReconGridRow[] = initialData.map((r) => ({
    id: r.id,
    period: fmtPeriod(r),
    openingBalance: Number(r.openingBalance),
    totalIn: Number(r.totalIn),
    totalPaid: Number(r.totalPaid),
    closingBalance: Number(r.closingBalance),
    signedBySupplier: r.signedBySupplier,
    note: r.note ?? "",
  }));

  const columns: DataGridColumn<ReconGridRow>[] = [
    { id: "period", title: "Kỳ đối chiếu", kind: "text", width: 220, readonly: true },
    { id: "openingBalance", title: "Dư đầu kỳ", kind: "currency", width: 140, readonly: true },
    { id: "totalIn", title: "Phát sinh", kind: "currency", width: 130, readonly: true },
    { id: "totalPaid", title: "Thanh toán", kind: "currency", width: 130, readonly: true },
    { id: "closingBalance", title: "Dư cuối kỳ", kind: "currency", width: 140, readonly: true },
    { id: "signedBySupplier", title: "NCC ký", kind: "boolean", width: 90 },
    { id: "note", title: "Ghi chú", kind: "text", width: 220 },
  ];

  const patchRecon = async (id: number, patch: Partial<ReconGridRow>) => {
    const current = initialData.find((r) => r.id === id);
    if (!current) throw new Error(`#${id} không tồn tại`);
    const input: ReconciliationInput = {
      supplierId,
      periodFrom: new Date(current.periodFrom).toISOString().split("T")[0],
      periodTo: new Date(current.periodTo).toISOString().split("T")[0],
      openingBalance: Number(current.openingBalance),
      totalIn: Number(current.totalIn),
      totalPaid: Number(current.totalPaid),
      signedBySupplier:
        typeof patch.signedBySupplier === "boolean" ? patch.signedBySupplier : current.signedBySupplier,
      signedDate: current.signedDate ? new Date(current.signedDate).toISOString().split("T")[0] : undefined,
      note: typeof patch.note === "string" ? (patch.note || undefined) : (current.note ?? undefined),
    };
    await updateReconciliation(id, input);
  };

  const handlers: DataGridHandlers<ReconGridRow> = {
    onCellEdit: async (id, col, value) => {
      try {
        await patchRecon(id, { [col]: value } as Partial<ReconGridRow>);
        toast.success("Đã lưu");
        startTransition(() => router.refresh());
      } catch (err) {
        toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
        startTransition(() => router.refresh());
      }
    },
    onDeleteRows: async (ids) => {
      for (const id of ids) {
        await softDeleteReconciliation(id, supplierId);
      }
      startTransition(() => router.refresh());
    },
  };

  const editSelected = () => {
    if (selectedIds.length !== 1) return;
    const target = initialData.find((r) => r.id === selectedIds[0]);
    if (target) setEditTarget(target);
  };

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Đối chiếu công nợ</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Lập biên bản đối chiếu công nợ định kỳ với nhà cung cấp.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={selectedIds.length !== 1} onClick={editSelected}>
            Sửa
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Tạo kỳ đối chiếu
          </Button>
        </div>
      </div>

      <DataGrid<ReconGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        height={420}
        onSelectionChange={setSelectedIds}
      />

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
