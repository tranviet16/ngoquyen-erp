"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LoanFormDialog } from "./loan-form-dialog";
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

const VND = new Intl.NumberFormat("vi-VN");
const STATUS_LABELS: Record<string, string> = { active: "Đang vay", paid_off: "Đã trả xong", terminated: "Đã chấm dứt" };
const SCHEDULE_LABELS: Record<string, string> = { monthly: "Hàng tháng", quarterly: "Hàng quý", bullet: "Một lần" };

export function LoanListClient({ loans }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Hợp đồng vay</h1>
        <Button onClick={() => setDialogOpen(true)} size="sm">+ Tạo hợp đồng</Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2">Bên cho vay</th>
              <th className="text-right px-3 py-2">Gốc vay (VND)</th>
              <th className="text-right px-3 py-2">Lãi/năm</th>
              <th className="text-left px-3 py-2">Bắt đầu</th>
              <th className="text-left px-3 py-2">Đáo hạn</th>
              <th className="text-left px-3 py-2">Lịch trả</th>
              <th className="text-left px-3 py-2">Kỳ chưa trả</th>
              <th className="text-left px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loans.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Chưa có hợp đồng vay</td></tr>
            ) : (
              loans.map(loan => {
                const pending = loan.payments.filter(p => p.status === "pending").length;
                return (
                  <tr key={loan.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{loan.lenderName}</td>
                    <td className="px-3 py-2 text-right">{VND.format(Number(loan.principalVnd))}</td>
                    <td className="px-3 py-2 text-right">{(Number(loan.interestRatePct) * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2">{new Date(loan.startDate).toLocaleDateString("vi-VN")}</td>
                    <td className="px-3 py-2">{new Date(loan.endDate).toLocaleDateString("vi-VN")}</td>
                    <td className="px-3 py-2">{SCHEDULE_LABELS[loan.paymentSchedule] ?? loan.paymentSchedule}</td>
                    <td className="px-3 py-2">{pending > 0 ? <span className="text-orange-600 font-medium">{pending} kỳ</span> : <span className="text-green-600">Hoàn thành</span>}</td>
                    <td className="px-3 py-2">{STATUS_LABELS[loan.status] ?? loan.status}</td>
                    <td className="px-3 py-2">
                      <Link href={`/tai-chinh/vay/${loan.id}`} className="text-primary text-xs underline">Chi tiết</Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <LoanFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={() => router.refresh()} />
    </div>
  );
}
