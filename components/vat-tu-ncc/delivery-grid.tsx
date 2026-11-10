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
  createDeliveryAction,
  deleteDeliveryAction,
  updateDeliveryAction,
  type DeliverySaveResult,
} from "@/lib/vat-tu-ncc/delivery-actions";
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
  unitPrice: unknown;
  totalAmount: unknown;
  cbVatTu: string | null;
  chiHuyCt: string | null;
  keToan: string | null;
  note: string | null;
};

type QuoteOption = { id: number; itemId: number; unitPrice: number; effectiveFrom: Date };

type ItemOption = { id: number; code: string; name: string; unit: string };
type ProjectOption = { id: number; code: string; name: string };

interface DeliveryGridRow extends RowWithId {
  date: string;
  itemLabel: string;
  qty: number;
  unit: string;
  /** null = phiếu chưa có đơn giá (ô để trống, không hiện "0 ₫"). */
  unitPrice: number | null;
  totalAmount: number | null;
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
  quotes: QuoteOption[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Admin: được xác nhận để sửa phiếu trong kỳ đã ký / kỳ chuyển đổi (server kiểm lại). */
  canOverrideLocked?: boolean;
  /** Trang đang xem một cặp (`?projectId=`): form tạo/sửa khoá sẵn công trình này. */
  lockedProjectId?: number;
}

/** Lỗi khoá kỳ mà admin được phép xác nhận để sửa vẫn sửa. */
const isLockedRefusal = (r: DeliverySaveResult) =>
  !r.ok && (r.code === "signed_period" || r.code === "cutover_locked");

/**
 * Lưu phiếu; phiếu thuộc kỳ đã ký / kỳ chuyển đổi thì admin được hỏi xác nhận rồi lưu lại với cờ
 * `overrideLocked` (server kiểm admin, ghi thay đổi vào công nợ và đông cứng lại kỳ đã ký).
 */
async function saveWithLockConfirm(
  save: (overrideLocked: boolean) => Promise<DeliverySaveResult>,
  canOverrideLocked: boolean,
): Promise<DeliverySaveResult> {
  const first = await save(false);
  if (!canOverrideLocked || !isLockedRefusal(first) || first.ok) return first;
  const ok = window.confirm(
    `${first.message}\n\nBạn là admin: vẫn sửa phiếu này? Công nợ, báo cáo và bảng đối chiếu đã ký ` +
      `của kỳ này và các kỳ sau sẽ được cập nhật theo số mới (có ghi lại người sửa).`,
  );
  return ok ? save(true) : { ok: false, message: "Đã huỷ sửa phiếu trong kỳ đã ký." };
}

/**
 * Ném lỗi khi server action trả `ok: false` (thông điệp nghiệp vụ đi nguyên văn lên toast); lưu được
 * thì báo phiếu đã vào công nợ chưa (xem DeliveryLedgerStatus).
 */
function toastSaved(result: DeliverySaveResult, savedText: string) {
  if (!result.ok) throw new Error(result.message);
  if (result.ledgerStatus === "posted") toast.success(`${savedText} — công nợ đã cập nhật`);
  else if (result.ledgerStatus === "missing_price") {
    toast.warning(`${savedText}. Phiếu thuộc kỳ đã chốt nhưng chưa có đơn giá nên chưa vào công nợ — nhập đơn giá.`);
  } else toast.success(`${savedText}. Phiếu vào công nợ khi chốt kỳ.`);
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function DeliveryGrid({
  supplierId,
  initialData,
  items,
  projects,
  quotes,
  canCreate,
  canEdit,
  canDelete,
  canOverrideLocked = false,
  lockedProjectId,
}: Props) {
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
    unitPrice: r.unitPrice == null ? null : Number(r.unitPrice),
    totalAmount: r.totalAmount == null ? null : Number(r.totalAmount),
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
    { id: "unitPrice", title: "Đơn giá", kind: "currency", width: 120 },
    { id: "totalAmount", title: "Thành tiền", kind: "currency", width: 140, readonly: true },
    { id: "projectLabel", title: "Công trình", kind: "text", width: 100, readonly: true },
    { id: "cbVatTu", title: "Cán bộ VT", kind: "text", width: 140 },
    { id: "chiHuyCt", title: "Chỉ huy CT", kind: "text", width: 140 },
    { id: "keToan", title: "Kế toán", kind: "text", width: 120 },
    { id: "note", title: "Ghi chú", kind: "text", width: 200 },
  ];

  const patchDelivery = async (id: number, patch: Partial<DeliveryGridRow>) => {
    const current = rowsById.get(id);
    if (!current) throw new Error(`Phiếu #${id} không tồn tại`);
    // Phiếu luôn thuộc một công trình (cặp NCC × công trình); dòng cũ thiếu thì sửa qua "Sửa đầy đủ".
    if (current.projectId == null) throw new Error(`Phiếu #${id} chưa có công trình — dùng "Sửa đầy đủ" để chọn công trình.`);
    const currentPrice = current.unitPrice == null ? undefined : Number(current.unitPrice);
    const patchedPrice = typeof patch.unitPrice === "number" ? patch.unitPrice : currentPrice;
    const merged: DeliveryInput = {
      supplierId,
      projectId: current.projectId,
      date: new Date(current.date).toISOString().split("T")[0],
      itemId: current.itemId,
      qty: typeof patch.qty === "number" ? patch.qty : Number(current.qty),
      unit: current.unit,
      // totalAmount cố tình bỏ trống để service tự tính = qty × đơn giá
      unitPrice: patchedPrice,
      cbVatTu: typeof patch.cbVatTu === "string" ? (patch.cbVatTu || undefined) : (current.cbVatTu ?? undefined),
      chiHuyCt: typeof patch.chiHuyCt === "string" ? (patch.chiHuyCt || undefined) : (current.chiHuyCt ?? undefined),
      keToan: typeof patch.keToan === "string" ? (patch.keToan || undefined) : (current.keToan ?? undefined),
      note: typeof patch.note === "string" ? (patch.note || undefined) : (current.note ?? undefined),
    };
    return saveWithLockConfirm((overrideLocked) => updateDeliveryAction(id, merged, { overrideLocked }), canOverrideLocked);
  };

  const handlers: DataGridHandlers<DeliveryGridRow> = {
    ...(canEdit ? { onCellEdit: async (id: number, col: string, value: unknown) => {
      try {
        toastSaved(await patchDelivery(id, { [col]: value } as Partial<DeliveryGridRow>), "Đã lưu");
        startTransition(() => router.refresh());
      } catch (err) {
        toast.error("Lưu thất bại: " + errorMessage(err));
        startTransition(() => router.refresh());
      }
    } } : {}),
    ...(canDelete ? { onDeleteRows: async (ids: number[]) => {
      // Xoá từng phiếu; phiếu thuộc kỳ đã ký / trước mốc chuyển đổi bị từ chối — báo lỗi, xoá tiếp phần còn lại.
      const failures: string[] = [];
      let deleted = 0;
      for (const id of ids) {
        const result = await deleteDeliveryAction(id, supplierId);
        if (result.ok) deleted++;
        else failures.push(`#${id}: ${result.message}`);
      }
      if (deleted > 0) toast.success(`Đã xoá ${deleted} phiếu`);
      if (failures.length > 0) {
        const shown = failures.slice(0, 3).join("; ");
        toast.error(`Không xoá được ${failures.length} phiếu — ${shown}${failures.length > 3 ? "; …" : ""}`);
      }
      startTransition(() => router.refresh());
    } } : {}),
  };

  const editSelected = () => {
    if (selectedIds.length !== 1) return;
    const target = rowsById.get(selectedIds[0]);
    if (target) setEditTarget(target);
  };

  async function handleCreate(data: DeliveryInput) {
    try {
      toastSaved(await createDeliveryAction(data), "Đã thêm phiếu nhập");
      setCreateOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Thêm phiếu thất bại: " + errorMessage(err));
    }
  }

  async function handleEdit(data: DeliveryInput) {
    if (!editTarget) return;
    try {
      const targetId = editTarget.id;
      toastSaved(
        await saveWithLockConfirm((overrideLocked) => updateDeliveryAction(targetId, data, { overrideLocked }), canOverrideLocked),
        "Đã lưu phiếu",
      );
      setEditTarget(null);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Lưu phiếu thất bại: " + errorMessage(err));
    }
  }

  const defaultValues: Partial<DeliveryInput> | undefined = editTarget ? {
    supplierId,
    projectId: editTarget.projectId ?? undefined,
    date: new Date(editTarget.date).toISOString().split("T")[0],
    itemId: editTarget.itemId,
    qty: Number(editTarget.qty),
    unit: editTarget.unit,
    unitPrice: editTarget.unitPrice == null ? undefined : Number(editTarget.unitPrice),
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
          <Button hidden={!canEdit} variant="outline" disabled={selectedIds.length !== 1} onClick={editSelected}>
            Sửa đầy đủ
          </Button>
          <Button hidden={!canCreate} onClick={() => setCreateOpen(true)}>Thêm phiếu nhập</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Chỉnh sửa nhanh: nhấp đúp vào ô <strong>SL</strong>, <strong>Đơn giá</strong>, <strong>Cán bộ VT</strong>, <strong>Chỉ huy CT</strong>, <strong>Kế toán</strong>, <strong>Ghi chú</strong>. Thành tiền tự tính = SL × Đơn giá. Đổi <strong>Vật tư</strong>{lockedProjectId == null && <> hoặc <strong>Công trình</strong></>} qua nút &quot;Sửa đầy đủ&quot;.
      </p>

      <DataGrid<DeliveryGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        height={500}
        onSelectionChange={setSelectedIds}
      />

      <CrudDialog title="Thêm phiếu nhập vật tư" open={createOpen} onOpenChange={setCreateOpen}>
        <DeliveryForm mode="create" supplierId={supplierId} quotes={quotes} items={items} projects={projects}
          lockedProjectId={lockedProjectId} onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog title="Sửa phiếu nhập vật tư" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <DeliveryForm mode="edit" supplierId={supplierId} quotes={quotes} items={items} projects={projects}
            lockedProjectId={lockedProjectId} defaultValues={defaultValues} onSubmit={handleEdit} />
        )}
      </CrudDialog>
    </div>
  );
}
