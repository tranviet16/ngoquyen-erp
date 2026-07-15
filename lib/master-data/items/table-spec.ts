/**
 * ResourceSpec + ColumnDef for Item list table.
 * Searchable: code, name. Sortable + filterable derived from ColumnDef kinds.
 */
import { deriveResourceSpec } from "@/lib/table/derive-spec";
import type { ResourceSpec } from "@/lib/table/types";
import type { ColumnDef } from "@/components/data-table/types";

const TYPE_LABELS: Record<string, string> = {
  material: "Vật liệu",
  labor: "Nhân công",
  machine: "Máy móc",
};

export const ITEM_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  {
    key: "code",
    header: "Mã",
    kind: "text",
    className: "w-[120px]",
    editable: true,
    editKind: "text",
  },
  {
    key: "name",
    header: "Tên vật tư / hạng mục",
    kind: "text",
    editable: true,
    editKind: "text",
  },
  {
    key: "unit",
    header: "ĐVT",
    kind: "text",
    className: "w-[80px]",
    editable: true,
    editKind: "text",
  },
  {
    key: "type",
    header: "Loại",
    kind: "select",
    className: "w-[100px]",
    filterOptions: [
      { id: "material", name: "Vật liệu" },
      { id: "labor", name: "Nhân công" },
      { id: "machine", name: "Máy móc" },
    ],
    render: (row) => TYPE_LABELS[row.type as string] ?? String(row.type),
    // type is not in patch whitelist — changes category semantics
  },
];

export const ITEM_SPEC: ResourceSpec = deriveResourceSpec(ITEM_COLUMNS, {
  searchableColumns: ["code", "name"],
  sortable: {},
  filterable: {},
  defaultSort: { col: "code", dir: "asc" },
  defaultPageSize: 20,
});

export type ItemRow = {
  id: number;
  code: string;
  name: string;
  unit: string;
  type: string;
  note: string | null;
};
