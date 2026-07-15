"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import {
  bulkUpsertObligationTxns,
  softDeleteObligationTxns,
} from "@/lib/tai-chinh/state-obligation-service";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  newRowTemplate?: Partial<T>;
}) => ReactElement;

interface ObligationTxnRow extends RowWithId {
  typeId: number | null;
  date: string;
  kind: string;
  amount: number;
  cashAccountId: number | null;
  refNo: string | null;
  description: string | null;
  note: string | null;
}

interface Props {
  rows: ObligationTxnRow[];
  types: SelectOption[];
  cashAccounts: SelectOption[];
}

const KINDS: SelectOption[] = [
  { id: "phai_tra", name: "Phải trả" },
  { id: "da_nop", name: "Đã nộp" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ObligationTxnGridClient({ rows, types, cashAccounts }: Props) {
  const router = useRouter();

  const columns: DataGridColumn<ObligationTxnRow>[] = [
    { id: "typeId", title: "Nghĩa vụ", kind: "select", width: 220, options: types },
    { id: "date", title: "Ngày", kind: "date", width: 120 },
    { id: "kind", title: "Loại", kind: "select", width: 120, options: KINDS },
    { id: "amount", title: "Số tiền (VND)", kind: "currency", width: 150 },
    { id: "cashAccountId", title: "TK tiền", kind: "select", width: 160, options: cashAccounts },
    { id: "refNo", title: "Chứng từ", kind: "text", width: 130 },
    { id: "description", title: "Nội dung", kind: "text", width: 240 },
    { id: "note", title: "Ghi chú", kind: "text", width: 180 },
  ];

  const handlers: DataGridHandlers<ObligationTxnRow> = {
    onCellEdit: async (rowId, col, value) => {
      await bulkUpsertObligationTxns([{ id: rowId, [col]: value }]);
      router.refresh();
    },
    onBulkPaste: async (patches) => {
      await bulkUpsertObligationTxns(patches as Array<Record<string, unknown> & { id?: number }>);
      router.refresh();
    },
    onAddRow: async (template) => {
      const result = await bulkUpsertObligationTxns([
        {
          date: today(),
          kind: "phai_tra",
          amount: "0",
          ...template,
        },
      ]);
      router.refresh();
      const created = result[0] as { id: number } | undefined;
      if (!created) return;
      return { ...(template as ObligationTxnRow), id: created.id };
    },
    onDeleteRows: async (ids) => {
      await softDeleteObligationTxns(ids);
      router.refresh();
    },
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Sổ theo dõi nghĩa vụ Nhà nước</h1>
      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Khoản <strong>đã nộp</strong> sẽ tự sinh bút toán chi — không nhập lại ở Nhật ký giao dịch để tránh đếm trùng dòng tiền.
      </p>
      <DataGrid<ObligationTxnRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        height={600}
        newRowTemplate={{ kind: "phai_tra", amount: 0, date: today() } as Partial<ObligationTxnRow>}
      />
    </div>
  );
}
