"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PaymentScheduleForm } from "@/components/sl-dt/payment-schedule-form";
import { softDeletePaymentSchedule } from "@/lib/sl-dt/payment-schedule-service";
import type { PaymentScheduleSummary } from "@/lib/sl-dt/report-service";

interface Props {
  rows: PaymentScheduleSummary[];
  projectId: number | undefined;
  projects: { id: number; code: string; name: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ nộp",
  paid: "Đã nộp",
  overdue: "Quá hạn",
};

const fmtDate = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("vi-VN") : "—";

const fmtVnd = (v: { toString(): string } | null) => {
  if (!v) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(parseFloat(v.toString()));
};

export function PaymentScheduleClient({ rows, projectId, projects }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<PaymentScheduleSummary | null>(null);

  const handleDelete = async (id: number) => {
    if (!confirm("Xóa đợt nộp tiền này?")) return;
    await softDeletePaymentSchedule(id);
  };

  const activeProjectId = projectId ?? projects[0]?.id ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setEditRecord(null); setShowForm(true); }}>
          + Thêm đợt
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          Chưa có lịch nộp tiền. Nhấn "+ Thêm đợt" để tạo.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2">Đợt</th>
                <th className="text-center p-2">Ngày KH</th>
                <th className="text-right p-2">Số tiền KH</th>
                <th className="text-center p-2">Ngày TT</th>
                <th className="text-right p-2">Số tiền TT</th>
                <th className="text-center p-2">Trạng thái</th>
                <th className="text-left p-2">Ghi chú</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b hover:bg-muted/20 ${r.isOverdue ? "bg-red-50" : ""}`}
                >
                  <td className="p-2 font-medium">{r.batch}</td>
                  <td className="p-2 text-center">{fmtDate(r.planDate)}</td>
                  <td className="p-2 text-right">{fmtVnd(r.planAmount)}</td>
                  <td className="p-2 text-center">{fmtDate(r.actualDate)}</td>
                  <td className="p-2 text-right">{fmtVnd(r.actualAmount)}</td>
                  <td className="p-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.status === "paid"
                          ? "bg-green-100 text-green-700"
                          : r.isOverdue
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {r.isOverdue && r.status !== "paid" ? "Quá hạn" : STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="p-2 text-muted-foreground">{r.note ?? ""}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditRecord(r); setShowForm(true); }}
                      >
                        Sửa
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(r.id)}
                      >
                        Xóa
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PaymentScheduleForm
          projectId={editRecord?.projectId ?? activeProjectId}
          open={showForm}
          onClose={() => setShowForm(false)}
          editRecord={
            editRecord
              ? {
                  id: editRecord.id,
                  batch: editRecord.batch,
                  planDate: editRecord.planDate,
                  planAmount: editRecord.planAmount.toString(),
                  actualDate: editRecord.actualDate,
                  actualAmount: editRecord.actualAmount?.toString() ?? null,
                  status: editRecord.status,
                  note: editRecord.note,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
