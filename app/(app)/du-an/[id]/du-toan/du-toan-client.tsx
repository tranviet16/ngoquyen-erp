"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type ColDef, type CellValueChangedEvent } from "ag-grid-community";
import { AgGridBase, VND_COL_DEF, NUMBER_COL_DEF, vndFormatter } from "@/components/ag-grid-base";
import { Button } from "@/components/ui/button";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { type EstimateInput } from "@/lib/du-an/schemas";
import { createEstimate, updateEstimate, softDeleteEstimate } from "@/lib/du-an/estimate-service";
import { EstimateForm } from "./du-toan-form";

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

interface Props {
  projectId: number;
  initialData: EstimateRow[];
  categories: CategoryOption[];
}

export function DuToanClient({ projectId, initialData, categories }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EstimateRow | null>(null);
  const [, startTransition] = useTransition();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, `${c.code} - ${c.name}`]));
  const grandTotal = initialData.reduce((sum, r) => sum + Number(r.totalVnd), 0);

  /**
   * Inline cell edit handler — called by AG Grid when user commits a cell edit.
   * Editable columns: itemName, qty, unitPrice (text/numeric, not FK or computed).
   * Dialog form remains the fallback for "Add new" and full row editing.
   */
  async function handleCellValueChanged(event: CellValueChangedEvent<EstimateRow>) {
    const row = event.data;
    try {
      const input: EstimateInput = {
        projectId,
        categoryId: row.categoryId,
        itemCode: row.itemCode,
        itemName: row.itemName,
        unit: row.unit,
        qty: Number(row.qty),
        unitPrice: Number(row.unitPrice),
        note: row.note ?? undefined,
      };
      await updateEstimate(row.id, input);
      toast.success("Đã lưu");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
      // Revert optimistic edit by refreshing
      startTransition(() => router.refresh());
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "itemCode", headerName: "Mã hàng", width: 110 },
    { field: "itemName", headerName: "Tên vật tư/công việc", flex: 2, minWidth: 200, editable: true },
    { field: "categoryId", headerName: "Hạng mục", valueFormatter: (p) => categoryMap[p.value as number] ?? "", width: 150 },
    { field: "unit", headerName: "ĐVT", width: 70 },
    { field: "qty", headerName: "SL", ...NUMBER_COL_DEF, width: 100, editable: true },
    { field: "unitPrice", headerName: "Đơn giá", ...VND_COL_DEF, width: 130, editable: true },
    { field: "totalVnd", headerName: "Thành tiền", ...VND_COL_DEF, width: 140 },
    {
      headerName: "Thao tác", width: 120,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cellRenderer: (p: { data: any }) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="outline" size="sm" onClick={() => setEditTarget(p.data)}>Sửa</Button>
          <DeleteConfirmDialog
            itemName={p.data.itemName}
            onConfirm={async () => { await softDeleteEstimate(p.data.id, projectId); startTransition(() => router.refresh()); }}
            trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>}
          />
        </div>
      ),
    },
  ];

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
          <p className="text-sm text-muted-foreground">Tổng: <strong>{vndFormatter(grandTotal)}</strong></p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Thêm hạng mục</Button>
      </div>

      {/* Editable columns: itemName, qty, unitPrice. Double-click to edit inline. */}
      <AgGridBase
        rowData={initialData}
        columnDefs={colDefs}
        height={500}
        gridOptions={{ onCellValueChanged: handleCellValueChanged }}
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
