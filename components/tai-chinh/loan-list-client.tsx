"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoanFormDialog } from "./loan-form-dialog";
import { formatVND, formatDate, formatPercent } from "@/lib/utils/format";
import type { Prisma } from "@prisma/client";

interface LoanRow {
  id: number;
  lenderName: string;
  principalVnd: Prisma.Decimal;
  interestRatePct: Prisma.Decimal;
  startDate: Date;
  endDate: Date;
  paymentSchedule: string;
  status: string;
  payments: { status: string }[];
}

interface Props {
  loans: LoanRow[];
}

const SCHEDULE_LABELS: Record<string, string> = {
  monthly: "Hàng tháng",
  quarterly: "Hàng quý",
  bullet: "Một lần",
};

const COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: "lenderName", header: "Bên cho vay", className: "font-medium" },
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
    className: "w-[120px]",
    render: (row) => formatDate(row.startDate as Date),
  },
  {
    key: "endDate",
    header: "Đáo hạn",
    className: "w-[120px]",
    render: (row) => formatDate(row.endDate as Date),
  },
  {
    key: "paymentSchedule",
    header: "Lịch trả",
    className: "w-[120px]",
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
    className: "w-[140px]",
    render: (row) => <StatusBadge status={row.status as string} />,
  },
];

export function LoanListClient({ loans }: Props) {
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
        columns={COLUMNS}
        data={loans as unknown as Record<string, unknown>[]}
        total={loans.length}
        page={1}
        pageSize={loans.length || 1}
        emptyText="Chưa có hợp đồng vay"
        emptyDescription="Tạo hợp đồng đầu tiên để theo dõi gốc, lãi và lịch trả."
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
