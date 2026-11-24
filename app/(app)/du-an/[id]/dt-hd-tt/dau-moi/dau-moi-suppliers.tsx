"use client";

/**
 * NCC của đầu mối = các dòng báo cáo HĐ-TT: NCC pháp nhân, đầu mối nó gộp vào (mỗi NCC một dòng trong
 * công trình), và các ô nhập tay H (thực nộp rà soát), S (thực tế riêng NCC), X (đã lấy về), Z (việc cần
 * làm) — sửa cần quyền `edit`. E / I / T là số báo cáo đang tính, để thấy ngay tác động của số nhập.
 * Bộ lọc tên NCC / đầu mối (cả "không thuộc đầu mối" = 0) do trang giữ và đồng bộ URL; neo `#ncc` ở
 * mục này, `#ncc-chua-co-dong` ở thông báo NCC chưa có dòng (các NCC đó không nằm trong lưới).
 */

import dynamic from "next/dynamic";
import { useState, useTransition, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { GridStateHook } from "@/components/du-an/dt-hd-tt/screen-state-hook";
import { useUrlState } from "@/components/du-an/dt-hd-tt/use-url-state";
import { Button } from "@/components/ui/button";
import {
  createCounterpartySupplier, softDeleteCounterpartySupplier, updateCounterpartySupplier, type CounterpartySupplierRow,
} from "@/lib/du-an/dt-hd-tt/counterparty-service";
import type { GridFilters } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import type { CounterpartySupplierPatch } from "@/lib/du-an/dt-hd-tt/register-schemas";
import { parseNumberCell } from "@/lib/du-an/dt-hd-tt/entry-cell-parse";
import { DAU_MOI_ANCHORS, DAU_MOI_SUPPLIER_GRID_SPEC, DAU_MOI_SUPPLIER_URL } from "@/lib/du-an/dt-hd-tt/screen-links";

const DataGrid = dynamic(() => import("@/components/data-grid").then((m) => m.DataGrid), { ssr: false }) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  filters?: GridFilters;
  onFiltersChange?: (filters: GridFilters) => void;
}) => ReactElement;

const SYNCED = Object.keys(DAU_MOI_SUPPLIER_GRID_SPEC.filterable);

/** Số báo cáo HĐ-TT của một NCC: E gồm VAT, I đã trả (H ?? sổ chi), T thực tế. */
export interface SupplierFigures {
  invoiceTotal: number;
  paid: number;
  actual: number;
  /** Đầu mối chưa chốt thực tế → T tạm = HĐ. */
  temporary: boolean;
}

interface GridRow extends RowWithId {
  supplierName: string;
  counterpartyId: number;
  invoiceTotal: number | null;
  paid: number | null;
  paidOverrideVnd: number | null;
  splitActualVnd: number | null;
  actual: number | null;
  actualTemporary: boolean;
  recoveredVnd: number | null;
  todoNote: string;
  note: string;
}

/** Lựa chọn "không thuộc đầu mối nào" của cột chọn (id 0 ↔ null). */
const NONE = 0;
const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
/** Hiển thị ô tiền kiểu chữ (ô sửa vẫn là số thô để đọc chặt khi lưu). */
const moneyCell = (v: unknown) => (v == null || v === "" ? "" : vnd.format(Number(v)));

/**
 * Bản vá của đúng một ô vừa sửa. H / S / X là ô chữ đọc chặt: ô trống = xóa số nhập tay, chữ không
 * phải số → báo lỗi (không lặng lẽ xóa H / S / X).
 */
function cellPatch(col: string, value: unknown): CounterpartySupplierPatch {
  const text = value == null ? "" : String(value);
  switch (col) {
    case "counterpartyId": return { counterpartyId: value == null || Number(value) === NONE ? null : Number(value) };
    case "paidOverrideVnd": return { paidOverrideVnd: parseNumberCell(value, "H thực nộp rà soát") };
    case "splitActualVnd": return { splitActualVnd: parseNumberCell(value, "S thực tế riêng") };
    case "recoveredVnd": return { recoveredVnd: parseNumberCell(value, "X đã lấy về") };
    case "todoNote": return { todoNote: text || null };
    case "note": return { note: text || null };
    default: throw new Error(`Cột "${col}" không sửa được`);
  }
}

interface Props {
  projectId: number;
  links: CounterpartySupplierRow[];
  counterparties: SelectOption[];
  suppliers: SelectOption[];
  figures: Record<number, SupplierFigures>;
  /** NCC đang có số ở HĐ-TT nhưng chưa có dòng (chưa nhập được H / X). */
  withoutRow: string[];
  canCreate: boolean;
  canEdit: boolean;
  /** Bộ lọc server đọc từ URL — chỉ dùng cho lần render đầu (xem useUrlState). */
  initialFilters: GridFilters;
}

