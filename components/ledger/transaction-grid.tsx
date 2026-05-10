"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { vndFormatter } from "@/lib/format";
import { formatDate } from "@/lib/utils/format";
import type { TransactionInput } from "@/lib/cong-no-vt/schemas";
import { TransactionFormDialog } from "./transaction-form-dialog";

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

export interface TransactionRow {
  id: number;
  date: string;
  transactionType: string;
  entityId: number;
  entityName: string;
  partyId: number;
  partyName: string;
  projectId: number | null;
  projectName: string | null;
  itemId: number | null;
  amountTt: unknown;
  vatPctTt: unknown;
  vatTt: unknown;
  totalTt: unknown;
  amountHd: unknown;
  vatPctHd: unknown;
  vatHd: unknown;
  totalHd: unknown;
  invoiceNo: string | null;
  content: string | null;
  status: string;
  note: string | null;
}

export interface LookupOption {
  id: number;
  name: string;
}

interface Props {
  initialData: TransactionRow[];
  partyLabel: string;
  entities: LookupOption[];
  partyOptions: LookupOption[];
  projects: LookupOption[];
  items: LookupOption[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCreate: (data: TransactionInput) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (id: number, data: TransactionInput) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDelete: (id: number) => Promise<any>;
  title: string;
}

const TX_TYPE_LABELS: Record<string, string> = {
  lay_hang: "Lấy hàng",
  thanh_toan: "Thanh toán",
  dieu_chinh: "Điều chỉnh",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ",
  approved: "Đã duyệt",
  paid: "Đã trả",
};

interface TxGridRow extends RowWithId {
  date: string;
  txTypeLabel: string;
  entityName: string;
  partyName: string;
  projectName: string;
  content: string;
  amountTt: number;
  vatPctTt: number;
  totalTt: number;
  amountHd: number;
  vatPctHd: number;
  totalHd: number;
  invoiceNo: string;
  status: string;
}

export function TransactionGrid({
  initialData, partyLabel, entities, partyOptions, projects, items,
  onCreate, onUpdate, onDelete, title,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TransactionRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const rowsById = new Map(initialData.map((r) => [r.id, r]));

  function refresh() {
    startTransition(() => router.refresh());
  }

  const rows: TxGridRow[] = initialData.map((r) => ({
    id: r.id,
    date: formatDate(new Date(r.date), ""),
    txTypeLabel: TX_TYPE_LABELS[r.transactionType] ?? r.transactionType,
    entityName: r.entityName,
    partyName: r.partyName,
    projectName: r.projectName ?? "",
    content: r.content ?? "",
    amountTt: Number(r.amountTt),
    vatPctTt: Number(r.vatPctTt),
    totalTt: Number(r.totalTt),
    amountHd: Number(r.amountHd),
    vatPctHd: Number(r.vatPctHd),
    totalHd: Number(r.totalHd),
    invoiceNo: r.invoiceNo ?? "",
    status: r.status,
  }));

  const statusOptions: SelectOption[] = Object.entries(STATUS_LABELS).map(([v, l]) => ({ id: v, name: l }));

  const patchTx = async (id: number, patch: Partial<TxGridRow>) => {
    const current = rowsById.get(id);
    if (!current) throw new Error(`GD #${id} không tồn tại`);
    const input: TransactionInput = {
      date: current.date,
      transactionType: current.transactionType as "lay_hang" | "thanh_toan" | "dieu_chinh",
      entityId: current.entityId,
      partyId: current.partyId,
      projectId: current.projectId,
      itemId: current.itemId,
      amountTt: typeof patch.amountTt === "number" ? String(patch.amountTt) : String(current.amountTt),
      vatPctTt: String(current.vatPctTt),
      amountHd: typeof patch.amountHd === "number" ? String(patch.amountHd) : String(current.amountHd),
      vatPctHd: String(current.vatPctHd),
      invoiceNo: typeof patch.invoiceNo === "string" ? (patch.invoiceNo || null) : current.invoiceNo,
      content: typeof patch.content === "string" ? (patch.content || null) : current.content,
      status: (typeof patch.status === "string" ? patch.status : current.status) as "pending" | "approved" | "paid",
      note: current.note,
    };
    await onUpdate(id, input);
  };

  const columns: DataGridColumn<TxGridRow>[] = [
    { id: "date", title: "Ngày", kind: "text", width: 110, readonly: true },
    { id: "txTypeLabel", title: "Loại GD", kind: "text", width: 110, readonly: true },
    { id: "entityName", title: "Chủ thể", kind: "text", width: 140, readonly: true },
    { id: "partyName", title: partyLabel, kind: "text", width: 140, readonly: true },
    { id: "projectName", title: "Dự án", kind: "text", width: 120, readonly: true },
    { id: "content", title: "Nội dung", kind: "text", width: 200 },
    { id: "amountTt", title: "Tiền TT", kind: "currency", width: 120 },
    {
      id: "vatPctTt", title: "VAT% TT", kind: "number", width: 90, readonly: true,
      format: (v) => v != null ? `${(Number(v) * 100).toFixed(0)}%` : "",
    },
    { id: "totalTt", title: "Tổng TT", kind: "currency", width: 120, readonly: true },
    { id: "amountHd", title: "Tiền HĐ", kind: "currency", width: 120 },
    {
      id: "vatPctHd", title: "VAT% HĐ", kind: "number", width: 90, readonly: true,
      format: (v) => v != null ? `${(Number(v) * 100).toFixed(0)}%` : "",
    },
    { id: "totalHd", title: "Tổng HĐ", kind: "currency", width: 120, readonly: true },
    { id: "invoiceNo", title: "Số HĐ", kind: "text", width: 110 },
    {
      id: "status", title: "TT", kind: "select", width: 100, options: statusOptions,
      format: (v) => STATUS_LABELS[String(v)] ?? String(v ?? ""),
    },
  ];

  const handlers: DataGridHandlers<TxGridRow> = {
    onCellEdit: async (id, col, value) => {
      try {
        await patchTx(id, { [col]: value } as Partial<TxGridRow>);
        toast.success("Đã lưu");
        refresh();
      } catch (err) {
        toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
        refresh();
      }
    },
    onDeleteRows: async (ids) => {
      for (const id of ids) {
        await onDelete(id);
      }
      refresh();
    },
  };

  const editSelected = () => {
    if (selectedIds.length !== 1) return;
    const target = rowsById.get(selectedIds[0]);
    if (target) setEditTarget(target);
  };

  const grandTotalTt = initialData.reduce((s, r) => s + Number(r.totalTt), 0);
  const grandTotalHd = initialData.reduce((s, r) => s + Number(r.totalHd), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Tổng TT: <strong>{vndFormatter(grandTotalTt)}</strong> | Tổng HĐ: <strong>{vndFormatter(grandTotalHd)}</strong>
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
        height={550}
        onSelectionChange={setSelectedIds}
      />

      <TransactionFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Thêm giao dịch"
        partyLabel={partyLabel}
        entities={entities}
        partyOptions={partyOptions}
        projects={projects}
        items={items}
        onSubmit={async (data) => {
          await onCreate(data);
          setCreateOpen(false);
          refresh();
        }}
      />

      <TransactionFormDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        title="Sửa giao dịch"
        partyLabel={partyLabel}
        entities={entities}
        partyOptions={partyOptions}
        projects={projects}
        items={items}
        defaultValues={editTarget ?? undefined}
        onSubmit={async (data) => {
          if (!editTarget) return;
          await onUpdate(editTarget.id, data);
          setEditTarget(null);
          refresh();
        }}
      />
    </div>
  );
}
