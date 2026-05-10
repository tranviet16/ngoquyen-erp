"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { recordLoanPayment } from "@/lib/tai-chinh/loan-service";
import { formatVND, formatDate } from "@/lib/utils/format";
import type { Prisma } from "@prisma/client";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  onSelectionChange?: (ids: number[]) => void;
}) => ReactElement;

interface PaymentRow {
  id: number;
  dueDate: Date;
  principalDue: Prisma.Decimal;
  interestDue: Prisma.Decimal;
  paidDate: Date | null;
  principalPaid: Prisma.Decimal | null;
  interestPaid: Prisma.Decimal | null;
  status: string;
  note: string | null;
}

interface Props {
  payments: PaymentRow[];
  contractId: number;
}

const STATUS_LABELS: Record<string, string> = { pending: "Chưa trả", paid: "Đã trả", overdue: "Quá hạn" };

interface PaymentGridRow extends RowWithId {
  dueDate: string;
  principalDue: number;
  interestDue: number;
  totalDue: number;
  paidDate: string;
  principalPaid: number;
  interestPaid: number;
  status: string;
  note: string;
}

export function LoanPaymentSchedule({ payments, contractId: _contractId }: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [principalPaid, setPrincipalPaid] = useState("");
  const [interestPaid, setInterestPaid] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = payments.find(p => p.id === selectedId);
  const selectedSinglePending =
    selectedIds.length === 1
      ? payments.find(p => p.id === selectedIds[0] && p.status === "pending") ?? null
      : null;

  const rows: PaymentGridRow[] = payments.map(p => ({
    id: p.id,
    dueDate: formatDate(p.dueDate, ""),
    principalDue: Number(p.principalDue),
    interestDue: Number(p.interestDue),
    totalDue: Number(p.principalDue.plus(p.interestDue)),
    paidDate: p.paidDate ? formatDate(p.paidDate, "") : "",
    principalPaid: p.principalPaid != null ? Number(p.principalPaid) : 0,
    interestPaid: p.interestPaid != null ? Number(p.interestPaid) : 0,
    status: STATUS_LABELS[p.status] ?? p.status,
    note: p.note ?? "",
  }));

  const columns: DataGridColumn<PaymentGridRow>[] = [
    { id: "dueDate", title: "Kỳ hạn", kind: "text", width: 120, readonly: true },
    { id: "principalDue", title: "Gốc phải trả", kind: "currency", width: 140, readonly: true },
    { id: "interestDue", title: "Lãi phải trả", kind: "currency", width: 140, readonly: true },
    { id: "totalDue", title: "Tổng phải trả", kind: "currency", width: 140, readonly: true },
    { id: "paidDate", title: "Ngày trả", kind: "text", width: 120, readonly: true },
    {
      id: "principalPaid", title: "Gốc đã trả", kind: "currency", width: 130, readonly: true,
      format: (v) => Number(v) > 0 ? formatVND(Number(v)) : "—",
    },
    {
      id: "interestPaid", title: "Lãi đã trả", kind: "currency", width: 130, readonly: true,
      format: (v) => Number(v) > 0 ? formatVND(Number(v)) : "—",
    },
    { id: "status", title: "Trạng thái", kind: "text", width: 110, readonly: true },
    { id: "note", title: "Ghi chú", kind: "text", width: 200, readonly: true },
  ];

  const openRecordForm = () => {
    if (!selectedSinglePending) return;
    setSelectedId(selectedSinglePending.id);
    setPrincipalPaid(String(selectedSinglePending.principalDue));
    setInterestPaid(String(selectedSinglePending.interestDue));
  };

  async function handleRecord() {
    if (!selectedId || !principalPaid || !interestPaid) {
      toast.error("Chọn kỳ và nhập số tiền đã trả");
      return;
    }
    setLoading(true);
    try {
      await recordLoanPayment(selectedId, paidDate, principalPaid, interestPaid);
      toast.success("Đã ghi nhận thanh toán");
      setSelectedId(null);
      setPrincipalPaid("");
      setInterestPaid("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={!selectedSinglePending}
          onClick={openRecordForm}
        >
          Ghi nhận thanh toán
        </Button>
      </div>

      <DataGrid<PaymentGridRow>
        columns={columns}
        rows={rows}
        handlers={{}}
        height={300}
        onSelectionChange={setSelectedIds}
      />

      {selected && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/40">
          <p className="text-sm font-medium">Ghi nhận thanh toán kỳ {formatDate(selected.dueDate)}</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Ngày trả</label>
              <DateInput value={paidDate} onChange={(v) => setPaidDate(v)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Gốc đã trả (VND)</label>
              <Input type="number" min="0" value={principalPaid} onChange={e => setPrincipalPaid(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Lãi đã trả (VND)</label>
              <Input type="number" min="0" value={interestPaid} onChange={e => setInterestPaid(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRecord} disabled={loading} size="sm">
              {loading ? "Đang lưu..." : "Xác nhận trả"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>Hủy</Button>
          </div>
        </div>
      )}
    </div>
  );
}
