"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type ColDef, type CellValueChangedEvent } from "ag-grid-community";
import { AgGridBase, VND_COL_DEF, vndFormatter } from "@/components/ag-grid-base";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import {
  createMaterialTransaction,
  updateMaterialTransaction,
  softDeleteMaterialTransaction,
} from "@/lib/cong-no-vt/material-ledger-service";
import { TransactionFormDialog } from "./transaction-form-dialog";

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
  entities: LookupOption[];
  suppliers: LookupOption[];
  projects: LookupOption[];
  items: LookupOption[];
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

export function TransactionGrid({ initialData, entities, suppliers, projects, items }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TransactionRow | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function handleCellValueChanged(event: CellValueChangedEvent<TransactionRow>) {
    const row = event.data;
    try {
      await updateMaterialTransaction(row.id, {
        date: row.date,
        transactionType: row.transactionType as "lay_hang" | "thanh_toan" | "dieu_chinh",
        entityId: row.entityId,
        partyId: row.partyId,
        projectId: row.projectId,
        itemId: row.itemId,
        amountTt: String(row.amountTt),
        vatPctTt: String(row.vatPctTt),
        amountHd: String(row.amountHd),
        vatPctHd: String(row.vatPctHd),
        invoiceNo: row.invoiceNo,
        content: row.content,
        status: (row.status as "pending" | "approved" | "paid") ?? "pending",
        note: row.note,
      });
      toast.success("Đã lưu");
      refresh();
    } catch (err) {
      toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
      refresh();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "date", headerName: "Ngày", width: 110, valueFormatter: (p) => p.value ? new Date(p.value).toLocaleDateString("vi-VN") : "" },
    { field: "transactionType", headerName: "Loại GD", width: 110, valueFormatter: (p) => TX_TYPE_LABELS[p.value] ?? p.value },
    { field: "entityName", headerName: "Chủ thể", flex: 1, minWidth: 120 },
    { field: "partyName", headerName: "NCC", flex: 1, minWidth: 120 },
    { field: "projectName", headerName: "Dự án", width: 120 },
    { field: "content", headerName: "Nội dung", flex: 1, minWidth: 140, editable: true },
    // TT columns
    { field: "amountTt", headerName: "Tiền TT", ...VND_COL_DEF, width: 120, editable: true },
    { field: "vatPctTt", headerName: "VAT% TT", width: 90, type: "numericColumn", cellStyle: { textAlign: "right" },
      valueFormatter: (p) => p.value != null ? `${(Number(p.value) * 100).toFixed(0)}%` : "" },
    { field: "totalTt", headerName: "Tổng TT", ...VND_COL_DEF, width: 120 },
    // HĐ columns
    { field: "amountHd", headerName: "Tiền HĐ", ...VND_COL_DEF, width: 120, editable: true },
    { field: "vatPctHd", headerName: "VAT% HĐ", width: 90, type: "numericColumn", cellStyle: { textAlign: "right" },
      valueFormatter: (p) => p.value != null ? `${(Number(p.value) * 100).toFixed(0)}%` : "" },
    { field: "totalHd", headerName: "Tổng HĐ", ...VND_COL_DEF, width: 120 },
    { field: "invoiceNo", headerName: "Số HĐ", width: 110, editable: true },
    { field: "status", headerName: "TT", width: 90, valueFormatter: (p) => STATUS_LABELS[p.value] ?? p.value },
    {
      headerName: "Thao tác", width: 110, pinned: "right",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cellRenderer: (p: { data: TransactionRow }) => (
        <div className="flex gap-1 items-center h-full">
          <Button variant="outline" size="sm" onClick={() => setEditTarget(p.data)}>Sửa</Button>
          <DeleteConfirmDialog
            itemName={`GD ${p.data.id}`}
            onConfirm={async () => { await softDeleteMaterialTransaction(p.data.id); refresh(); }}
            trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>}
          />
        </div>
      ),
    },
  ];

  // Grand totals
  const grandTotalTt = initialData.reduce((s, r) => s + Number(r.totalTt), 0);
  const grandTotalHd = initialData.reduce((s, r) => s + Number(r.totalHd), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Nhập liệu công nợ vật tư</h2>
          <p className="text-sm text-muted-foreground">
            Tổng TT: <strong>{vndFormatter(grandTotalTt)}</strong> | Tổng HĐ: <strong>{vndFormatter(grandTotalHd)}</strong>
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Thêm giao dịch</Button>
      </div>

      <AgGridBase
        rowData={initialData}
        columnDefs={colDefs}
        height={550}
        gridOptions={{ onCellValueChanged: handleCellValueChanged }}
      />

      <TransactionFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Thêm giao dịch"
        entities={entities}
        suppliers={suppliers}
        projects={projects}
        items={items}
        onSubmit={async (data) => {
          await createMaterialTransaction(data);
          setCreateOpen(false);
          refresh();
        }}
      />

      <TransactionFormDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        title="Sửa giao dịch"
        entities={entities}
        suppliers={suppliers}
        projects={projects}
        items={items}
        defaultValues={editTarget ?? undefined}
        onSubmit={async (data) => {
          if (!editTarget) return;
          await updateMaterialTransaction(editTarget.id, data);
          setEditTarget(null);
          refresh();
        }}
      />
    </div>
  );
}
