"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createRoundAction } from "../actions";
import type { PaymentCategory, RoundStatus } from "@/lib/payment/payment-service";

export const CATEGORY_LABEL: Record<PaymentCategory, string> = {
  vat_tu: "Vật tư",
  nhan_cong: "Nhân công",
  dich_vu: "Dịch vụ",
  khac: "Khác",
};

interface RoundRow {
  id: number;
  month: string;
  sequence: number;
  status: string;
  note: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string } | null;
  _count: { items: number };
}

interface Props {
  initialRounds: RoundRow[];
  initialFilter: { month: string; status?: string };
}

export function RoundListClient({ initialRounds, initialFilter }: Props) {
  const router = useRouter();
  const [month, setMonth] = useState(initialFilter.month);
  const [status, setStatus] = useState(initialFilter.status ?? "");
  const [open, setOpen] = useState(false);

  function applyFilter() {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (status) params.set("status", status);
    router.push(`/thanh-toan/ke-hoach?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kế hoạch thanh toán</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button>Tạo đợt mới</Button>} />
          <CreateRoundDialog onClose={() => setOpen(false)} defaultMonth={month} />
        </Dialog>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
        <div>
          <label className="text-xs text-muted-foreground">Tháng</label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Trạng thái</label>
          <select
            className="block h-9 rounded-md border bg-background px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="draft">Nháp</option>
            <option value="submitted">Đã gửi</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
            <option value="closed">Đã đóng</option>
          </select>
        </div>
        <Button variant="outline" onClick={applyFilter}>
          Lọc
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Tháng</th>
              <th className="px-3 py-2 text-left">Đợt</th>
              <th className="px-3 py-2 text-left">Trạng thái</th>
              <th className="px-3 py-2 text-left">Người lập</th>
              <th className="px-3 py-2 text-right">Số dòng</th>
              <th className="px-3 py-2 text-left">Ngày tạo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {initialRounds.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Chưa có đợt thanh toán nào.
                </td>
              </tr>
            )}
            {initialRounds.map((r, i) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2">{r.month}</td>
                <td className="px-3 py-2">#{r.sequence}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} label={STATUS_LABEL[r.status as RoundStatus]} />
                </td>
                <td className="px-3 py-2">{r.createdBy?.name ?? "—"}</td>
                <td className="px-3 py-2 text-right">{r._count.items}</td>
                <td className="px-3 py-2">
                  {new Date(r.createdAt).toLocaleDateString("vi-VN")}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/thanh-toan/ke-hoach/${r.id}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Xem
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<RoundStatus, string> = {
  draft: "Nháp",
  submitted: "Đã gửi",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  closed: "Đã đóng",
};

function CreateRoundDialog({
  onClose,
  defaultMonth,
}: {
  onClose: () => void;
  defaultMonth: string;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!month) {
      toast.error("Chọn tháng");
      return;
    }
    startTransition(async () => {
      try {
        const r = await createRoundAction({ month, note: note || undefined });
        toast.success("Đã tạo đợt mới");
        onClose();
        router.push(`/thanh-toan/ke-hoach/${r.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi");
      }
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Tạo đợt thanh toán mới</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-sm">Tháng</label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div>
          <label className="text-sm">Ghi chú</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Huỷ
        </Button>
        <Button onClick={submit} disabled={pending}>
          Tạo
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
