"use client";

/**
 * Đầu mối (dòng Phần II DT-TT): form thêm + lưới sửa tại ô — tên, loại, nhóm / thứ tự sắp xếp, nguồn
 * thực tế, số chốt tay, mục chi. Cột "Thực tế" là số báo cáo đang tính theo nguồn đã chọn (đổi nguồn
 * → thực tế, và T của HĐ-TT, đổi theo). Mỗi lần sửa chỉ gửi ô vừa đổi.
 */

import dynamic from "next/dynamic";
import { useState, useTransition, type FormEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCounterparty, softDeleteCounterparty, updateCounterparty, type CounterpartyRow } from "@/lib/du-an/dt-hd-tt/counterparty-service";
import type { CounterpartyPatch } from "@/lib/du-an/dt-hd-tt/register-schemas";
import {
  ACTUAL_BASES, ACTUAL_BASIS_LABEL, COUNTERPARTY_KINDS, COUNTERPARTY_KIND_LABEL, PAYMENT_SECTION_OPTIONS, parseNumberText,
} from "@/lib/du-an/dt-hd-tt/register-ui";
import type { ActualBasis, CounterpartyKind } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { parseNumberCell } from "@/lib/du-an/dt-hd-tt/entry-cell-parse";

const DataGrid = dynamic(() => import("@/components/data-grid").then((m) => m.DataGrid), { ssr: false }) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

interface GridRow extends RowWithId {
  name: string;
  kind: string;
  sortGroup: string;
  sortOrder: number;
  actualBasis: string;
  actualManualVnd: number | null;
  paymentSection: string;
  actual: number | null;
  note: string;
}

/** Lựa chọn "không có mục chi" của cột chọn. */
const NO_SECTION = "-";
const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
/** Hiển thị ô tiền kiểu chữ (ô sửa vẫn là số thô để đọc chặt khi lưu). */
const moneyCell = (v: unknown) => (v == null || v === "" ? "" : vnd.format(Number(v)));
type Section = (typeof PAYMENT_SECTION_OPTIONS)[number];

const KIND_OPTIONS: SelectOption[] = COUNTERPARTY_KINDS.map((k) => ({ id: k, name: COUNTERPARTY_KIND_LABEL[k] }));
const BASIS_OPTIONS: SelectOption[] = ACTUAL_BASES.map((b) => ({ id: b, name: ACTUAL_BASIS_LABEL[b] }));
const SECTION_OPTIONS: SelectOption[] = [{ id: NO_SECTION, name: "— Không —" }, ...PAYMENT_SECTION_OPTIONS.map((s) => ({ id: s, name: `Mục ${s}` }))];

/** Bản vá của đúng một ô vừa sửa. */
function cellPatch(col: string, value: unknown): CounterpartyPatch {
  const text = value == null ? "" : String(value);
  switch (col) {
    case "name": return { name: text };
    case "kind": return { kind: text as CounterpartyKind };
    case "sortGroup": return { sortGroup: text || null };
    case "sortOrder": return { sortOrder: value == null ? null : Number(value) };
    case "actualBasis": return { actualBasis: text as ActualBasis };
    // Ô chữ + đọc chặt: chữ không phải số → báo lỗi, không lưu thành "chưa chốt".
    case "actualManualVnd": return { actualManualVnd: parseNumberCell(value, "Số chốt tay") };
    case "paymentSection": return { paymentSection: !text || text === NO_SECTION ? null : (text as Section) };
    case "note": return { note: text || null };
    default: throw new Error(`Cột "${col}" không sửa được`);
  }
}

const EMPTY_FORM = { name: "", kind: "ncc", actualBasis: "manual", actualManualVnd: "", paymentSection: "", sortGroup: "", sortOrder: "", note: "" };
const selectClass = "h-8 rounded-md border bg-transparent px-2 text-sm";

interface Props {
  projectId: number;
  rows: CounterpartyRow[];
  /** Thực tế báo cáo đang tính cho từng đầu mối (null = chưa chốt). */
  actualOf: Record<number, number | null>;
  canCreate: boolean;
  canEdit: boolean;
}

