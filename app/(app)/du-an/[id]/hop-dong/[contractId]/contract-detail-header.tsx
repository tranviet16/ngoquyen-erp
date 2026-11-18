"use client";

/** Đầu trang chi tiết hợp đồng: link về danh mục, tên, huy hiệu loại / trạng thái / hạn, nút Sửa / Xóa. */

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { softDeleteContract } from "@/lib/du-an/contract-service";
import { docTypeLabel, statusLabel } from "@/lib/du-an/contract-labels";
import { formatDate } from "@/lib/utils/format";
import type { ContractFormValues } from "@/lib/du-an/contract-form-values";
import { ContractForm } from "../hop-dong-form";

interface Props {
  projectId: number;
  contractId: number;
  docName: string;
  docType: string;
  status: string;
  expiryDate: string | null;
  canEdit: boolean;
  form: {
    initialValues: ContractFormValues;
    supplierOptions: { id: number; name: string }[];
    contractorOptions: { id: number; name: string }[];
    ownerInvestor: string | null;
  } | null;
}

export function ContractDetailHeader({ projectId, contractId, docName, docType, status, expiryDate, canEdit, form }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [now] = useState(Date.now);
  const expired = expiryDate != null && new Date(expiryDate).getTime() <= now;

  async function remove() {
    const res = await softDeleteContract(contractId, projectId);
    if (!res.ok) return void toast.error(res.message);
    toast.success("Đã xóa hợp đồng");
    router.push(`/du-an/${projectId}/hop-dong`);
  }

  return (
    <div className="space-y-2">
      <Link href={`/du-an/${projectId}/hop-dong`} className="text-sm text-muted-foreground hover:underline">← Danh mục hợp đồng</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{docName}</h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <span className="rounded bg-muted px-2 py-0.5">{docTypeLabel(docType)}</span>
            <span className="rounded bg-muted px-2 py-0.5">{statusLabel(status)}</span>
            {expiryDate && (
              <span className={expired ? "rounded bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-500/10 dark:text-red-300" : "rounded bg-muted px-2 py-0.5"}>
                Hết hạn {formatDate(expiryDate)}
              </span>
            )}
          </div>
        </div>
        {canEdit && form && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>Sửa</Button>
            <Button variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)}>Xóa</Button>
          </div>
        )}
      </div>

      {form && (
        <CrudDialog title="Sửa hợp đồng" open={editOpen} onOpenChange={setEditOpen}>
          <ContractForm
            mode="edit"
            projectId={projectId}
            contractId={contractId}
            {...form}
            onSaved={() => { setEditOpen(false); router.refresh(); }}
          />
        </CrudDialog>
      )}
      <CrudDialog title="Xóa hợp đồng" open={deleteOpen} onOpenChange={setDeleteOpen}>
        <p className="text-sm text-muted-foreground">
          Xóa <strong>{docName}</strong>? Hợp đồng bị ẩn khỏi danh mục; số liệu ở sổ gốc không đổi.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeleteOpen(false)}>Hủy</Button>
          <Button variant="destructive" onClick={remove}>Xóa</Button>
        </div>
      </CrudDialog>
    </div>
  );
}
