"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import {
  patchJournalEntry,
  bulkUpsertJournalEntries,
  softDeleteJournalEntries,
} from "@/lib/tai-chinh/journal-service";

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

interface CategoryOption { id: number; name: string; code: string }
interface CashAccountOption { id: number; name: string }

interface SourceRow {
  id: number;
  date: Date;
  entryType: string;
  amountVnd: string;
  fromAccount: string | null;
  toAccount: string | null;
  fromAccountId: number | null;
  toAccountId: number | null;
  description: string;
  note: string | null;
  expenseCategory: CategoryOption | null;
}

interface JournalRow extends RowWithId {
  date: string;
  entryType: string;
  description: string;
  amountVnd: number;
  fromAccountId: number | null;
  toAccountId: number | null;
  expenseCategoryId: number | null;
  note: string | null;
}

interface Props {
  rows: SourceRow[];
  categories: CategoryOption[];
  cashAccounts: CashAccountOption[];
}

const ENTRY_TYPES: SelectOption[] = [
  { id: "thu", name: "Thu" },
  { id: "chi", name: "Chi" },
  { id: "chuyen_khoan", name: "Chuyển khoản" },
];

export function JournalGridClient({ rows: initial, categories, cashAccounts }: Props) {
  const router = useRouter();
  const categoryOptions: SelectOption[] = categories.map((c) => ({
    id: c.id,
    name: `${c.code} - ${c.name}`,
  }));
  const accountOptions: SelectOption[] = cashAccounts.map((a) => ({ id: a.id, name: a.name }));

  const rows: JournalRow[] = initial.map((r) => ({
    id: r.id,
    date: new Date(r.date).toISOString().slice(0, 10),
    entryType: r.entryType,
    description: r.description,
    amountVnd: Number(r.amountVnd),
    fromAccountId: r.fromAccountId,
    toAccountId: r.toAccountId,
    expenseCategoryId: r.expenseCategory?.id ?? null,
    note: r.note,
  }));

  const columns: DataGridColumn<JournalRow>[] = [
    { id: "date", title: "Ngày", kind: "date", width: 120 },
    { id: "entryType", title: "Loại", kind: "select", width: 130, options: ENTRY_TYPES },
    { id: "description", title: "Nội dung", kind: "text", width: 280 },
    { id: "amountVnd", title: "Số tiền (VND)", kind: "currency", width: 140 },
    { id: "fromAccountId", title: "Nguồn chi", kind: "select", width: 150, options: accountOptions },
    { id: "toAccountId", title: "Nguồn thu", kind: "select", width: 150, options: accountOptions },
    { id: "expenseCategoryId", title: "Phân loại", kind: "select", width: 180, options: categoryOptions },
    { id: "note", title: "Ghi chú", kind: "text", width: 180 },
  ];

  const handlers: DataGridHandlers<JournalRow> = {
    onCellEdit: async (rowId, col, value) => {
      await patchJournalEntry(rowId, { [col]: value });
      router.refresh();
    },
    onBulkPaste: async (patches) => {
      await bulkUpsertJournalEntries(patches as Array<Record<string, unknown> & { id?: number }>);
      router.refresh();
    },
    onAddRow: async (template) => {
      const result = await bulkUpsertJournalEntries([
        {
          date: new Date().toISOString().slice(0, 10),
          entryType: "chi",
          amountVnd: "0",
          description: "",
          ...template,
        },
      ]);
      router.refresh();
      const created = result[0] as { id: number } | undefined;
      if (!created) return;
      return { ...(template as JournalRow), id: created.id };
    },
    onDeleteRows: async (ids) => {
      await softDeleteJournalEntries(ids);
      router.refresh();
    },
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Nhật ký giao dịch</h1>
      <DataGrid<JournalRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        height={600}
        newRowTemplate={{ entryType: "chi", amountVnd: 0, description: "" } as Partial<JournalRow>}
      />
    </div>
  );
}
