/**
 * ResourceSpec + ColumnDef for Entity list table.
 * Searchable: name, note. Sortable + filterable derived from ColumnDef kinds.
 */
import { deriveResourceSpec } from "@/lib/table/derive-spec";
import type { ResourceSpec } from "@/lib/table/types";
import type { ColumnDef } from "@/components/data-table/types";

const TYPE_LABELS: Record<string, string> = {
  company: "Công ty",
  person: "Cá nhân",
};

export const ENTITY_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  {
    key: "name",
    header: "Tên chủ thể",
    kind: "text",
    editable: true,
    editKind: "text",
  },
  {
    key: "type",
    header: "Loại",
    kind: "select",
    filterOptions: [
      { id: "company", name: "Công ty" },
      { id: "person", name: "Cá nhân" },
    ],
    render: (row) => TYPE_LABELS[row.type as string] ?? String(row.type),
    // type is not in patch whitelist — read-only (enum set at create)
  },
  {
    key: "note",
    header: "Ghi chú",
    kind: "text",
    editable: true,
    editKind: "text",
  },
];

export const ENTITY_SPEC: ResourceSpec = deriveResourceSpec(ENTITY_COLUMNS, {
  searchableColumns: ["name", "note"],
  sortable: {},
  filterable: {},
  defaultSort: { col: "createdAt", dir: "desc" },
  defaultPageSize: 20,
});

export type EntityRow = {
  id: number;
  name: string;
  type: string;
  note: string | null;
  createdAt: Date;
};
