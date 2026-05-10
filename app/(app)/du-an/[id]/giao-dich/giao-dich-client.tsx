"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { transactionSchema, type TransactionInput } from "@/lib/du-an/schemas";
import { createTransaction, updateTransaction, softDeleteTransaction, adminPatchTransaction } from "@/lib/du-an/transaction-service";
import { formatDate } from "@/lib/utils/format";
import { vndFormatter } from "@/lib/format";
import { adminEditable } from "@/lib/utils/admin-editable";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  onSelectionChange?: (ids: number[]) => void;
  role?: string;
}) => ReactElement;

type TxRow = {
  id: number; projectId: number; date: Date; transactionType: string;
  categoryId: number; itemCode: string; itemName: string; partyName: string | null;
  qty: unknown; unit: string; unitPriceHd: unknown; unitPriceTt: unknown;
  amountHd: unknown; amountTt: unknown; invoiceNo: string | null; status: string; note: string | null;
};
type CategoryOption = { id: number; code: string; name: string };

const TYPE_LABELS: Record<string, string> = { lay_hang: "Lấy hàng", nhan_cong: "Nhân công", may_moc: "Máy móc" };
const STATUS_LABELS: Record<string, string> = { pending: "Chờ", approved: "Đã duyệt", paid: "Đã thanh toán" };

interface TxGridRow extends RowWithId {
  date: string;
  txTypeLabel: string;
  itemCode: string;
  itemName: string;
  categoryLabel: string;
  partyName: string;
  qty: number;
  unit: string;
  unitPriceHd: number;
  unitPriceTt: number;
  amountHd: number;
  amountTt: number;
  invoiceNo: string;
  status: string;
  note: string;
}

interface Props {
  projectId: number; initialData: TxRow[]; categories: CategoryOption[]; role?: string;
}

