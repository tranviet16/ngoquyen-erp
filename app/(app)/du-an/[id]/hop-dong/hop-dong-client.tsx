"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import type {
  DataGridColumn,
  DataGridHandlers,
  RowWithId,
  SelectOption,
} from "@/components/data-grid/types";
import { type ContractInput } from "@/lib/du-an/schemas";
import {
  createContract,
  updateContract,
  softDeleteContract,
} from "@/lib/du-an/contract-service";
import { ContractForm } from "./hop-dong-form";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

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

interface ContractGridRow extends RowWithId {
  docName: string;
  docType: string;
  partyName: string;
  valueVnd: number;
  signedDate: string;
  expiryDate: string;
  status: string;
  storage: string;
  note: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "Hợp đồng",
  license: "Giấy phép",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Hiệu lực",
  expired: "Hết hạn",
  terminated: "Chấm dứt",
};

const docTypeOptions: SelectOption[] = Object.entries(DOC_TYPE_LABELS).map(
  ([id, name]) => ({ id, name }),
);
const statusOptions: SelectOption[] = Object.entries(STATUS_LABELS).map(
  ([id, name]) => ({ id, name }),
);

function toIsoOrEmpty(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

interface Props {
  projectId: number;
  initialData: ContractRow[];
  /** Warning threshold in days from ProjectSettings (default 90) */
  warningDays?: number;
}

export function HopDongClient({ projectId, initialData, warningDays = 90 }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [, startTransition] = useTransition();

  const rows: ContractGridRow[] = initialData.map((r) => ({
    id: r.id,
    docName: r.docName,
    docType: r.docType,
    partyName: r.partyName ?? "",
    valueVnd: r.valueVnd ? Number(r.valueVnd) : 0,
    signedDate: toIsoOrEmpty(r.signedDate),
    expiryDate: toIsoOrEmpty(r.expiryDate),
    status: r.status,
    storage: r.storage ?? "",
    note: r.note ?? "",
  }));

  const expiringSoon = initialData.filter((r) => {
    if (!r.expiryDate) return false;
    const days = Math.ceil(
      (new Date(r.expiryDate).getTime() - Date.now()) / 86400000,
    );
    return days > 0 && days <= warningDays;
  }).length;
  const expired = initialData.filter((r) => {
    if (!r.expiryDate) return false;
    return new Date(r.expiryDate).getTime() <= Date.now();
  }).length;

  const columns: DataGridColumn<ContractGridRow>[] = [
    { id: "docName", title: "Tên tài liệu", kind: "text", width: 220 },
    {
      id: "docType",
      title: "Loại",
      kind: "select",
      width: 120,
      options: docTypeOptions,
      format: (v) => DOC_TYPE_LABELS[String(v)] ?? String(v ?? ""),
    },
    { id: "partyName", title: "Đối tác", kind: "text", width: 180 },
    { id: "valueVnd", title: "Giá trị", kind: "currency", width: 140 },
    { id: "signedDate", title: "Ngày ký", kind: "date", width: 110 },
    { id: "expiryDate", title: "Hết hạn", kind: "date", width: 110 },
    {
      id: "status",
      title: "Trạng thái",
      kind: "select",
      width: 120,
      options: statusOptions,
      format: (v) => STATUS_LABELS[String(v)] ?? String(v ?? ""),
    },
    { id: "storage", title: "Lưu trữ", kind: "text", width: 140 },
    { id: "note", title: "Ghi chú", kind: "text", width: 200 },
  ];

  const patchContract = async (id: number, patch: Partial<ContractGridRow>) => {
    const current = initialData.find((r) => r.id === id);
    if (!current) throw new Error(`#${id} không tồn tại`);
    const input: ContractInput = {
      projectId,
      docName: typeof patch.docName === "string" ? patch.docName : current.docName,
      docType: (typeof patch.docType === "string" ? patch.docType : current.docType) as ContractInput["docType"],
      partyName:
        typeof patch.partyName === "string"
          ? (patch.partyName || undefined)
          : (current.partyName ?? undefined),
      valueVnd:
        typeof patch.valueVnd === "number"
          ? patch.valueVnd
          : current.valueVnd
            ? Number(current.valueVnd)
            : undefined,
      signedDate:
        typeof patch.signedDate === "string"
          ? (patch.signedDate || undefined)
          : (toIsoOrEmpty(current.signedDate) || undefined),
      expiryDate:
        typeof patch.expiryDate === "string"
          ? (patch.expiryDate || undefined)
          : (toIsoOrEmpty(current.expiryDate) || undefined),
      status: (typeof patch.status === "string" ? patch.status : current.status) as ContractInput["status"],
      storage:
        typeof patch.storage === "string"
          ? (patch.storage || undefined)
          : (current.storage ?? undefined),
      note:
        typeof patch.note === "string"
          ? (patch.note || undefined)
          : (current.note ?? undefined),
    };
    await updateContract(id, input);
  };

  const handlers: DataGridHandlers<ContractGridRow> = {
    onCellEdit: async (id, col, value) => {
      try {
        await patchContract(id, { [col]: value } as Partial<ContractGridRow>);
        toast.success("Đã lưu");
        startTransition(() => router.refresh());
      } catch (err) {
        toast.error("Lưu thất bại: " + (err instanceof Error ? err.message : String(err)));
        startTransition(() => router.refresh());
      }
    },
    onDeleteRows: async (ids) => {
      for (const id of ids) {
        await softDeleteContract(id, projectId);
      }
      startTransition(() => router.refresh());
    },
  };

  async function handleCreate(data: ContractInput) {
    await createContract({ ...data, projectId });
    setCreateOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Hợp đồng & giấy phép</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sửa trực tiếp trong bảng. Cảnh báo các tài liệu sắp hết hạn trong {warningDays} ngày tới.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Thêm mới</Button>
      </div>

      {(expired > 0 || expiringSoon > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {expired > 0 && (
            <span className="rounded bg-red-50 px-2 py-1 text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {expired} đã hết hạn
            </span>
          )}
          {expiringSoon > 0 && (
            <span className="rounded bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              {expiringSoon} sắp hết hạn (≤ {warningDays}n)
            </span>
          )}
        </div>
      )}

      <DataGrid<ContractGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        height={500}
      />

      <CrudDialog title="Thêm hợp đồng" open={createOpen} onOpenChange={setCreateOpen}>
        <ContractForm defaultValues={{ projectId }} onSubmit={handleCreate} />
      </CrudDialog>
    </div>
  );
}