export function DauMoiSuppliers({ projectId, links, counterparties, suppliers, figures, withoutRow, canCreate, canEdit, initialFilters }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState({ supplierId: "", counterpartyId: "" });
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useUrlState(initialFilters, DAU_MOI_SUPPLIER_URL);
  const refresh = () => startTransition(() => router.refresh());

  const order = new Map(counterparties.map((c, i) => [Number(c.id), i]));
  const sorted = [...links].sort(
    (x, y) => (order.get(x.counterpartyId ?? -1) ?? Infinity) - (order.get(y.counterpartyId ?? -1) ?? Infinity) || x.id - y.id,
  );
  const toGrid = (l: CounterpartySupplierRow): GridRow => {
    const f = figures[l.supplierId];
    return {
      id: l.id, supplierName: l.supplierName, counterpartyId: l.counterpartyId ?? NONE, invoiceTotal: f?.invoiceTotal ?? null, paid: f?.paid ?? null,
      paidOverrideVnd: l.paidOverrideVnd, splitActualVnd: l.splitActualVnd, actual: f?.actual ?? null, actualTemporary: f?.temporary ?? false, recoveredVnd: l.recoveredVnd,
      todoNote: l.todoNote ?? "", note: l.note ?? "",
    };
  };
  const options: SelectOption[] = [{ id: NONE, name: "— Không thuộc đầu mối —" }, ...counterparties];
  const locked = !canEdit;
  const linkedIds = new Set(links.map((l) => l.supplierId));

  const columns: DataGridColumn<GridRow>[] = [
    { id: "supplierName", title: "NCC", kind: "text", width: 220, readonly: true, filterable: true },
    // Ô lọc "— Không thuộc đầu mối —" mang id 0 (NONE), so khớp `equals "0"` không cần quy đổi.
    { id: "counterpartyId", title: "Đầu mối", kind: "select", width: 200, options, readonly: locked, filterable: true },
    { id: "invoiceTotal", title: "E HĐ gồm VAT", kind: "currency", width: 130, readonly: true },
    { id: "paid", title: "I đã trả", kind: "currency", width: 120, readonly: true },
    { id: "paidOverrideVnd", title: "H thực nộp rà soát", kind: "text", width: 140, readonly: locked, format: moneyCell },
    { id: "splitActualVnd", title: "S thực tế riêng", kind: "text", width: 130, readonly: locked, format: moneyCell },
    {
      id: "actual", title: "T thực tế", kind: "currency", width: 140, readonly: true,
      format: (v, row) => (v == null ? "" : `${vnd.format(Number(v))}${row.actualTemporary ? " (tạm = HĐ)" : ""}`),
    },
    { id: "recoveredVnd", title: "X đã lấy về", kind: "text", width: 120, readonly: locked, format: moneyCell },
    { id: "todoNote", title: "Z việc cần làm", kind: "text", width: 200, readonly: locked },
    { id: "note", title: "Ghi chú", kind: "text", width: 160, readonly: locked },
  ];

  const handlers: DataGridHandlers<GridRow> = {
    onCellEdit: async (id, col, value) => {
      const result = await updateCounterpartySupplier(id, projectId, cellPatch(col, value));
      if (!result.ok) throw new Error(result.message);
      refresh(); // E / I / T tính lại ở server
      return toGrid(result.row);
    },
    onDeleteRows: async (ids) => {
      try {
        for (const id of ids) {
          const result = await softDeleteCounterpartySupplier(id, projectId);
          if (!result.ok) throw new Error(result.message);
        }
      } finally {
        refresh();
      }
    },
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.supplierId) {
      toast.error("Chọn NCC");
      return;
    }
    setSaving(true);
    try {
      const result = await createCounterpartySupplier({
        projectId, supplierId: Number(form.supplierId), counterpartyId: form.counterpartyId ? Number(form.counterpartyId) : null,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Đã thêm NCC ${result.row.supplierName}`);
      setForm({ supplierId: "", counterpartyId: form.counterpartyId });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const selectClass = "h-8 w-full rounded-md border bg-transparent px-2 text-sm";
  const figureKey = sorted.map((l) => `${l.id}:${figures[l.supplierId]?.actual ?? ""}:${figures[l.supplierId]?.paid ?? ""}`).join(",");
  const gridRows = sorted.map(toGrid);

  return (
    <section id={DAU_MOI_ANCHORS.ncc} data-ncc-without-row={withoutRow.length} className="scroll-mt-4 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">NCC của đầu mối (dòng HĐ-TT)</h2>
        <p className="text-sm text-muted-foreground">Mỗi NCC chỉ một dòng trong công trình. H để trống = theo sổ chi; S để trống = theo quy tắc chia của HĐ-TT.</p>
        {withoutRow.length > 0 && (
          <p id={DAU_MOI_ANCHORS.nccWithoutRow} className="scroll-mt-4 text-sm text-amber-800">
            Có số ở HĐ-TT nhưng chưa có dòng: {withoutRow.join(", ")}.
          </p>
        )}
      </div>

      {canCreate && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 rounded border p-3 md:grid-cols-5">
          <label className="col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">NCC *</span>
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required className={selectClass}>
              <option value="">— Chọn NCC —</option>
              {suppliers.filter((s) => !linkedIds.has(Number(s.id))).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Đầu mối</span>
            <select value={form.counterpartyId} onChange={(e) => setForm({ ...form, counterpartyId: e.target.value })} className={selectClass}>
              <option value="">— Không thuộc đầu mối —</option>
              {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="flex items-end"><Button type="submit" disabled={saving} className="h-8 w-full">Thêm NCC</Button></div>
        </form>
      )}

      <DataGrid<GridRow>
        key={figureKey}
        columns={columns}
        rows={gridRows}
        handlers={canEdit ? handlers : {}}
        height={480}
        filters={filters}
        onFiltersChange={setFilters}
      />
      <GridStateHook name="dau-moi-ncc" filters={filters} rows={gridRows} columns={columns} synced={SYNCED} />
    </section>
  );
}
