"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { createDelivery, updateDelivery, softDeleteDelivery } from "@/lib/vat-tu-ncc/delivery-service";
import { type DeliveryInput } from "@/lib/vat-tu-ncc/schemas";
import { DeliveryForm } from "./delivery-form";
import { formatDate } from "@/lib/utils/format";

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

interface DeliveryGridRow extends RowWithId {
  date: string;
  itemLabel: string;
  qty: number;
  unit: string;
  projectLabel: string;
  cbVatTu: string;
  chiHuyCt: string;
  keToan: string;
  note: string;
}

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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const itemMap = Object.fromEntries(items.map((i) => [i.id, `${i.code} - ${i.name}`]));
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.code]));
  const rowsById = new Map(initialData.map((r) => [r.id, r]));

  const rows: DeliveryGridRow[] = initialData.map((r) => ({
    id: r.id,
    date: formatDate(r.date, ""),
    itemLabel: itemMap[r.itemId] ?? String(r.itemId),
    qty: Number(r.qty),
    unit: r.unit,
    projectLabel: r.projectId ? (projectMap[r.projectId] ?? String(r.projectId)) : "",
    cbVatTu: r.cbVatTu ?? "",
    chiHuyCt: r.chiHuyCt ?? "",
    keToan: r.keToan ?? "",
    note: r.note ?? "",
  }));

  const columns: DataGridColumn<DeliveryGridRow>[] = [
    { id: "date", title: "Ngày", kind: "text", width: 110, readonly: true },
    { id: "itemLabel", title: "Vật tư", kind: "text", width: 240, readonly: true },
    { id: "qty", title: "SL", kind: "number", width: 100 },
    { id: "unit", title: "ĐVT", kind: "text", width: 80, readonly: true },
    { id: "projectLabel", title: "Dự án", kind: "text", width: 100, readonly: true },
    { id: "cbVatTu", title: "Cán bộ VT", kind: "text", width: 140 },
    { id: "chiHuyCt", title: "Chỉ huy CT", kind: "text", width: 140 },
    { id: "keToan", title: "Kế toán", kind: "text", width: 120 },
    { id: "note", title: "Ghi chú", kind: "text", width: 200 },
  ];

  const patchDelivery = async (id: number, patch: Partial<DeliveryGridRow>) => {
    const current = rowsById.get(id);
    if (!current) throw new Error(`Phiếu #${id} không tồn tại`);
    const merged: DeliveryInput = {
      supplierId,
      projectId: current.projectId ?? undefined,
      date: new Date(current.date).toISOString().split("T")[0],
      itemId: current.itemId,
      qty: typeof patch.qty === "number" ? patch.qty : Number(current.qty),
      unit: current.unit,
      cbVatTu: typeof patch.cbVatTu === "string" ? (patch.cbVatTu || undefined) : (current.cbVatTu ?? undefined),
      chiHuyCt: typeof patch.chiHuyCt === "string" ? (patch.chiHuyCt || undefined) : (current.chiHuyCt ?? undefined),
      keToan: typeof patch.keToan === "string" ? (patch.keToan || undefined) : (current.keToan ?? undefined),
      note: typeof patch.note === "string" ? (patch.note || undefined) : (current.note ?? undefined),
    };
    await updateDelivery(id, merged);
  };

  const handlers: DataGridHandlers<DeliveryGridRow> = {
    onCellEdit: async (id, col, value) => {
      try {
        await patchDelivery(id, { [col]: value } as Partial<DeliveryGridRow>);
        toast.success("Đã lưu");
        startTransition(() => router.refresh());
      } catch (err) {
        toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
        startTransition(() => router.refresh());
      }
    },
    onDeleteRows: async (ids) => {
      for (const id of ids) {
        await softDeleteDelivery(id, supplierId);
      }
      startTransition(() => router.refresh());
    },
  };

  const editSelected = () => {
    if (selectedIds.length !== 1) return;
    const target = rowsById.get(selectedIds[0]);
    if (target) setEditTarget(target);
  };

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
        <div className="flex gap-2">
          <Button variant="outline" disabled={selectedIds.length !== 1} onClick={editSelected}>
            Sửa đầy đủ
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Thêm phiếu nhập</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Chỉnh sửa nhanh: nhấp đúp vào ô <strong>SL</strong>, <strong>Cán bộ VT</strong>, <strong>Chỉ huy CT</strong>, <strong>Kế toán</strong>, <strong>Ghi chú</strong>. Đổi <strong>Vật tư</strong> hoặc <strong>Dự án</strong> qua nút &quot;Sửa đầy đủ&quot;.
      </p>

      <DataGrid<DeliveryGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        height={500}
        onSelectionChange={setSelectedIds}
      />

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