export function DauMoiClient({ projectId, rows, actualOf, canCreate, canEdit }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const refresh = () => startTransition(() => router.refresh());
  const toGrid = (r: CounterpartyRow): GridRow => ({
    id: r.id, name: r.name, kind: r.kind, sortGroup: r.sortGroup ?? "", sortOrder: r.sortOrder, actualBasis: r.actualBasis,
    actualManualVnd: r.actualManualVnd, paymentSection: r.paymentSection ?? NO_SECTION, actual: actualOf[r.id] ?? null, note: r.note ?? "",
  });
  const locked = !canEdit;

  const columns: DataGridColumn<GridRow>[] = [
    { id: "name", title: "Đầu mối", kind: "text", width: 220, readonly: locked },
    { id: "kind", title: "Loại", kind: "select", width: 120, options: KIND_OPTIONS, readonly: locked },
    { id: "sortGroup", title: "Nhóm sắp xếp", kind: "text", width: 110, readonly: locked },
    { id: "sortOrder", title: "Thứ tự", kind: "number", width: 70, readonly: locked },
    { id: "actualBasis", title: "Nguồn thực tế", kind: "select", width: 150, options: BASIS_OPTIONS, readonly: locked },
    { id: "actualManualVnd", title: "Số chốt tay", kind: "text", width: 130, readonly: locked, format: moneyCell },
    { id: "paymentSection", title: "Mục chi", kind: "select", width: 90, options: SECTION_OPTIONS, readonly: locked },
    { id: "actual", title: "Thực tế (báo cáo)", kind: "currency", width: 140, readonly: true, format: (v) => (v == null ? "chưa chốt" : vnd.format(Number(v))) },
    { id: "note", title: "Ghi chú", kind: "text", width: 200, readonly: locked },
  ];

  const handlers: DataGridHandlers<GridRow> = {
    onCellEdit: async (id, col, value) => {
      const result = await updateCounterparty(id, projectId, cellPatch(col, value));
      if (!result.ok) throw new Error(result.message);
      refresh(); // thực tế của báo cáo tính lại ở server
      return toGrid(result.row);
    },
    onDeleteRows: async (ids) => {
      try {
        for (const id of ids) {
          const result = await softDeleteCounterparty(id, projectId);
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
      const result = await createCounterparty({
        projectId, name: form.name, kind: form.kind as CounterpartyKind, actualBasis: form.actualBasis as ActualBasis,
        actualManualVnd: parseNumberText(form.actualManualVnd, "Số chốt tay"),
        paymentSection: form.paymentSection ? (form.paymentSection as Section) : null,
        sortGroup: form.sortGroup || null, sortOrder: parseNumberText(form.sortOrder, "Thứ tự", "decimal"), note: form.note || null,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Đã thêm đầu mối ${result.row.name}`);
      setForm(EMPTY_FORM);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const label = (text: string, input: ReactElement, wide = false) => (
    <label className={`flex flex-col gap-1 text-xs ${wide ? "col-span-2" : ""}`}>
      <span className="text-muted-foreground">{text}</span>
      {input}
    </label>
  );

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Đầu mối</h2>
        <p className="text-sm text-muted-foreground">
          Mỗi đầu mối là một dòng Phần II DT-TT. Nguồn thực tế: Σ thực tế nhập gắn đầu mối, Σ HĐ × (1+VAT) của các NCC thuộc đầu mối,
          Σ chi thực tế (theo mục chi nếu chọn), hoặc số chốt nhập tay.
        </p>
      </div>

      {canCreate && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 rounded border p-3 md:grid-cols-8">
          {label("Tên đầu mối *", <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="h-8" />, true)}
          {label("Loại", <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={selectClass}>
            {COUNTERPARTY_KINDS.map((k) => <option key={k} value={k}>{COUNTERPARTY_KIND_LABEL[k]}</option>)}
          </select>)}
          {label("Nguồn thực tế", <select value={form.actualBasis} onChange={(e) => setForm({ ...form, actualBasis: e.target.value })} className={selectClass}>
            {ACTUAL_BASES.map((b) => <option key={b} value={b}>{ACTUAL_BASIS_LABEL[b]}</option>)}
          </select>)}
          {label("Số chốt tay", <Input value={form.actualManualVnd} onChange={(e) => setForm({ ...form, actualManualVnd: e.target.value })} inputMode="decimal" placeholder="1.500.000" className="h-8" />)}
          {label("Mục chi", <select value={form.paymentSection} onChange={(e) => setForm({ ...form, paymentSection: e.target.value })} className={selectClass}>
            <option value="">— Không —</option>
            {PAYMENT_SECTION_OPTIONS.map((s) => <option key={s} value={s}>Mục {s}</option>)}
          </select>)}
          {label("Nhóm sắp xếp", <Input value={form.sortGroup} onChange={(e) => setForm({ ...form, sortGroup: e.target.value })} className="h-8" />)}
          {label("Thứ tự", <Input value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} inputMode="numeric" className="h-8" />)}
          <div className="col-span-2 md:col-span-6">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ghi chú" className="h-8" />
          </div>
          <div className="col-span-2 flex items-end"><Button type="submit" disabled={saving} className="h-8 w-full">Thêm đầu mối</Button></div>
        </form>
      )}

      {/* Khóa gồm cả thực tế báo cáo: đổi nguồn → sau khi tải lại lưới dựng lại với số mới. */}
      <DataGrid<GridRow> key={rows.map((r) => `${r.id}:${actualOf[r.id] ?? ""}`).join(",")} columns={columns} rows={rows.map(toGrid)} handlers={canEdit ? handlers : {}} height={420} />
    </section>
  );
}
