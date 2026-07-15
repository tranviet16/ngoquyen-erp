/**
 * ResourceSpec + ColumnDef for Contractor list table.
 * Searchable: name, leader. Sortable + filterable derived from ColumnDef kinds.
 */
import { deriveResourceSpec } from "@/lib/table/derive-spec";
import type { ResourceSpec } from "@/lib/table/types";
import type { ColumnDef } from "@/components/data-table/types";

export const CONTRACTOR_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  {
    key: "name",
    header: "Tên đội thi công",
    kind: "text",
    editable: true,
    editKind: "text",
  },
  {
    key: "leader",
    header: "Trưởng nhóm",
    kind: "text",
    editable: true,
    editKind: "text",
  },
  {
    key: "contact",
    header: "Liên hệ",
    kind: "text",
    editable: true,
    editKind: "text",
  },
];

export const CONTRACTOR_SPEC: ResourceSpec = deriveResourceSpec(CONTRACTOR_COLUMNS, {
  searchableColumns: ["name", "leader"],
  sortable: {},
  filterable: {},
  defaultSort: { col: "name", dir: "asc" },
  defaultPageSize: 20,
});

export type ContractorRow = {
  id: number;
  name: string;
  leader: string | null;
  contact: string | null;
};
