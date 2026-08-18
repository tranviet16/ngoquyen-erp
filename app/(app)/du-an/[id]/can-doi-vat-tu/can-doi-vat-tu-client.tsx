"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { vndFormatter } from "@/lib/format";
import { setInvoiceOverride } from "@/lib/du-an/can-doi-service";
import type { CanDoiData, CanDoiRow, CanDoiSubtotal } from "@/lib/du-an/can-doi-service";

interface Props {
  projectId: number;
  data: CanDoiData;
  canEdit: boolean;
}

function fmt(n: number): string {
  if (!n) return "—";
  return vndFormatter(Math.round(n));
}

function qty(n: number): string {
  if (!n) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function diffClass(n: number): string {
  if (n > 0) return "text-red-600";
  if (n < 0) return "text-emerald-600";
  return "text-muted-foreground";
}

function OverrideCell({
  projectId,
  row,
  canEdit,
}: {
  projectId: number;
  row: CanDoiRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  // Enter disables the input → native blur fires → onBlur would commit a 2nd time
  const committedRef = useRef(false);

  const commit = (raw: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const cleaned = raw.replace(/[.\s,]/g, "");
    const parsed = cleaned === "" ? null : Number(cleaned);
    if (parsed != null && !Number.isFinite(parsed)) {
      toast.error("Giá trị không hợp lệ");
      committedRef.current = false;
      return;
    }
    startTransition(async () => {
      try {
        await setInvoiceOverride(row.estimateId!, projectId, parsed);
        toast.success(parsed == null ? "Đã trở về giá trị tự tính" : "Đã ghi đè Còn phải lấy HĐ");
        setEditing(false);
        router.refresh();
      } catch {
        toast.error("Không lưu được — kiểm tra quyền sửa");
        committedRef.current = false;
      }
    });
  };

  if (!canEdit || row.kind !== "estimate") {
    return (
      <span className={row.kind === "invoice-only" ? "italic text-muted-foreground" : ""}>
        {fmt(row.remainingInvoiceVnd)}
        {row.remainingIsOverride && <span title="Giá trị ghi đè thủ công"> ✎</span>}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        disabled={isPending}
        defaultValue={row.remainingIsOverride ? String(Math.round(row.remainingInvoiceVnd)) : ""}
        placeholder="Trống = tự tính"
        className="w-32 rounded border px-1 py-0.5 text-right text-sm"
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(value || (e.target as HTMLInputElement).value);
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="cursor-pointer underline-offset-2 hover:underline"
      title={
        row.remainingIsOverride
          ? "Giá trị ghi đè thủ công — bấm để sửa (xóa trống để trở về tự tính)"
          : "Tự tính = Dự toán − Hóa đơn. Bấm để ghi đè."
      }
      onClick={() => {
        committedRef.current = false;
        setEditing(true);
      }}
    >
      {fmt(row.remainingInvoiceVnd)}
      {row.remainingIsOverride && <span> ✎</span>}
    </button>
  );
}

function SubtotalRow({ label, sub, strong }: { label: string; sub: CanDoiSubtotal; strong?: boolean }) {
  return (
    <tr className={strong ? "bg-muted font-bold" : "bg-muted/50 font-semibold"}>
      <td colSpan={4} className="px-2 py-1.5">{label}</td>
      <td className="px-2 py-1.5 text-right">{fmt(sub.estimateTotalVnd)}</td>
      <td className="px-2 py-1.5 text-right" />
      <td className="px-2 py-1.5 text-right">{fmt(sub.invoiceAmountVnd)}</td>
      <td className="px-2 py-1.5 text-right">{fmt(sub.remainingInvoiceVnd)}</td>
      <td className="px-2 py-1.5 text-right">{fmt(sub.actualAmountVnd)}</td>
      <td className={`px-2 py-1.5 text-right ${diffClass(sub.diffActualVsInvoiceVnd)}`}>
        {fmt(sub.diffActualVsInvoiceVnd)}
      </td>
    </tr>
  );
}

export function CanDoiVatTuClient({ projectId, data, canEdit }: Props) {
  const rowCount = data.groups.reduce((a, g) => a + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Cân Đối Vật Tư</h2>
        <p className="text-sm text-muted-foreground">
          Dự toán ↔ Hóa đơn đã lấy ↔ Thực tế · {rowCount} dòng ·{" "}
          <Link href={`/du-an/${projectId}/giao-dich`} className="underline underline-offset-2">
            Xem giao dịch
          </Link>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Thực tế = 0 nghĩa là chưa nhập số phát sinh (không phải bằng 0). Khi có số thực tế, sửa
          cột TT trên chính dòng giao dịch tương ứng. &quot;Còn phải lấy HĐ&quot; tự tính = Dự toán −
          Hóa đơn; dòng có ✎ là giá trị ghi đè thủ công.
        </p>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left">
              <th className="px-2 py-2 w-28">Mã</th>
              <th className="px-2 py-2">Tên vật tư / công việc</th>
              <th className="px-2 py-2 w-16">ĐVT</th>
              <th className="px-2 py-2 w-24 text-right">DT SL</th>
              <th className="px-2 py-2 w-32 text-right">Dự toán</th>
              <th className="px-2 py-2 w-24 text-right">HĐ SL</th>
              <th className="px-2 py-2 w-32 text-right">Hóa đơn đã lấy</th>
              <th className="px-2 py-2 w-32 text-right">Còn phải lấy HĐ</th>
              <th className="px-2 py-2 w-32 text-right">Thực tế (đã nhập)</th>
              <th className="px-2 py-2 w-32 text-right">Chênh TT−HĐ</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.map((group) => (
              <FragmentGroup key={group.categoryId} projectId={projectId} group={group} canEdit={canEdit} />
            ))}
            <SubtotalRow label="TỔNG CỘNG" sub={data.total} strong />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentGroup({
  projectId,
  group,
  canEdit,
}: {
  projectId: number;
  group: CanDoiData["groups"][number];
  canEdit: boolean;
}) {
  return (
    <>
      <tr className="border-t bg-muted/30">
        <td colSpan={10} className="px-2 py-1.5 font-semibold">
          {group.code} — {group.name}
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.id} className="border-t hover:bg-muted/20">
          <td className="px-2 py-1 font-mono text-xs">{row.itemCode}</td>
          <td className="px-2 py-1">
            {row.itemName}
            {row.kind === "invoice-only" && (
              <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800" title="Chỉ có hóa đơn, không có dòng dự toán tương ứng">
                ngoài DT
              </span>
            )}
            {row.unitMismatch && (
              <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] text-sky-800" title="ĐVT hóa đơn khác ĐVT dự toán — chỉ so sánh theo tiền">
                khác ĐVT
              </span>
            )}
          </td>
          <td className="px-2 py-1">{row.unit}</td>
          <td className="px-2 py-1 text-right">{qty(row.estimateQty)}</td>
          <td className="px-2 py-1 text-right">{fmt(row.estimateTotalVnd)}</td>
          <td className="px-2 py-1 text-right">{row.unitMismatch ? "—" : qty(row.invoiceQty)}</td>
          <td className="px-2 py-1 text-right">{fmt(row.invoiceAmountVnd)}</td>
          <td className="px-2 py-1 text-right">
            <OverrideCell projectId={projectId} row={row} canEdit={canEdit} />
          </td>
          <td className="px-2 py-1 text-right">{fmt(row.actualAmountVnd)}</td>
          <td className={`px-2 py-1 text-right ${diffClass(row.diffActualVsInvoiceVnd)}`}>
            {fmt(row.diffActualVsInvoiceVnd)}
          </td>
        </tr>
      ))}
      <SubtotalRow label={`Cộng ${group.name}`} sub={group.subtotal} />
    </>
  );
}
