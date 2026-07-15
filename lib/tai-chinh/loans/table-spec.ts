/**
 * ResourceSpec + ColumnDef for LoanContract list table.
 * Searchable: lenderName. Sortable + filterable derived from ColumnDef kinds.
 *
 * Note: lenderName is a plain String field in schema (not a FK relation).
 * The loan-list-client.tsx defines its own column array with JSX renders; this
 * COLUMNS export is canonical for deriveResourceSpec derivation.
 */
import { deriveResourceSpec } from "@/lib/table/derive-spec";
import type { ResourceSpec } from "@/lib/table/types";
import type { ColumnDef } from "@/components/data-table/types";
import type { Prisma } from "@prisma/client";

export const LOAN_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  {
    key: "lenderName",
    header: "Bên cho vay",
    kind: "text",
    className: "font-medium",
    editable: true,
    editKind: "text",
  },
  {
    key: "principalVnd",
    header: "Gốc vay",
    kind: "currency",
    align: "right",
    className: "tabular-nums",
  },
  {
    key: "interestRatePct",
    header: "Lãi/năm",
    kind: "number",
    align: "right",
    className: "tabular-nums w-[100px]",
  },
  {
    key: "startDate",
    header: "Bắt đầu",
    kind: "date",
    className: "w-[120px]",
  },
  {
    key: "endDate",
    header: "Đáo hạn",
    kind: "date",
    className: "w-[120px]",
  },
  {
    key: "paymentSchedule",
    header: "Lịch trả",
    kind: "select",
    className: "w-[120px]",
    filterOptions: [
      { id: "monthly", name: "Hàng tháng" },
      { id: "quarterly", name: "Hàng quý" },
      { id: "bullet", name: "Một lần" },
    ],
  },
  // _pending is virtual — no kind → auto-skipped by deriveResourceSpec
  {
    key: "_pending",
    header: "Kỳ chưa trả",
    className: "w-[120px]",
  },
  {
    key: "status",
    header: "Trạng thái",
    kind: "select",
    className: "w-[140px]",
    filterOptions: [
      { id: "active", name: "Đang vay" },
      { id: "paid_off", name: "Đã tất toán" },
      { id: "terminated", name: "Chấm dứt" },
    ],
    editable: true,
    editKind: "select",
    editOptions: [
      { id: "active", name: "Đang vay" },
      { id: "paid_off", name: "Đã tất toán" },
      { id: "terminated", name: "Chấm dứt" },
    ],
  },
];

export const LOAN_SPEC: ResourceSpec = deriveResourceSpec(LOAN_COLUMNS, {
  searchableColumns: ["lenderName"],
  sortable: {},
  filterable: {},
  defaultSort: { col: "startDate", dir: "desc" },
  defaultPageSize: 20,
});

export type LoanRow = {
  id: number;
  lenderName: string;
  principalVnd: Prisma.Decimal;
  interestRatePct: Prisma.Decimal;
  startDate: Date;
  endDate: Date;
  paymentSchedule: string;
  status: string;
  payments: { status: string }[];
};
