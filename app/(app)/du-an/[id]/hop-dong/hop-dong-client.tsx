"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { type ContractInput } from "@/lib/du-an/schemas";
import { createContract, updateContract, softDeleteContract } from "@/lib/du-an/contract-service";
import { vndFormatter } from "@/components/ag-grid-base";
import { ContractForm } from "./hop-dong-form";

type ContractRow = {
  id: number;
  projectId: number;
  docName: string;
  docType: string;
  partyName: string | null;
  valueVnd: unknown;
  signedDate: Date | null;
  expiryDate: Date | null;
  status: string;
  storage: string | null;
  note: string | null;
};

const DOC_TYPE_LABELS: Record<string, string> = { contract: "Hợp đồng", license: "Giấy phép" };
const STATUS_LABELS: Record<string, string> = { active: "Hiệu lực", expired: "Hết hạn", terminated: "Đã hủy" };

interface Props {
  projectId: number;
  initialData: ContractRow[];
  /** Warning threshold in days from ProjectSettings (default 90) */
  warningDays?: number;
}

export function HopDongClient({ projectId, initialData, warningDays = 90 }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ContractRow | null>(null);
  const [, startTransition] = useTransition();

  async function handleCreate(data: ContractInput) {
    await createContract({ ...data, projectId });
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  async function handleEdit(data: ContractInput) {
    if (!editTarget) return;
    await updateContract(editTarget.id, { ...data, projectId });
    setEditTarget(null);
    startTransition(() => router.refresh());
  }

  async function handleDelete(row: ContractRow) {
    await softDeleteContract(row.id, projectId);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Hợp Đồng & Giấy Phép</h2>
        <Button onClick={() => setCreateOpen(true)}>Thêm mới</Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">Tên tài liệu</th>
              <th className="px-3 py-2 text-left">Loại</th>
              <th className="px-3 py-2 text-left">Đối tác</th>
              <th className="px-3 py-2 text-right">Giá trị</th>
              <th className="px-3 py-2 text-left">Ngày ký</th>
              <th className="px-3 py-2 text-left">Hết hạn</th>
              <th className="px-3 py-2 text-left">Trạng thái</th>
              <th className="px-3 py-2 w-[120px]">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {initialData.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Chưa có hợp đồng</td></tr>
            ) : initialData.map((row) => {
              const daysToExpiry = row.expiryDate
                ? Math.ceil((new Date(row.expiryDate).getTime() - Date.now()) / 86400000)
                : null;
              // Warn for contracts expiring within warningDays; also highlight already-expired (<=0) in red
              const isExpired = daysToExpiry !== null && daysToExpiry <= 0;
              const isWarning = daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry <= warningDays;
              return (
                <tr key={row.id} className={`border-t ${isExpired ? "bg-red-50" : isWarning ? "bg-yellow-50" : ""}`}>
                  <td className="px-3 py-2">{row.docName}</td>
                  <td className="px-3 py-2">{DOC_TYPE_LABELS[row.docType] ?? row.docType}</td>
                  <td className="px-3 py-2">{row.partyName ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{row.valueVnd ? vndFormatter(Number(row.valueVnd)) : "—"}</td>
                  <td className="px-3 py-2">{row.signedDate ? new Date(row.signedDate).toLocaleDateString("vi-VN") : "—"}</td>
                  <td className="px-3 py-2">
                    {row.expiryDate ? (
                      <span className={isExpired ? "text-red-700 font-medium" : isWarning ? "text-yellow-700 font-medium" : ""}>
                        {new Date(row.expiryDate).toLocaleDateString("vi-VN")}
                        {isWarning && ` (còn ${daysToExpiry}n)`}
                        {isExpired && ` (đã hết hạn ${Math.abs(daysToExpiry!)}n)`}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2">{STATUS_LABELS[row.status] ?? row.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setEditTarget(row)}>Sửa</Button>
                      <DeleteConfirmDialog
                        itemName={row.docName}
                        onConfirm={() => handleDelete(row)}
                        trigger={<Button variant="outline" size="sm" className="text-destructive">Xóa</Button>}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CrudDialog title="Thêm hợp đồng" open={createOpen} onOpenChange={setCreateOpen}>
        <ContractForm defaultValues={{ projectId }} onSubmit={handleCreate} />
      </CrudDialog>

      <CrudDialog title="Sửa hợp đồng" open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        {editTarget && (
          <ContractForm
            defaultValues={{
              projectId,
              docName: editTarget.docName,
              docType: editTarget.docType as "contract" | "license",
              partyName: editTarget.partyName ?? "",
              valueVnd: editTarget.valueVnd ? Number(editTarget.valueVnd) : undefined,
              signedDate: editTarget.signedDate ? new Date(editTarget.signedDate).toISOString().split("T")[0] : "",
              expiryDate: editTarget.expiryDate ? new Date(editTarget.expiryDate).toISOString().split("T")[0] : "",
              status: editTarget.status as "active" | "expired" | "terminated",
              storage: editTarget.storage ?? "",
            }}
            onSubmit={handleEdit}
          />
        )}
      </CrudDialog>
    </div>
  );
}
