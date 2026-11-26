/**
 * ResourceSpec + ColumnDef for Supplier list table.
 * Searchable: name, taxCode. Sortable + filterable derived from ColumnDef kinds.
 * Cột Loại hiện nhãn tiếng Việt, lọc / sửa bằng mã (`vat_tu` | `nhan_cong`).
 */
import { deriveResourceSpec } from "@/lib/table/derive-spec";
import type { ResourceSpec } from "@/lib/table/types";
import type { ColumnDef } from "@/components/data-table/types";
import { SUPPLIER_KIND_OPTIONS, supplierKindLabel } from "@/lib/master-data/supplier-kind";

export const SUPPLIER_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  {
    key: "name",
    header: "Tên nhà cung cấp",
    kind: "text",
    editable: true,
    editKind: "text",
  },
  {
    key: "kind",
    header: "Loại",
    kind: "select",
    className: "w-[120px]",
    filterOptions: SUPPLIER_KIND_OPTIONS,
    render: (row) => supplierKindLabel(row.kind as string),
    editable: true,
    editKind: "select",
    editOptions: SUPPLIER_KIND_OPTIONS,
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
  tieBreaker: { col: "id", dir: "asc" },
  defaultPageSize: 20,
});

export type SupplierRow = {
  id: number;
  name: string;
  /** `vat_tu` | `nhan_cong` (CHECK ở CSDL); Prisma trả kiểu string. */
  kind: string;
  taxCode: string | null;
  phone: string | null;
  address: string | null;
};
