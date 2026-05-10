"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { type EstimateInput } from "@/lib/du-an/schemas";
import { createEstimate, updateEstimate, softDeleteEstimate, adminPatchEstimate } from "@/lib/du-an/estimate-service";
import { vndFormatter } from "@/lib/format";
import { adminEditable } from "@/lib/utils/admin-editable";
import { EstimateForm } from "./du-toan-form";

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

type EstimateRow = {
  id: number;
  projectId: number;
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: unknown;
  unitPrice: unknown;
  totalVnd: unknown;
  note: string | null;
};

type CategoryOption = { id: number; code: string; name: string };

interface EstimateGridRow extends RowWithId {
  itemCode: string;
  itemName: string;
  categoryId: number;
  unit: string;
  qty: number;
  unitPrice: number;
  totalVnd: number;
}

interface Props {
  projectId: number;
  initialData: EstimateRow[];
  categories: CategoryOption[];
  role?: string;
}

export function DuToanClient({ projectId, initialData, categories, role }: Props) {
  const isAdmin = role === "admin";
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EstimateRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const categoryOptions: SelectOption[] = categories.map((c) => ({
    id: c.id,
    name: `${c.code} - ${c.name}`,
  }));

  const grandTotal = initialData.reduce((sum, r) => sum + Number(r.totalVnd), 0);

  const rowsById = new Map(initialData.map((r) => [r.id, r]));

  const rows: EstimateGridRow[] = initialData.map((r) => ({
    id: r.id,
    itemCode: r.itemCode,
    itemName: r.itemName,
    categoryId: r.categoryId,
    unit: r.unit,
    qty: Number(r.qty),
    unitPrice: Number(r.unitPrice),
    totalVnd: Number(r.totalVnd),
  }));

  const columns: DataGridColumn<EstimateGridRow>[] = [
    { id: "itemCode", title: "Mã hàng", kind: "text", width: 110, readonly: true },
    { id: "itemName", title: "Tên vật tư/công việc", kind: "text", width: 280 },
    { id: "categoryId", title: "Hạng mục", kind: "select", width: 180, options: categoryOptions, readonly: true },
    { id: "unit", title: "ĐVT", kind: "text", width: 70, readonly: adminEditable<EstimateGridRow>(true) },
    { id: "qty", title: "SL", kind: "number", width: 100 },
    { id: "unitPrice", title: "Đơn giá", kind: "currency", width: 130 },
    { id: "totalVnd", title: "Thành tiền", kind: "currency", width: 140, readonly: adminEditable<EstimateGridRow>(true) },
  ];

  const patchEstimate = async (id: number, patch: Partial<EstimateGridRow>) => {
    const current = rowsById.get(id);
    if (!current) throw new Error(`Hạng mục #${id} không tồn tại`);
    const merged: EstimateInput = {
      projectId,
      categoryId: current.categoryId,
      itemCode: current.itemCode,
      itemName: typeof patch.itemName === "string" ? patch.itemName : current.itemName,
      unit: current.unit,
      qty: typeof patch.qty === "number" ? patch.qty : Number(current.qty),
      unitPrice: typeof patch.unitPrice === "number" ? patch.unitPrice : Number(current.unitPrice),
      note: current.note ?? undefined,
    };
    await updateEstimate(id, merged);
  };

  const ADMIN_RAW_COLS = new Set<keyof EstimateGridRow>(["unit", "totalVnd"]);

  const handlers: DataGridHandlers<EstimateGridRow> = {
    onCellEdit: async (id, col, value) => {
      try {
        if (isAdmin && ADMIN_RAW_COLS.has(col as keyof EstimateGridRow)) {
          await adminPatchEstimate(id, { [col]: value } as never, projectId);
        } else {
          await patchEstimate(id, { [col]: value } as Partial<EstimateGridRow>);
        }
        startTransition(() => router.refresh());
      } catch (err) {
        toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
        startTransition(() => router.refresh());
      }
    },
    onDeleteRows: async (ids) => {
      for (const id of ids) {
        await softDeleteEstimate(id, projectId);
      }
      startTransition(() => router.refresh());
    },
  };

  const editSelected = () => {
    if (selectedIds.length !== 1) return;
    const target = rowsById.get(selectedIds[0]);
    if (target) setEditTarget(target);
  };

  async function handleCreate(data: EstimateInput) {
    await createEstimate(data);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(data: EstimateInput) {
    if (!editTarget) return;
    await updateEstimate(editTarget.id, data);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dự Toán Gốc</h2>
          <p className="text-sm text-muted-foreground">
            Tổng: <strong>{vndFormatter(grandTotal)}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={selectedIds.length !== 1} onClick={editSelected}>
            Sửa đầy đủ
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Thêm hạng mục</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Chỉnh sửa nhanh: nhấp đúp vào ô <strong>Tên</strong>, <strong>SL</strong>, <strong>Đơn giá</strong>. Đổi <strong>Hạng mục</strong> hoặc <strong>Mã hàng</strong> qua nút &quot;Sửa đầy đủ&quot;.
      </p>

      <DataGrid<EstimateGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        role={role}
        height={520}
        onSelectionChange={setSelectedIds}
      />

      <CrudDialog title="Thêm hạng mục dự toán" open={createOpen} onOpenChange={setCreateOpen}>
        <EstimateForm projectId={projectId} categories={categories} onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog title="Sửa hạng mục dự toán" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <EstimateForm
            projectId={projectId}
            categories={categories}
            defaultValues={{
              projectId,
              categoryId: editTarget.categoryId,
              itemCode: editTarget.itemCode,
              itemName: editTarget.itemName,
              unit: editTarget.unit,
              qty: Number(editTarget.qty),
              unitPrice: Number(editTarget.unitPrice),
            }}
            onSubmit={handleEdit}
          />
        )}
      </CrudDialog>
    </div>
  );
}
