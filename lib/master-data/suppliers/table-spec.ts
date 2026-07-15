/**
 * ResourceSpec + ColumnDef for Supplier list table.
 * Searchable: name, taxCode. Sortable + filterable derived from ColumnDef kinds.
 */
import { deriveResourceSpec } from "@/lib/table/derive-spec";
import type { ResourceSpec } from "@/lib/table/types";
import type { ColumnDef } from "@/components/data-table/types";

export const SUPPLIER_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  {
    key: "name",
    header: "Tên nhà cung cấp",
    kind: "text",
    editable: true,
    editKind: "text",
  },
  {
    key: "taxCode",
    header: "MST",
    kind: "text",
    editable: true,
    editKind: "text",
  },
  {
    key: "phone",
    header: "Điện thoại",
    kind: "text",
    editable: true,
    editKind: "text",
  },
  {
    key: "address",
    header: "Địa chỉ",
    kind: "text",
    editable: true,
    editKind: "text",
  },
];

export const SUPPLIER_SPEC: ResourceSpec = deriveResourceSpec(SUPPLIER_COLUMNS, {
  searchableColumns: ["name", "taxCode"],
  sortable: {},
  filterable: {},
  defaultSort: { col: "name", dir: "asc" },
  defaultPageSize: 20,
});

export type SupplierRow = {
  id: number;
  name: string;
  taxCode: string | null;
  phone: string | null;
  address: string | null;
};
