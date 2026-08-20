"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useGroupedSortableRows } from "@/components/grouped-table/use-grouped-sortable-rows";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { type EstimateInput } from "@/lib/du-an/schemas";
import {
  adminPatchEstimate,
  createEstimate,
  softDeleteEstimate,
  updateEstimate,
} from "@/lib/du-an/estimate-service";
import { vndFormatter } from "@/lib/format";
import { normVtName } from "@/lib/text/norm-vt-name";
import {
  buildCategoryTree,
  type CategoryLite,
  type HmGroup,
  type SectionGroup,
} from "@/lib/du-an/category-tree";
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
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isAdmin?: boolean;
}

function fmt(n: number): string {
  if (!n) return "—";
  return vndFormatter(Math.round(n));
}

function qtyFmt(n: number): string {
  if (!n) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}

/** Ô số sửa nhanh (pattern OverrideCell): click → input → Enter/blur commit, ESC hủy. */
function NumericEditCell({
  value,
  display,
  canEdit,
  allowZero = false,
  onCommit,
}: {
  value: number;
  display: string;
  canEdit: boolean;
  /** đơn giá được phép = 0 (khớp zod min(0)); SL thì không */
  allowZero?: boolean;
  onCommit: (n: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const committedRef = useRef(false);

  if (!canEdit) return <span>{display}</span>;

  const commit = (raw: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const parsed = Number(raw.replace(/[,\s]/g, ""));
    if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
      toast.error(allowZero ? "Giá trị phải là số ≥ 0" : "Giá trị phải là số > 0");
      committedRef.current = false;
      return;
    }
    if (parsed === value) {
      setEditing(false);
      committedRef.current = false;
      return;
    }
    startTransition(async () => {
      try {
        await onCommit(parsed);
        setEditing(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lưu thất bại");
        committedRef.current = false;
      }
    });
  };

  if (editing) {
    return (
      <input
        autoFocus
        disabled={isPending}
        defaultValue={String(value)}
        className="w-28 rounded border px-1 py-0.5 text-right text-sm"
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="cursor-pointer underline-offset-2 hover:underline"
      title="Bấm để sửa nhanh"
      onClick={() => {
        committedRef.current = false;
        setEditing(true);
      }}
    >
      {display}
    </button>
  );
}

interface Sums {
  totalVnd: number;
  qty: number | null; // null khi ĐVT không đồng nhất
  count: number;
}

function sumRows(rows: EstimateRow[]): Sums {
  const units = new Set(rows.map((r) => normVtName(r.unit)));
  return {
    totalVnd: rows.reduce((s, r) => s + Number(r.totalVnd), 0),
    qty: units.size === 1 ? rows.reduce((s, r) => s + Number(r.qty), 0) : null,
    count: rows.length,
  };
}

const COL_COUNT = 8;

const sortColumns = {
  itemCode: { accessor: (row: EstimateRow) => row.itemCode, kind: "text" as const },
  itemName: { accessor: (row: EstimateRow) => row.itemName, kind: "text" as const },
  unit: { accessor: (row: EstimateRow) => row.unit, kind: "text" as const },
  qty: { accessor: (row: EstimateRow) => row.qty, kind: "number" as const },
  unitPrice: { accessor: (row: EstimateRow) => row.unitPrice, kind: "currency" as const },
  totalVnd: { accessor: (row: EstimateRow) => row.totalVnd, kind: "currency" as const },
  note: { accessor: (row: EstimateRow) => row.note, kind: "text" as const },
};

export function DuToanClient({
  projectId,
  initialData,
  categories,
  canCreate,
  canEdit,
  canDelete,
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EstimateRow | null>(null);
  const [adminTarget, setAdminTarget] = useState<EstimateRow | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const categoriesById = useMemo(
    () => new Map<number, CategoryLite>(categories.map((c) => [c.id, c])),
    [categories],
  );
  const { sort, sortedRows, toggleSort } = useGroupedSortableRows(
    initialData,
    sortColumns,
    (row) => String(row.categoryId),
  );
  const tree = useMemo(
    () => buildCategoryTree(sortedRows, (r) => r.categoryId, categoriesById),
    [sortedRows, categoriesById],
  );
  const grandTotal = useMemo(
    () => initialData.reduce((sum, r) => sum + Number(r.totalVnd), 0),
    [initialData],
  );

  const toggle = (hm: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(hm)) next.delete(hm);
      else next.add(hm);
      return next;
    });

  const patchNumeric = async (row: EstimateRow, field: "qty" | "unitPrice", value: number) => {
    const merged: EstimateInput = {
      projectId,
      categoryId: row.categoryId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unit: row.unit,
      qty: field === "qty" ? value : Number(row.qty),
      unitPrice: field === "unitPrice" ? value : Number(row.unitPrice),
      note: row.note ?? undefined,
    };
    await updateEstimate(row.id, merged);
    toast.success("Đã lưu");
    startTransition(() => router.refresh());
  };

  const handleDelete = async (row: EstimateRow) => {
    if (!window.confirm(`Xóa dòng "${row.itemName}" (${row.itemCode})?`)) return;
    try {
      await softDeleteEstimate(row.id, projectId);
      toast.success("Đã xóa");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
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

  const renderItemRow = (r: EstimateRow) => (
    <tr key={r.id} className="border-t hover:bg-muted/20">
      <td className="px-2 py-1 font-mono text-xs">{r.itemCode}</td>
      <td className="px-2 py-1">{r.itemName}</td>
      <td className="px-2 py-1">{r.unit}</td>
      <td className="px-2 py-1 text-right">
        <NumericEditCell
          value={Number(r.qty)}
          display={qtyFmt(Number(r.qty))}
          canEdit={canEdit}
          onCommit={(n) => patchNumeric(r, "qty", n)}
        />
      </td>
      <td className="px-2 py-1 text-right">
        <NumericEditCell
          value={Number(r.unitPrice)}
          display={fmt(Number(r.unitPrice))}
          canEdit={canEdit}
          allowZero
          onCommit={(n) => patchNumeric(r, "unitPrice", n)}
        />
      </td>
      <td className="px-2 py-1 text-right">{fmt(Number(r.totalVnd))}</td>
      <td className="px-2 py-1 text-xs text-muted-foreground">{r.note ?? ""}</td>
      <td className="px-2 py-1 text-right">
        <span className="inline-flex gap-1">
          {canEdit && (
            <button
              type="button"
              className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              onClick={() => setEditTarget(r)}
            >
              Sửa
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              title="Sửa raw (admin): ĐVT / thành tiền / ghi chú"
              onClick={() => setAdminTarget(r)}
            >
              Adm
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="rounded border px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
              onClick={() => handleDelete(r)}
            >
              Xóa
            </button>
          )}
        </span>
      </td>
    </tr>
  );

  const renderSubtotalRow = (
    label: string,
    sums: Sums,
    share: number | null,
    strong: boolean,
    indent = false,
  ) => (
    <tr className={strong ? "bg-muted/40 font-semibold" : "bg-muted/20 font-medium"}>
      <td colSpan={3} className={`px-2 py-1.5 ${indent ? "pl-6" : ""}`}>
        {label}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{sums.count} dòng</span>
      </td>
      <td className="px-2 py-1.5 text-right" title={sums.qty == null ? "Đơn vị khác nhau" : undefined}>
        {sums.qty == null ? "—" : qtyFmt(sums.qty)}
      </td>
      <td className="px-2 py-1.5 text-right" />
      <td className="px-2 py-1.5 text-right">{fmt(sums.totalVnd)}</td>
      <td colSpan={2} className="px-2 py-1.5 text-xs text-muted-foreground">
        {share != null && share > 0 ? `${(share * 100).toFixed(1)}%` : ""}
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dự Toán Gốc</h2>
          <p className="text-sm text-muted-foreground">
            Tổng: <strong>{vndFormatter(grandTotal)}</strong>
          </p>
        </div>
        <Button hidden={!canCreate} onClick={() => setCreateOpen(true)}>
          Thêm hạng mục
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Sửa nhanh: bấm vào ô <strong>SL</strong> hoặc <strong>Đơn giá</strong>. Các cột khác sửa qua nút
        &quot;Sửa&quot; từng dòng. Thành tiền = SL × Đơn giá (tự tính).
      </p>

      <div className="overflow-x-auto rounded border">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left">
              <SortableTableHead column="itemCode" label="Mã" sort={sort} onToggle={toggleSort} className="w-28" />
              <SortableTableHead column="itemName" label="Tên vật tư / công việc" sort={sort} onToggle={toggleSort} />
              <SortableTableHead column="unit" label="ĐVT" sort={sort} onToggle={toggleSort} className="w-16" />
              <SortableTableHead column="qty" label="SL" sort={sort} onToggle={toggleSort} align="right" className="w-28" />
              <SortableTableHead column="unitPrice" label="Đơn giá" sort={sort} onToggle={toggleSort} align="right" className="w-28" />
              <SortableTableHead column="totalVnd" label="Thành tiền" sort={sort} onToggle={toggleSort} align="right" className="w-32" />
              <SortableTableHead column="note" label="Ghi chú" sort={sort} onToggle={toggleSort} className="w-40" />
              <th className="w-28 px-2 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {tree.map((hm) => (
              <HmBlock
                key={hm.hmCode}
                hm={hm}
                grandTotal={grandTotal}
                isCollapsed={collapsed.has(hm.hmCode)}
                onToggle={() => toggle(hm.hmCode)}
                renderItemRow={renderItemRow}
                renderSubtotalRow={renderSubtotalRow}
              />
            ))}
            {tree.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="px-2 py-6 text-center text-muted-foreground">
                  Chưa có dòng dự toán nào.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="sticky bottom-0 bg-muted font-bold">
              <td colSpan={5} className="px-2 py-1.5">TỔNG CỘNG</td>
              <td className="px-2 py-1.5 text-right">{fmt(grandTotal)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

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
              note: editTarget.note ?? undefined,
            }}
            onSubmit={handleEdit}
          />
        )}
      </CrudDialog>

      {adminTarget && (
        <AdminPatchDialog
          projectId={projectId}
          row={adminTarget}
          onClose={() => setAdminTarget(null)}
          onSaved={() => {
            setAdminTarget(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

function HmBlock({
  hm,
  grandTotal,
  isCollapsed,
  onToggle,
  renderItemRow,
  renderSubtotalRow,
}: {
  hm: HmGroup<EstimateRow>;
  grandTotal: number;
  isCollapsed: boolean;
  onToggle: () => void;
  renderItemRow: (r: EstimateRow) => React.ReactNode;
  renderSubtotalRow: (
    label: string,
    sums: Sums,
    share: number | null,
    strong: boolean,
    indent?: boolean,
  ) => React.ReactNode;
}) {
  const hmRows = [...hm.sections.flatMap((s) => s.rows), ...hm.directRows];
  const hmSums = sumRows(hmRows);
  return (
    <>
      <tr className="cursor-pointer border-t bg-muted/40 font-semibold hover:bg-muted/60" onClick={onToggle}>
        <td colSpan={5} className="px-2 py-2">
          <span className="mr-1 inline-block w-4 text-muted-foreground">{isCollapsed ? "▸" : "▾"}</span>
          {hm.hmLabel}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{hmSums.count} dòng</span>
        </td>
        <td className="px-2 py-2 text-right">{fmt(hmSums.totalVnd)}</td>
        <td colSpan={2} className="px-2 py-2 text-xs text-muted-foreground">
          {grandTotal > 0 ? `${((hmSums.totalVnd / grandTotal) * 100).toFixed(1)}% toàn công trình` : ""}
        </td>
      </tr>
      {!isCollapsed &&
        hm.sections.map((section) => (
          <SectionBlock
            key={section.categoryId}
            section={section}
            hmTotal={hmSums.totalVnd}
            renderItemRow={renderItemRow}
            renderSubtotalRow={renderSubtotalRow}
          />
        ))}
      {!isCollapsed && hm.directRows.map(renderItemRow)}
    </>
  );
}

function SectionBlock({
  section,
  hmTotal,
  renderItemRow,
  renderSubtotalRow,
}: {
  section: SectionGroup<EstimateRow>;
  hmTotal: number;
  renderItemRow: (r: EstimateRow) => React.ReactNode;
  renderSubtotalRow: (
    label: string,
    sums: Sums,
    share: number | null,
    strong: boolean,
    indent?: boolean,
  ) => React.ReactNode;
}) {
  const sums = sumRows(section.rows);
  return (
    <>
      {renderSubtotalRow(
        `${section.categoryCode} — ${section.categoryName}`,
        sums,
        hmTotal > 0 ? sums.totalVnd / hmTotal : null,
        false,
        true,
      )}
      {section.rows.map(renderItemRow)}
    </>
  );
}

function AdminPatchDialog({
  projectId,
  row,
  onClose,
  onSaved,
}: {
  projectId: number;
  row: EstimateRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [unit, setUnit] = useState(row.unit);
  const [totalVnd, setTotalVnd] = useState(String(Number(row.totalVnd)));
  const [note, setNote] = useState(row.note ?? "");
  const [isPending, startTransition] = useTransition();

  const save = () => {
    const total = Number(totalVnd.replace(/[,\s]/g, ""));
    if (!Number.isFinite(total)) {
      toast.error("Thành tiền không hợp lệ");
      return;
    }
    startTransition(async () => {
      try {
        await adminPatchEstimate(row.id, { unit, totalVnd: total, note }, projectId);
        toast.success("Đã lưu (admin)");
        onSaved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lưu thất bại");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[420px] rounded-lg border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">Sửa raw (admin)</p>
        <p className="mb-3 text-xs text-muted-foreground">
          {row.itemCode} · {row.itemName}. Ghi trực tiếp, không tính lại SL × Đơn giá.
        </p>
        <label className="mb-2 block text-sm">
          ĐVT
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm" />
        </label>
        <label className="mb-2 block text-sm">
          Thành tiền (VNĐ)
          <input value={totalVnd} onChange={(e) => setTotalVnd(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-right text-sm" />
        </label>
        <label className="mb-3 block text-sm">
          Ghi chú
          <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Hủy</Button>
          <Button size="sm" onClick={save} disabled={isPending}>{isPending ? "Đang lưu…" : "Lưu"}</Button>
        </div>
      </div>
    </div>
  );
}
