"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import {
  bulkUpsertObligationTypes,
  softDeleteObligationTypes,
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

interface ObligationTypeRow extends RowWithId {
  name: string;
  code: string | null;
  category: string;
  openingBalance: number;
  openingDate: string;
  sortOrder: number;
}

interface Props {
  rows: ObligationTypeRow[];
}

const CATEGORIES: SelectOption[] = [
  { id: "thue", name: "Thuế" },
  { id: "bao_hiem", name: "Bảo hiểm" },
  { id: "khac", name: "Khác" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ObligationTypeGridClient({ rows }: Props) {
  const router = useRouter();

  const columns: DataGridColumn<ObligationTypeRow>[] = [
    { id: "name", title: "Tên nghĩa vụ", kind: "text", width: 240 },
    { id: "code", title: "Mã TK", kind: "text", width: 100 },
    { id: "category", title: "Nhóm", kind: "select", width: 130, options: CATEGORIES },
    { id: "openingBalance", title: "Số dư đầu kỳ (VND)", kind: "currency", width: 170 },
    { id: "openingDate", title: "Ngày đầu kỳ", kind: "date", width: 130 },
    { id: "sortOrder", title: "Thứ tự", kind: "number", width: 90 },
  ];

  const handlers: DataGridHandlers<ObligationTypeRow> = {
    onCellEdit: async (rowId, col, value) => {
      await bulkUpsertObligationTypes([{ id: rowId, [col]: value }]);
      router.refresh();
    },
    onBulkPaste: async (patches) => {
      await bulkUpsertObligationTypes(patches as Array<Record<string, unknown> & { id?: number }>);
      router.refresh();
    },
    onAddRow: async (template) => {
      const result = await bulkUpsertObligationTypes([
        {
          name: "",
          category: "khac",
          openingBalance: "0",
          openingDate: today(),
          sortOrder: 0,
          ...template,
        },
      ]);
      router.refresh();
      const created = result[0] as { id: number } | undefined;
      if (!created) return;
      return { ...(template as ObligationTypeRow), id: created.id };
    },
    onDeleteRows: async (ids) => {
      await softDeleteObligationTypes(ids);
      router.refresh();
    },
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Danh mục nghĩa vụ Nhà nước</h1>
      <DataGrid<ObligationTypeRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        height={600}
        newRowTemplate={
          { name: "", category: "khac", openingBalance: 0, openingDate: today(), sortOrder: 0 } as Partial<ObligationTypeRow>
        }
      />
    </div>
  );
}
