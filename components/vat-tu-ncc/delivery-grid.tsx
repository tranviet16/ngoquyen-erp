"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type ColDef, type CellValueChangedEvent } from "ag-grid-community";
import { AgGridBase, NUMBER_COL_DEF } from "@/components/ag-grid-base";
import { Button } from "@/components/ui/button";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { createDelivery, updateDelivery, softDeleteDelivery } from "@/lib/vat-tu-ncc/delivery-service";
import { type DeliveryInput } from "@/lib/vat-tu-ncc/schemas";
import { DeliveryForm } from "./delivery-form";

type DeliveryRow = {
  id: number;
  supplierId: number;
  projectId: number | null;
  date: Date;
  itemId: number;
  qty: unknown;
  unit: string;
  cbVatTu: string | null;
  chiHuyCt: string | null;
  keToan: string | null;
  note: string | null;
};

type ItemOption = { id: number; code: string; name: string; unit: string };
type ProjectOption = { id: number; code: string; name: string };

interface Props {
  supplierId: number;
  initialData: DeliveryRow[];
  items: ItemOption[];
  projects: ProjectOption[];
}

export function DeliveryGrid({ supplierId, initialData, items, projects }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DeliveryRow | null>(null);
  const [, startTransition] = useTransition();

  const itemMap = Object.fromEntries(items.map((i) => [i.id, `${i.code} - ${i.name}`]));
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.code]));

  async function handleCellValueChanged(event: CellValueChangedEvent<DeliveryRow>) {
    const row = event.data;
    try {
      const input: DeliveryInput = {
        supplierId,
        projectId: row.projectId ?? undefined,
        date: new Date(row.date).toISOString().split("T")[0],
        itemId: row.itemId,
        qty: Number(row.qty),
        unit: row.unit,
        cbVatTu: row.cbVatTu ?? undefined,
        chiHuyCt: row.chiHuyCt ?? undefined,
        keToan: row.keToan ?? undefined,
        note: row.note ?? undefined,
      };
      await updateDelivery(row.id, input);
      toast.success("Đã lưu");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
      startTransition(() => router.refresh());
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "date", headerName: "Ngày", width: 110, valueFormatter: (p) => p.value ? new Date(p.value).toLocaleDateString("vi-VN") : "" },
    { field: "itemId", headerName: "Vật tư", flex: 2, minWidth: 180, valueFormatter: (p) => itemMap[p.value as number] ?? p.value },
    { field: "qty", headerName: "SL", ...NUMBER_COL_DEF, width: 100, editable: true },
    { field: "unit", headerName: "ĐVT", width: 80 },
    { field: "projectId", headerName: "Dự án", width: 100, valueFormatter: (p) => p.value ? (projectMap[p.value as number] ?? p.value) : "" },
    { field: "cbVatTu", headerName: "Cán bộ VT", width: 140, editable: true },
    { field: "chiHuyCt", headerName: "Chỉ huy CT", width: 140, editable: true },
    { field: "keToan", headerName: "Kế toán", width: 120, editable: true },
    { field: "note", headerName: "Ghi chú", flex: 1, minWidth: 100, editable: true },
    {
      headerName: "Thao tác", width: 140,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cellRenderer: (p: { data: any }) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="outline" size="sm" onClick={() => setEditTarget(p.data)}>Sửa</Button>
          <DeleteConfirmDialog
            itemName={itemMap[p.data.itemId] ?? String(p.data.itemId)}
            onConfirm={async () => { await softDeleteDelivery(p.data.id, supplierId); startTransition(() => router.refresh()); }}
            trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>}
          />
        </div>
      ),
    },
  ];

  async function handleCreate(data: DeliveryInput) {
    await createDelivery(data);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(data: DeliveryInput) {
    if (!editTarget) return;
    await updateDelivery(editTarget.id, data);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  const defaultValues: DeliveryInput | undefined = editTarget ? {
    supplierId,
    projectId: editTarget.projectId ?? undefined,
    date: new Date(editTarget.date).toISOString().split("T")[0],
    itemId: editTarget.itemId,
    qty: Number(editTarget.qty),
    unit: editTarget.unit,
    cbVatTu: editTarget.cbVatTu ?? undefined,
    chiHuyCt: editTarget.chiHuyCt ?? undefined,
    keToan: editTarget.keToan ?? undefined,
    note: editTarget.note ?? undefined,
  } : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Vật tư ngày</h2>
        <Button onClick={() => setCreateOpen(true)}>Thêm phiếu nhập</Button>
      </div>

      <AgGridBase rowData={initialData} columnDefs={colDefs} height={500}
        gridOptions={{ onCellValueChanged: handleCellValueChanged }} />

      <CrudDialog title="Thêm phiếu nhập vật tư" open={createOpen} onOpenChange={setCreateOpen}>
        <DeliveryForm supplierId={supplierId} items={items} projects={projects} onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog title="Sửa phiếu nhập vật tư" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <DeliveryForm supplierId={supplierId} items={items} projects={projects}
            defaultValues={defaultValues} onSubmit={handleEdit} />
        )}
      </CrudDialog>
    </div>
  );
}
