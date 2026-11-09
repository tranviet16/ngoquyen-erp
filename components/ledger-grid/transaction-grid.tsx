"use client";

import { useMemo, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, SelectOption } from "@/components/data-grid";
import { adminEditable } from "@/lib/utils/admin-editable";
import { TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS, type TransactionType } from "@/lib/ledger/transaction-classification";
import { NEW_ROW_PROJECT_REQUIRED_MESSAGE, NewRowProjectSelect } from "./new-row-project-select";
import { unwrapActionResult } from "./unwrap-action-result";

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

/**
 * Server action của lưới. Mỗi action trả thẳng dữ liệu (sổ nhân công, ném khi lỗi) hoặc
 * `{ ok, row | rows } | { ok: false, message }` (sổ vật tư) — xem unwrapActionResult.
 */
export interface TxActions {
  patch: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
  adminPatch?: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
  bulkUpsert: (rows: Array<Record<string, unknown> & { id?: number }>) => Promise<unknown>;
  softDeleteMany: (ids: number[]) => Promise<unknown>;
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
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isAdmin?: boolean;
  role?: string;
  /** Loại giao dịch cho phép chọn; mặc định tất cả (sổ nhân công không có thue_hd). */
  allowedTypes?: readonly TransactionType[];
  /** Sổ vật tư: bắt buộc chọn công trình trước khi tạo dòng (sổ nhân công không truyền). */
  requireProject?: boolean;
}

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
  canCreate,
  canEdit,
  canDelete,
  isAdmin = false,
  allowedTypes = TRANSACTION_TYPES,
  requireProject = false,
}: Props) {
  const router = useRouter();
  const [newRowProjectId, setNewRowProjectId] = useState<number | null>(null);

  const txTypeOptions = useMemo<SelectOption[]>(
    () => allowedTypes.map((t) => ({ id: t, name: TRANSACTION_TYPE_LABELS[t] })),
    [allowedTypes],
  );

  const columns = useMemo<DataGridColumn<TxRow>[]>(
    () => [
      { id: "date", title: "Ngày", kind: "date", width: 110, sortable: true, filterable: true, filterKind: "date" },
      { id: "transactionType", title: "Loại GD", kind: "select", width: 110, options: txTypeOptions, sortable: true, filterable: true, filterKind: "select" },
      // entityId/partyId/projectId/itemId: plain integer FKs (no Prisma join); sort by option name via kind:"select" + options
      { id: "entityId", title: "Chủ thể", kind: "select", width: 140, options: entities, sortable: true, filterable: true, filterKind: "select" },
      { id: "partyId", title: partyLabel, kind: "select", width: 160, options: partyOptions, sortable: true, filterable: true, filterKind: "select" },
      { id: "projectId", title: "Dự án", kind: "select", width: 140, options: projects, sortable: true, filterable: true, filterKind: "select" },
      { id: "itemId", title: "Hạng mục", kind: "select", width: 140, options: items, sortable: true, filterable: true, filterKind: "select" },
      { id: "content", title: "Nội dung", kind: "text", width: 200, sortable: true, filterable: true, filterKind: "text" },
      { id: "amountTt", title: "Tiền TT", kind: "currency", width: 120, sortable: true },
      { id: "vatPctTt", title: "VAT% TT", kind: "number", width: 90, sortable: true },
      { id: "totalTt", title: "Tổng TT", kind: "currency", width: 120, readonly: adminEditable<TxRow>(true), sortable: true },
      { id: "amountHd", title: "Tiền HĐ", kind: "currency", width: 120, sortable: true },
      { id: "vatPctHd", title: "VAT% HĐ", kind: "number", width: 90, sortable: true },
      { id: "totalHd", title: "Tổng HĐ", kind: "currency", width: 120, readonly: adminEditable<TxRow>(true), sortable: true },
      { id: "invoiceNo", title: "Số HĐ", kind: "text", width: 110, sortable: true, filterable: true, filterKind: "text" },
      { id: "status", title: "TT", kind: "select", width: 100, options: STATUS_OPTIONS, sortable: true, filterable: true, filterKind: "select" },
      { id: "note", title: "Ghi chú", kind: "text", width: 160, filterable: true, filterKind: "text" },
    ],
    [entities, partyOptions, projects, items, partyLabel, txTypeOptions],
  );

  const handlers: DataGridHandlers<TxRow> = {
    ...(canEdit ? { onCellEdit: async (rowId: number, col: string, value: unknown) => {
      const useAdmin = isAdmin && actions.adminPatch && ADMIN_RAW_COLS.has(col as keyof TxRow);
      const updated = unwrapActionResult(
        useAdmin
          ? await actions.adminPatch!(rowId, { [col]: value })
          : await actions.patch(rowId, { [col]: value }),
        "row",
      );
      router.refresh();
      return dbTxToRow(updated as Record<string, unknown>);
    }, onBulkPaste: async (patches: Array<Partial<TxRow>>) => {
      const result = unwrapActionResult(await actions.bulkUpsert(
        patches.map((p) => {
          // Dòng dán mới thiếu công trình lấy "Công trình cho dòng mới" (server vẫn kiểm bắt buộc).
          const row = p as Record<string, unknown> & { id?: number };
          return requireProject && !row.id && row.projectId == null && newRowProjectId != null
            ? { ...row, projectId: newRowProjectId }
            : row;
        }),
      ), "rows");
      router.refresh();
      return (result as Record<string, unknown>[]).map(dbTxToRow);
    } } : {}),
    ...(canCreate ? { onAddRow: async (template: Partial<TxRow>) => {
      const projectId = template.projectId ?? newRowProjectId;
      if (requireProject && projectId == null) {
        toast.error(NEW_ROW_PROJECT_REQUIRED_MESSAGE);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const stub: Record<string, unknown> = {
        date: today,
        transactionType: "lay_hang",
        entityId: defaults.entityId,
        partyId: defaults.partyId,
        projectId: projectId ?? null,
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
        const result = unwrapActionResult(await actions.bulkUpsert([stub]), "rows") as Record<string, unknown>[];
        router.refresh();
        return dbTxToRow(result[0]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lỗi tạo dòng — chọn Chủ thể & đối tác trước");
        throw err;
      }
    } } : {}),
    ...(canDelete ? { onDeleteRows: async (ids: number[]) => {
      unwrapActionResult(await actions.softDeleteMany(ids));
      router.refresh();
    } } : {}),
  };

  const grid = (
    <DataGrid<TxRow>
      columns={columns}
      rows={initialData}
      handlers={handlers}
      height={600}
      role={isAdmin ? "admin" : undefined}
    />
  );
  if (!requireProject || !canCreate) return grid;
  return (
    <div className="space-y-2">
      <NewRowProjectSelect projects={projects} value={newRowProjectId} onChange={setNewRowProjectId} />
      {grid}
    </div>
  );
}
