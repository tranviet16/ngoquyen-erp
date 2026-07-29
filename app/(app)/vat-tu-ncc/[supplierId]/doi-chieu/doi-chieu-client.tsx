"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { createReconciliation, softDeleteReconciliation } from "@/lib/vat-tu-ncc/reconciliation-service";
import { unsignReconciliation } from "@/lib/vat-tu-ncc/reconciliation-derive-service";
import { type ReconciliationInput } from "@/lib/vat-tu-ncc/schemas";
import { ReconciliationForm } from "@/components/vat-tu-ncc/reconciliation-form";
import { formatDate, formatVND } from "@/lib/utils/format";
import { Plus } from "lucide-react";

export interface ReconListRow {
  id: number;
  periodFrom: string;
  periodTo: string;
  opening: number;
  totalIn: number;
  totalPaid: number;
  closing: number;
  signedBySupplier: boolean;
  signedDate: string | null;
  note: string | null;
}

interface Props {
  supplierId: number;
  initialData: ReconListRow[];
  canCreate: boolean;
  canDelete: boolean;
  isAdmin: boolean;
}

export function DoiChieuClient({ supplierId, initialData, canCreate, canDelete, isAdmin }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [, startTransition] = useTransition();

  async function handleCreate(data: ReconciliationInput) {
    try {
      const record = await createReconciliation(data);
      toast.success("Đã tạo kỳ đối chiếu");
      setCreateOpen(false);
      router.push(`/vat-tu-ncc/${supplierId}/doi-chieu/${record.id}`);
    } catch (err) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Xóa kỳ đối chiếu này?")) return;
    try {
      await softDeleteReconciliation(id, supplierId);
      toast.success("Đã xóa");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function handleUnsign(id: number) {
    if (!confirm("Gỡ ký kỳ này? Số đông cứng sẽ bị xóa và kỳ tính lại từ sổ cái.")) return;
    try {
      await unsignReconciliation(id);
      toast.success("Đã gỡ ký");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error("Lỗi: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Đối chiếu công nợ</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Số liệu tính tự động từ sổ công nợ vật tư. Kỳ đã ký được đông cứng và khóa ghi.
          </p>
        </div>
        <Button hidden={!canCreate} onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Tạo kỳ đối chiếu
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Kỳ đối chiếu</th>
              <th className="px-3 py-2 font-medium text-right">A. Dư mang sang</th>
              <th className="px-3 py-2 font-medium text-right">B. Cộng P/S</th>
              <th className="px-3 py-2 font-medium text-right">C. Chuyển khoản</th>
              <th className="px-3 py-2 font-medium text-right">Tổng nợ</th>
              <th className="px-3 py-2 font-medium">Trạng thái</th>
              <th className="px-3 py-2 font-medium">Ghi chú</th>
              <th className="px-3 py-2 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {initialData.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                Chưa có kỳ đối chiếu. Chốt kỳ ở tab &quot;Chốt kỳ&quot; hoặc bấm &quot;Tạo kỳ đối chiếu&quot;.
              </td></tr>
            )}
            {initialData.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={`/vat-tu-ncc/${supplierId}/doi-chieu/${r.id}`} className="text-primary hover:underline">
                    {formatDate(r.periodFrom)} – {formatDate(r.periodTo)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatVND(r.opening)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatVND(r.totalIn)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatVND(r.totalPaid)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{formatVND(r.closing)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.signedBySupplier ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                      Đã ký {r.signedDate ? formatDate(r.signedDate) : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      Chưa ký
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 max-w-48 truncate">{r.note ?? ""}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {r.signedBySupplier
                    ? isAdmin && (
                        <Button variant="outline" size="sm" onClick={() => handleUnsign(r.id)}>Gỡ ký</Button>
                      )
                    : canDelete && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>Xóa</Button>
                      )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CrudDialog title="Tạo kỳ đối chiếu" open={createOpen} onOpenChange={setCreateOpen}>
        <ReconciliationForm supplierId={supplierId} onSubmit={handleCreate} />
      </CrudDialog>
    </div>
  );
}
