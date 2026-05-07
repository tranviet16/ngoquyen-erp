"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CrudDialog, DeleteConfirmDialog } from "@/components/master-data/crud-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { type ContractInput } from "@/lib/du-an/schemas";
import { createContract, updateContract, softDeleteContract } from "@/lib/du-an/contract-service";
import { formatVND, formatDate } from "@/lib/utils/format";
import { FileText } from "lucide-react";
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

  function renderContractStatus(row: ContractRow) {
    if (row.status === "active") {
      return <StatusBadge label="Hiệu lực" tone="success" />;
    }
    return <StatusBadge status={row.status} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Hợp đồng & giấy phép</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cảnh báo các tài liệu sắp hết hạn trong {warningDays} ngày tới.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Thêm mới</Button>
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted/40">
              <tr>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tên tài liệu</th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Loại</th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Đối tác</th>
                <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Giá trị</th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ngày ký</th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hết hạn</th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trạng thái</th>
                <th className="border-b px-3 py-2 w-[120px]" />
              </tr>
            </thead>
            <tbody>
              {initialData.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={FileText}
                      title="Chưa có hợp đồng"
                      description="Thêm hợp đồng hoặc giấy phép để theo dõi giá trị và hạn hiệu lực."
                    />
                  </td>
                </tr>
              ) : initialData.map((row) => {
                const daysToExpiry = row.expiryDate
                  ? Math.ceil((new Date(row.expiryDate).getTime() - Date.now()) / 86400000)
                  : null;
                const isExpired = daysToExpiry !== null && daysToExpiry <= 0;
                const isWarning = daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry <= warningDays;
                return (
                  <tr
                    key={row.id}
                    className={`even:bg-muted/20 hover:bg-muted/40 transition-colors ${
                      isExpired
                        ? "bg-red-50/60 dark:bg-red-500/5"
                        : isWarning
                        ? "bg-amber-50/60 dark:bg-amber-500/5"
                        : ""
                    }`}
                  >
                    <td className="border-b px-3 py-2 font-medium">{row.docName}</td>
                    <td className="border-b px-3 py-2">{DOC_TYPE_LABELS[row.docType] ?? row.docType}</td>
                    <td className="border-b px-3 py-2">{row.partyName ?? "—"}</td>
                    <td className="border-b px-3 py-2 text-right tabular-nums">
                      {row.valueVnd ? formatVND(Number(row.valueVnd)) : "—"}
                    </td>
                    <td className="border-b px-3 py-2">{formatDate(row.signedDate)}</td>
                    <td className="border-b px-3 py-2">
                      {row.expiryDate ? (
                        <span
                          className={
                            isExpired
                              ? "text-red-700 font-medium dark:text-red-300"
                              : isWarning
                              ? "text-amber-700 font-medium dark:text-amber-300"
                              : ""
                          }
                        >
                          {formatDate(row.expiryDate)}
                          {isWarning && ` (còn ${daysToExpiry}n)`}
                          {isExpired && ` (đã hết hạn ${Math.abs(daysToExpiry!)}n)`}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="border-b px-3 py-2">{renderContractStatus(row)}</td>
                    <td className="border-b px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setEditTarget(row)}>Sửa</Button>
                        <DeleteConfirmDialog
                          itemName={row.docName}
                          onConfirm={() => handleDelete(row)}
                          trigger={
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                              Xóa
                            </Button>
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
