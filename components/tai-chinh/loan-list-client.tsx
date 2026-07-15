"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoanFormDialog } from "./loan-form-dialog";
import { formatVND, formatDate, formatPercent } from "@/lib/utils/format";
import { LOAN_SPEC, type LoanRow } from "@/lib/tai-chinh/loans/table-spec";
import { patchLoan } from "@/lib/tai-chinh/loan-service";
import type { Prisma } from "@prisma/client";

const SCHEDULE_LABELS: Record<string, string> = {
  monthly: "Hàng tháng",
  quarterly: "Hàng quý",
  bullet: "Một lần",
};

const LOAN_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  {
    key: "lenderName",
    header: "Bên cho vay",
    kind: "text",
    className: "font-medium",
    sortable: true,
    filterable: true,
    editable: true,
    editKind: "text",
  },
  {
    key: "principalVnd",
    header: "Gốc vay",
    align: "right",
    className: "tabular-nums",
    render: (row) => formatVND(Number(row.principalVnd as Prisma.Decimal)),
  },
  {
    key: "interestRatePct",
    header: "Lãi/năm",
    align: "right",
    className: "tabular-nums w-[100px]",
    render: (row) => formatPercent(Number(row.interestRatePct as Prisma.Decimal)),
  },
  {
    key: "startDate",
    header: "Bắt đầu",
    kind: "date",
    className: "w-[120px]",
    sortable: true,
    render: (row) => formatDate(row.startDate as Date),
  },
  {
    key: "endDate",
    header: "Đáo hạn",
    kind: "date",
    className: "w-[120px]",
    sortable: true,
    render: (row) => formatDate(row.endDate as Date),
  },
  {
    key: "paymentSchedule",
    header: "Lịch trả",
    kind: "select",
    className: "w-[120px]",
    filterable: true,
    filterOptions: [
      { id: "monthly", name: "Hàng tháng" },
      { id: "quarterly", name: "Hàng quý" },
      { id: "bullet", name: "Một lần" },
    ],
    render: (row) =>
      SCHEDULE_LABELS[row.paymentSchedule as string] ?? (row.paymentSchedule as string),
  },
  {
    key: "_pending",
    header: "Kỳ chưa trả",
    className: "w-[120px]",
    render: (row) => {
      const payments = (row.payments as { status: string }[]) ?? [];
      const pending = payments.filter((p) => p.status === "pending").length;
      return pending > 0 ? (
        <span className="font-medium text-amber-700 dark:text-amber-300">{pending} kỳ</span>
      ) : (
        <span className="text-emerald-700 dark:text-emerald-300">Hoàn thành</span>
      );
    },
  },
  {
    key: "status",
    header: "Trạng thái",
    kind: "select",
    className: "w-[140px]",
    sortable: true,
    filterable: true,
    filterOptions: [
      { id: "active", name: "Đang vay" },
      { id: "paid_off", name: "Đã tất toán" },
      { id: "terminated", name: "Chấm dứt" },
    ],
    render: (row) => <StatusBadge status={row.status as string} />,
    editable: true,
    editKind: "select",
    editOptions: [
      { id: "active", name: "Đang vay" },
      { id: "paid_off", name: "Đã tất toán" },
      { id: "terminated", name: "Chấm dứt" },
    ],
  },
];

interface Props {
  loans: LoanRow[];
  total: number;
  page: number;
  pageSize: number;
  searchValue: string;
}

export function LoanListClient({ loans, total, page, pageSize, searchValue }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hợp đồng vay</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Theo dõi các hợp đồng vay, lịch trả gốc và lãi.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          Tạo hợp đồng
        </Button>
      </div>

      <DataTable
        columns={LOAN_COLUMNS}
        data={loans as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        pageSize={pageSize}
        searchValue={searchValue}
        searchPlaceholder="Tìm theo tên bên cho vay..."
        resourceSpec={LOAN_SPEC}
        emptyText="Chưa có hợp đồng vay"
        emptyDescription="Tạo hợp đồng đầu tiên để theo dõi gốc, lãi và lịch trả."
        onCellEdit={async (row, key, value) => {
          const loan = row as unknown as LoanRow;
          return patchLoan(loan.id, { [key]: value }) as Promise<Record<string, unknown>>;
        }}
        onRowClick={(row) => router.push(`/tai-chinh/vay/${(row as unknown as LoanRow).id}`)}
      />

      <LoanFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
