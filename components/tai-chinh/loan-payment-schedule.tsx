"use client";

import { useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordLoanPayment } from "@/lib/tai-chinh/loan-service";
import { formatVND, formatDate } from "@/lib/utils/format";
import type { Prisma } from "@prisma/client";

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

function formatVnd(v: Prisma.Decimal | null | undefined): string {
  return v == null ? "—" : formatVND(Number(v));
}

const STATUS_LABELS: Record<string, string> = { pending: "Chưa trả", paid: "Đã trả", overdue: "Quá hạn" };

export function LoanPaymentSchedule({ payments, contractId: _contractId }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [principalPaid, setPrincipalPaid] = useState("");
  const [interestPaid, setInterestPaid] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = payments.find(p => p.id === selectedId);

  const colDefs: ColDef<PaymentRow>[] = [
    { field: "dueDate", headerName: "Kỳ hạn", width: 120, valueFormatter: p => formatDate(p.value, "") },
    { field: "principalDue", headerName: "Gốc phải trả", width: 140, valueFormatter: p => formatVnd(p.value) },
    { field: "interestDue", headerName: "Lãi phải trả", width: 140, valueFormatter: p => formatVnd(p.value) },
    { headerName: "Tổng phải trả", width: 140, valueFormatter: p => {
      const row = p.data as PaymentRow | undefined;
      if (!row) return "";
      return formatVnd(row.principalDue.plus(row.interestDue));
    }},
    { field: "paidDate", headerName: "Ngày trả", width: 120, valueFormatter: p => formatDate(p.value) },
    { field: "principalPaid", headerName: "Gốc đã trả", width: 130, valueFormatter: p => formatVnd(p.value) },
    { field: "interestPaid", headerName: "Lãi đã trả", width: 130, valueFormatter: p => formatVnd(p.value) },
    { field: "status", headerName: "Trạng thái", width: 110, valueFormatter: p => STATUS_LABELS[p.value] ?? p.value },
    { field: "note", headerName: "Ghi chú", flex: 1 },
  ];

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
      <div className="ag-theme-quartz h-72 rounded-md border">
        <AgGridReact
          rowData={payments}
          columnDefs={colDefs}
          rowSelection="single"
          onRowClicked={e => {
            const row = e.data as PaymentRow;
            if (row.status === "pending") {
              setSelectedId(row.id);
              setPrincipalPaid(String(row.principalDue));
              setInterestPaid(String(row.interestDue));
            }
          }}
        />
      </div>

      {selected && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/40">
          <p className="text-sm font-medium">Ghi nhận thanh toán kỳ {formatDate(selected.dueDate)}</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Ngày trả</label>
              <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
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
