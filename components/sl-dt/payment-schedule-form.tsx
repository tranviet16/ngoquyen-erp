"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  createPaymentSchedule,
  updatePaymentSchedule,
} from "@/lib/sl-dt/payment-schedule-service";

interface Props {
  projectId: number;
  open: boolean;
  onClose: () => void;
  editRecord?: {
    id: number;
    batch: string;
    planDate: Date;
    planAmount: string;
    actualDate: Date | null;
    actualAmount: string | null;
    status: string;
    note: string | null;
  };
}

function toDateStr(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function PaymentScheduleForm({ projectId, open, onClose, editRecord }: Props) {
  const [batch, setBatch] = useState(editRecord?.batch ?? "");
  const [planDate, setPlanDate] = useState(toDateStr(editRecord?.planDate));
  const [planAmount, setPlanAmount] = useState(editRecord?.planAmount ?? "0");
  const [actualDate, setActualDate] = useState(toDateStr(editRecord?.actualDate));
  const [actualAmount, setActualAmount] = useState(editRecord?.actualAmount ?? "");
  const [status, setStatus] = useState<"pending" | "paid" | "overdue">(
    (editRecord?.status as "pending" | "paid" | "overdue") ?? "pending"
  );
  const [note, setNote] = useState(editRecord?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        projectId,
        batch,
        planDate,
        planAmount: parseFloat(planAmount) || 0,
        actualDate: actualDate || undefined,
        actualAmount: actualAmount ? parseFloat(actualAmount) : undefined,
        status,
        note: note || undefined,
      };
      if (editRecord) {
        await updatePaymentSchedule(editRecord.id, payload);
      } else {
        await createPaymentSchedule(payload);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <h2 className="text-lg font-semibold mb-4">
          {editRecord ? "Cập nhật đợt nộp tiền" : "Thêm đợt nộp tiền"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Tên đợt</Label>
            <Input value={batch} onChange={(e) => setBatch(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ngày KH</Label>
              <Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} required />
            </div>
            <div>
              <Label>Số tiền KH (VNĐ)</Label>
              <Input type="number" value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} min={0} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ngày thực tế</Label>
              <Input type="date" value={actualDate} onChange={(e) => setActualDate(e.target.value)} />
            </div>
            <div>
              <Label>Số tiền thực tế (VNĐ)</Label>
              <Input type="number" value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} min={0} />
            </div>
          </div>
          <div>
            <Label>Trạng thái</Label>
            <select
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as "pending" | "paid" | "overdue")}
            >
              <option value="pending">Chờ nộp</option>
              <option value="paid">Đã nộp</option>
              <option value="overdue">Quá hạn</option>
            </select>
          </div>
          <div>
            <Label>Ghi chú</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
