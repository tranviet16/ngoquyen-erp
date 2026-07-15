/**
 * ResourceSpec + ColumnDef for Project list table.
 * Searchable: code, name, ownerInvestor.
 * Sortable + filterable derived from ColumnDef kinds.
 *
 * Note: ownerInvestor is a plain String field in schema (not a FK relation).
 * The projects-client.tsx defines its own column array with JSX renders; this
 * COLUMNS export is canonical for deriveResourceSpec derivation.
 */
import { deriveResourceSpec } from "@/lib/table/derive-spec";
import type { ResourceSpec } from "@/lib/table/types";
import type { ColumnDef } from "@/components/data-table/types";

export const PROJECT_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  {
    key: "code",
    header: "Mã DA",
    kind: "text",
    className: "w-[100px] font-mono",
    editable: true,
    editKind: "text",
  },
  {
    key: "name",
    header: "Tên dự án",
    kind: "text",
    editable: true,
    editKind: "text",
  },
  {
    key: "ownerInvestor",
    header: "Chủ đầu tư",
    kind: "text",
    // Plain String field in schema — text sort + filter only.
  },
  {
    key: "status",
    header: "Trạng thái",
    kind: "select",
    className: "w-[160px]",
    filterOptions: [
      { id: "active", name: "Đang thi công" },
      { id: "completed", name: "Hoàn thành" },
      { id: "paused", name: "Tạm dừng" },
    ],
    editable: true,
    editKind: "select",
    editOptions: [
      { id: "active", name: "Đang thi công" },
      { id: "completed", name: "Hoàn thành" },
      { id: "paused", name: "Tạm dừng" },
    ],
  },
  // _count is virtual — no kind → auto-skipped by deriveResourceSpec
  {
    key: "_count",
    header: "Hạng mục",
    className: "w-[100px]",
    align: "right",
  },
];

export const PROJECT_SPEC: ResourceSpec = deriveResourceSpec(PROJECT_COLUMNS, {
  searchableColumns: ["code", "name", "ownerInvestor"],
  sortable: {},
  filterable: {},
  defaultSort: { col: "createdAt", dir: "desc" },
  defaultPageSize: 20,
});

export type ProjectRow = {
  id: number;
  code: string;
  name: string;
  ownerInvestor: string | null;
  status: string;
  _count: { categories: number };
};
