"use client";

/**
 * Mã nhóm: form thêm + lưới sửa tại ô (mã, tên, NCC phụ trách = đầu mối, vật tư chính, thứ tự, ghi
 * chú). Mỗi lần sửa chỉ gửi ô vừa đổi. Mã nhóm còn ánh xạ dùng thì không xóa được (server từ chối).
 */

import dynamic from "next/dynamic";
import { useState, useTransition, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGroupCode, softDeleteGroupCode, updateGroupCode, type GroupCodeRow } from "@/lib/du-an/dt-hd-tt/group-code-service";
import type { GroupCodePatch } from "@/lib/du-an/dt-hd-tt/register-schemas";
import { parseNumberText } from "@/lib/du-an/dt-hd-tt/register-ui";

const DataGrid = dynamic(() => import("@/components/data-grid").then((m) => m.DataGrid), { ssr: false }) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

interface GridRow extends RowWithId {
  code: string;
  name: string;
  counterpartyId: number;
  isMainMaterial: boolean;
  sortOrder: number;
  aliasCount: number;
  note: string;
}

/** Lựa chọn "không có đầu mối" của cột chọn (id 0 ↔ null). */
const NONE = 0;

const toGrid = (r: GroupCodeRow): GridRow => ({
  id: r.id, code: r.code, name: r.name, counterpartyId: r.counterpartyId ?? NONE, isMainMaterial: r.isMainMaterial,
  sortOrder: r.sortOrder, aliasCount: r.aliasCount, note: r.note ?? "",
});

/** Bản vá của đúng một ô vừa sửa. */
function cellPatch(col: string, value: unknown): GroupCodePatch {
  const text = value == null ? "" : String(value);
  switch (col) {
    case "code": return { code: text };
    case "name": return { name: text };
    case "note": return { note: text || null };
    case "counterpartyId": return { counterpartyId: value == null || Number(value) === NONE ? null : Number(value) };
    case "isMainMaterial": return { isMainMaterial: Boolean(value) };
    case "sortOrder": return { sortOrder: value == null ? null : Number(value) };
    default: throw new Error(`Cột "${col}" không sửa được`);
  }
}

const EMPTY_FORM = { code: "", name: "", counterpartyId: "", isMainMaterial: false, sortOrder: "", note: "" };

interface Props {
  projectId: number;
  rows: GroupCodeRow[];
  counterparties: SelectOption[];
  canCreate: boolean;
  canEdit: boolean;
}

export function MaNhomClient({ projectId, rows, counterparties, canCreate, canEdit }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  // Đầu mối đã xóa vẫn hiện tên ở dòng cũ.
  const options: SelectOption[] = [{ id: NONE, name: "— Không —" }, ...counterparties];
  for (const r of rows) {
    if (r.counterpartyId !== null && !options.some((o) => o.id === r.counterpartyId)) {
      options.push({ id: r.counterpartyId, name: `${r.counterpartyName ?? `#${r.counterpartyId}`} (đã xóa)` });
    }
  }
  const locked = !canEdit;

  const columns: DataGridColumn<GridRow>[] = [
    { id: "code", title: "Mã nhóm", kind: "text", width: 130, readonly: locked },
    { id: "name", title: "Tên nhóm", kind: "text", width: 260, readonly: locked },
    { id: "counterpartyId", title: "NCC phụ trách (đầu mối)", kind: "select", width: 220, options, readonly: locked },
    { id: "isMainMaterial", title: "Vật tư chính", kind: "boolean", width: 100, readonly: locked },
    { id: "sortOrder", title: "Thứ tự", kind: "number", width: 80, readonly: locked },
    { id: "aliasCount", title: "Số ánh xạ", kind: "number", width: 90, readonly: true },
    { id: "note", title: "Ghi chú", kind: "text", width: 220, readonly: locked },
  ];

  const handlers: DataGridHandlers<GridRow> = {
    onCellEdit: async (id, col, value) => {
      const result = await updateGroupCode(id, projectId, cellPatch(col, value));
      if (!result.ok) throw new Error(result.message);
      refresh();
      return toGrid(result.row);
    },
    onDeleteRows: async (ids) => {
      try {
        for (const id of ids) {
          const result = await softDeleteGroupCode(id, projectId);
          if (!result.ok) throw new Error(result.message);
        }
      } finally {
        refresh();
      }
    },
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await createGroupCode({
        projectId, code: form.code, name: form.name, counterpartyId: form.counterpartyId ? Number(form.counterpartyId) : null,
        isMainMaterial: form.isMainMaterial, sortOrder: parseNumberText(form.sortOrder, "Thứ tự", "decimal"), note: form.note || null,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Đã thêm mã nhóm ${result.row.code}`);
      setForm(EMPTY_FORM);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Mã nhóm</h2>
        <p className="text-sm text-muted-foreground">{rows.length} mã nhóm · {rows.filter((r) => r.isMainMaterial).length} nhóm vật tư chính (Phần I DT-TT)</p>
      </div>

      {canCreate && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 rounded border p-3 md:grid-cols-6">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Mã nhóm *</span>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="h-8" />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Tên nhóm *</span>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="h-8" />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">NCC phụ trách (đầu mối)</span>
            <select value={form.counterpartyId} onChange={(e) => setForm({ ...form, counterpartyId: e.target.value })} className="h-8 rounded-md border bg-transparent px-2 text-sm">
              <option value="">— Không —</option>
              {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Thứ tự</span>
            <Input value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} inputMode="numeric" className="h-8" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isMainMaterial} onChange={(e) => setForm({ ...form, isMainMaterial: e.target.checked })} />
            Vật tư chính
          </label>
          <div className="col-span-2 md:col-span-4">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ghi chú" className="h-8" />
          </div>
          <div className="flex items-end"><Button type="submit" disabled={saving} className="h-8 w-full">Thêm mã nhóm</Button></div>
        </form>
      )}

      <DataGrid<GridRow>
        key={rows.map((r) => r.id).join(",")}
        columns={columns}
        rows={rows.map(toGrid)}
        handlers={canEdit ? handlers : {}}
        height={560}
      />
    </div>
  );
}