function TransactionForm({ projectId, categories, defaultValues, onSubmit }: {
  projectId: number; categories: CategoryOption[];
  defaultValues?: Partial<TransactionInput>; onSubmit: (d: TransactionInput) => Promise<void>;
}) {
  const form = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: { projectId, transactionType: "lay_hang", status: "pending", unitPriceHd: 0, unitPriceTt: 0, categoryId: categories[0]?.id ?? 0, ...defaultValues },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="date" render={({ field }) => (
            <FormItem><FormLabel>Ngày</FormLabel><FormControl><DateInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} name={field.name} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="transactionType" render={({ field }) => (
            <FormItem><FormLabel>Loại</FormLabel><FormControl>
              <select {...field} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="categoryId" render={({ field }) => (
          <FormItem><FormLabel>Hạng mục</FormLabel><FormControl>
            <select {...field} onChange={(e) => field.onChange(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
            </select>
          </FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="itemCode" render={({ field }) => (
            <FormItem><FormLabel>Mã hàng</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="unit" render={({ field }) => (
            <FormItem><FormLabel>ĐVT</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="itemName" render={({ field }) => (
          <FormItem><FormLabel>Tên hàng</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="partyName" render={({ field }) => (
          <FormItem><FormLabel>Nhà cung cấp / Đội</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="qty" render={({ field }) => (
            <FormItem><FormLabel>SL</FormLabel><FormControl>
              <Input type="number" step="0.0001" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="unitPriceHd" render={({ field }) => (
            <FormItem><FormLabel>Đơn giá HĐ</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="unitPriceTt" render={({ field }) => (
            <FormItem><FormLabel>Đơn giá TT</FormLabel><FormControl>
              <Input type="number" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="invoiceNo" render={({ field }) => (
            <FormItem><FormLabel>Số hóa đơn</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem><FormLabel>Trạng thái</FormLabel><FormControl>
              <select {...field} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <div className="flex justify-end pt-2"><Button type="submit">Lưu</Button></div>
      </form>
    </Form>
  );
}

export function GiaoDichClient({ projectId, initialData, categories, role }: Props) {
  const isAdmin = role === "admin";
  const ADMIN_RAW_COLS = new Set<keyof TxGridRow>(["amountHd", "amountTt"]);
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TxRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, `${c.code} - ${c.name}`]));
  const totalTt = initialData.reduce((s, r) => s + Number(r.amountTt), 0);
  const totalHd = initialData.reduce((s, r) => s + Number(r.amountHd), 0);
  const rowsById = new Map(initialData.map((r) => [r.id, r]));

  const rows: TxGridRow[] = initialData.map((r) => ({
    id: r.id,
    date: formatDate(r.date, ""),
    txTypeLabel: TYPE_LABELS[r.transactionType] ?? r.transactionType,
    itemCode: r.itemCode,
    itemName: r.itemName,
    categoryLabel: categoryMap[r.categoryId] ?? "",
    partyName: r.partyName ?? "",
    qty: Number(r.qty),
    unit: r.unit,
    unitPriceHd: Number(r.unitPriceHd),
    unitPriceTt: Number(r.unitPriceTt),
    amountHd: Number(r.amountHd),
    amountTt: Number(r.amountTt),
    invoiceNo: r.invoiceNo ?? "",
    status: r.status,
    note: r.note ?? "",
  }));

  const statusOptions: SelectOption[] = Object.entries(STATUS_LABELS).map(([v, l]) => ({ id: v, name: l }));

  const patchTx = async (id: number, patch: Partial<TxGridRow>) => {
    const current = rowsById.get(id);
    if (!current) throw new Error(`#${id} không tồn tại`);
    const input: TransactionInput = {
      projectId,
      date: new Date(current.date).toISOString().split("T")[0],
      transactionType: current.transactionType as TransactionInput["transactionType"],
      categoryId: current.categoryId,
      itemCode: current.itemCode,
      itemName: typeof patch.itemName === "string" ? patch.itemName : current.itemName,
      partyName: typeof patch.partyName === "string" ? (patch.partyName || undefined) : (current.partyName ?? undefined),
      qty: typeof patch.qty === "number" ? patch.qty : Number(current.qty),
      unit: typeof patch.unit === "string" ? patch.unit : current.unit,
      unitPriceHd: typeof patch.unitPriceHd === "number" ? patch.unitPriceHd : Number(current.unitPriceHd),
      unitPriceTt: typeof patch.unitPriceTt === "number" ? patch.unitPriceTt : Number(current.unitPriceTt),
      invoiceNo: typeof patch.invoiceNo === "string" ? (patch.invoiceNo || undefined) : (current.invoiceNo ?? undefined),
      status: (typeof patch.status === "string" ? patch.status : current.status) as TransactionInput["status"],
      note: typeof patch.note === "string" ? (patch.note || undefined) : (current.note ?? undefined),
    };
    await updateTransaction(id, input);
  };

  const columns: DataGridColumn<TxGridRow>[] = [
    { id: "date", title: "Ngày", kind: "text", width: 100, readonly: true },
    { id: "txTypeLabel", title: "Loại", kind: "text", width: 100, readonly: true },
    { id: "itemCode", title: "Mã hàng", kind: "text", width: 100, readonly: true },
    { id: "itemName", title: "Tên hàng", kind: "text", width: 220 },
    { id: "categoryLabel", title: "Hạng mục", kind: "text", width: 130, readonly: true },
    { id: "partyName", title: "Nhà cung cấp", kind: "text", width: 140 },
    { id: "qty", title: "SL", kind: "number", width: 90 },
    { id: "unit", title: "ĐVT", kind: "text", width: 60 },
    { id: "unitPriceHd", title: "ĐG HĐ", kind: "currency", width: 120 },
    { id: "unitPriceTt", title: "ĐG TT", kind: "currency", width: 120 },
    { id: "amountHd", title: "Giá trị HĐ", kind: "currency", width: 130, readonly: adminEditable<TxGridRow>(true) },
    { id: "amountTt", title: "Giá trị TT", kind: "currency", width: 130, readonly: adminEditable<TxGridRow>(true) },
    { id: "invoiceNo", title: "Số HĐ", kind: "text", width: 100 },
    {
      id: "status", title: "TT", kind: "select", width: 110, options: statusOptions,
      format: (v) => STATUS_LABELS[String(v)] ?? "",
    },
    { id: "note", title: "Ghi chú", kind: "text", width: 200 },
  ];

  const handlers: DataGridHandlers<TxGridRow> = {
    onCellEdit: async (id, col, value) => {
      try {
        if (isAdmin && ADMIN_RAW_COLS.has(col as keyof TxGridRow)) {
          await adminPatchTransaction(id, { [col]: value } as Partial<{ amountHd: number; amountTt: number }>, projectId);
        } else {
          await patchTx(id, { [col]: value } as Partial<TxGridRow>);
        }
        toast.success("Đã lưu");
        startTransition(() => router.refresh());
      } catch (err) {
        toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
        startTransition(() => router.refresh());
      }
    },
    onDeleteRows: async (ids) => {
      for (const id of ids) {
        await softDeleteTransaction(id, projectId);
      }
      startTransition(() => router.refresh());
    },
  };

  const editSelected = () => {
    if (selectedIds.length !== 1) return;
    const target = rowsById.get(selectedIds[0]);
    if (target) setEditTarget(target);
  };

  async function handleCreate(data: TransactionInput) {
    await createTransaction(data);
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(data: TransactionInput) {
    if (!editTarget) return;
    await updateTransaction(editTarget.id, data);
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Giao dịch dự án</h2>
          <p className="text-sm text-muted-foreground">
            HĐ: <strong>{vndFormatter(totalHd)}</strong> | TT: <strong>{vndFormatter(totalTt)}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={selectedIds.length !== 1} onClick={editSelected}>
            Sửa đầy đủ
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Thêm giao dịch</Button>
        </div>
      </div>

      <DataGrid<TxGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        height={500}
        onSelectionChange={setSelectedIds}
        role={role}
      />

      <CrudDialog title="Thêm giao dịch" open={createOpen} onOpenChange={setCreateOpen}>
        <TransactionForm projectId={projectId} categories={categories} onSubmit={handleCreate} />
      </CrudDialog>
      <CrudDialog title="Sửa giao dịch" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <TransactionForm projectId={projectId} categories={categories}
            defaultValues={{ projectId, date: new Date(editTarget.date).toISOString().split("T")[0], transactionType: editTarget.transactionType as TransactionInput["transactionType"], categoryId: editTarget.categoryId, itemCode: editTarget.itemCode, itemName: editTarget.itemName, partyName: editTarget.partyName ?? "", qty: Number(editTarget.qty), unit: editTarget.unit, unitPriceHd: Number(editTarget.unitPriceHd), unitPriceTt: Number(editTarget.unitPriceTt), invoiceNo: editTarget.invoiceNo ?? "", status: editTarget.status as TransactionInput["status"] }}
            onSubmit={handleEdit} />
        )}
      </CrudDialog>
    </div>
  );
}
