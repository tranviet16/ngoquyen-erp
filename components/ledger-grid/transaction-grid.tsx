"use client";

import { useMemo, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, SelectOption } from "@/components/data-grid";
import { adminEditable } from "@/lib/utils/admin-editable";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends { id: number }>(props: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  newRowTemplate?: Partial<T>;
  role?: string;
}) => ReactElement;

export interface TxRow {
  id: number;
  date: string;
  transactionType: string;
  entityId: number;
  partyId: number;
  projectId: number | null;
  itemId: number | null;
  amountTt: string;
  vatPctTt: string;
  vatTt: string;
  totalTt: string;
  amountHd: string;
  vatPctHd: string;
  vatHd: string;
  totalHd: string;
  invoiceNo: string | null;
  content: string | null;
  status: string;
  note: string | null;
}

export interface TxActions {
  patch: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
  adminPatch?: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
  bulkUpsert: (rows: Array<Record<string, unknown> & { id?: number }>) => Promise<unknown[]>;
  softDeleteMany: (ids: number[]) => Promise<void>;
}

const ADMIN_RAW_COLS = new Set<keyof TxRow>(["totalTt", "totalHd"]);

interface Props {
  initialData: TxRow[];
  entities: SelectOption[];
  partyOptions: SelectOption[];
  projects: SelectOption[];
  items: SelectOption[];
  partyLabel: string;
  defaults: { entityId: number; partyId: number };
  actions: TxActions;
  role?: string;
}

const TX_TYPES: SelectOption[] = [
  { id: "lay_hang", name: "Lấy hàng" },
  { id: "thanh_toan", name: "Thanh toán" },
  { id: "dieu_chinh", name: "Điều chỉnh" },
];

const STATUS_OPTIONS: SelectOption[] = [
  { id: "pending", name: "Chờ" },
  { id: "approved", name: "Đã duyệt" },
  { id: "paid", name: "Đã trả" },
];

export function dbTxToRow(t: Record<string, unknown>): TxRow {
  const date = t.date as Date | string;
  return {
    id: Number(t.id),
    date: date instanceof Date ? date.toISOString() : String(date),
    transactionType: String(t.transactionType),
    entityId: Number(t.entityId),
    partyId: Number(t.partyId),
    projectId: t.projectId == null ? null : Number(t.projectId),
    itemId: t.itemId == null ? null : Number(t.itemId),
    amountTt: String(t.amountTt),
    vatPctTt: String(t.vatPctTt),
    vatTt: String(t.vatTt),
    totalTt: String(t.totalTt),
    amountHd: String(t.amountHd),
    vatPctHd: String(t.vatPctHd),
    vatHd: String(t.vatHd),
    totalHd: String(t.totalHd),
    invoiceNo: (t.invoiceNo as string | null) ?? null,
    content: (t.content as string | null) ?? null,
    status: String(t.status ?? "pending"),
    note: (t.note as string | null) ?? null,
  };
}

export function LedgerTransactionGrid({
  initialData,
  entities,
  partyOptions,
  projects,
  items,
  partyLabel,
  defaults,
  actions,
  role,
}: Props) {
  const router = useRouter();

  const columns = useMemo<DataGridColumn<TxRow>[]>(
    () => [
      { id: "date", title: "Ngày", kind: "date", width: 110 },
      { id: "transactionType", title: "Loại GD", kind: "select", width: 110, options: TX_TYPES },
      { id: "entityId", title: "Chủ thể", kind: "select", width: 140, options: entities },
      { id: "partyId", title: partyLabel, kind: "select", width: 160, options: partyOptions },
      { id: "projectId", title: "Dự án", kind: "select", width: 140, options: projects },
      { id: "itemId", title: "Hạng mục", kind: "select", width: 140, options: items },
      { id: "content", title: "Nội dung", kind: "text", width: 200 },
      { id: "amountTt", title: "Tiền TT", kind: "currency", width: 120 },
      { id: "vatPctTt", title: "VAT% TT", kind: "number", width: 90 },
      { id: "totalTt", title: "Tổng TT", kind: "currency", width: 120, readonly: adminEditable<TxRow>(true) },
      { id: "amountHd", title: "Tiền HĐ", kind: "currency", width: 120 },
      { id: "vatPctHd", title: "VAT% HĐ", kind: "number", width: 90 },
      { id: "totalHd", title: "Tổng HĐ", kind: "currency", width: 120, readonly: adminEditable<TxRow>(true) },
      { id: "invoiceNo", title: "Số HĐ", kind: "text", width: 110 },
      { id: "status", title: "TT", kind: "select", width: 100, options: STATUS_OPTIONS },
      { id: "note", title: "Ghi chú", kind: "text", width: 160 },
    ],
    [entities, partyOptions, projects, items, partyLabel],
  );

  const handlers: DataGridHandlers<TxRow> = {
    onCellEdit: async (rowId, col, value) => {
      const isAdmin = role === "admin";
      const useAdmin = isAdmin && actions.adminPatch && ADMIN_RAW_COLS.has(col as keyof TxRow);
      const updated = useAdmin
        ? await actions.adminPatch!(rowId, { [col]: value })
        : await actions.patch(rowId, { [col]: value });
      router.refresh();
      return dbTxToRow(updated as Record<string, unknown>);
    },
    onBulkPaste: async (patches) => {
      const result = await actions.bulkUpsert(
        patches.map((p) => p as Record<string, unknown> & { id?: number }),
      );
      router.refresh();
      return (result as Record<string, unknown>[]).map(dbTxToRow);
    },
    onAddRow: async (template) => {
      const today = new Date().toISOString().slice(0, 10);
      const stub: Record<string, unknown> = {
        date: today,
        transactionType: "lay_hang",
        entityId: defaults.entityId,
        partyId: defaults.partyId,
        projectId: null,
        itemId: null,
        amountTt: "0",
        vatPctTt: "0",
        amountHd: "0",
        vatPctHd: "0",
        invoiceNo: null,
        content: null,
        status: "pending",
        note: null,
        ...(template as Record<string, unknown>),
      };
      try {
        const result = await actions.bulkUpsert([stub]);
        router.refresh();
        return dbTxToRow(result[0] as Record<string, unknown>);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lỗi tạo dòng — chọn Chủ thể & đối tác trước");
        throw err;
      }
    },
    onDeleteRows: async (ids) => {
      await actions.softDeleteMany(ids);
      router.refresh();
    },
  };

  return (
    <DataGrid<TxRow>
      columns={columns}
      rows={initialData}
      handlers={handlers}
      height={600}
      role={role}
    />
  );
}
