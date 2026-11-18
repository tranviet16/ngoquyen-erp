"use client";

/**
 * Danh mục hợp đồng của công trình: bảng thường, sửa / xóa qua hộp thoại. Tên tài liệu mở màn chi
 * tiết `/du-an/[id]/hop-dong/[contractId]`. Cột "Công nợ còn lại (TT)" là số tổng của cặp đối tác ×
 * công trình (cho mọi người đọc được dự án); không có dòng tổng vì nhiều hợp đồng cùng cặp sẽ cộng trùng.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/master-data/crud-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { softDeleteContract } from "@/lib/du-an/contract-service";
import { CONTRACT_PARTY_KIND_SHORT, docTypeLabel, isPartyKind, statusLabel } from "@/lib/du-an/contract-labels";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { ContractForm } from "./hop-dong-form";
import { toContractFormValues, withBoundPartyOptions, type ContractRowLike } from "@/lib/du-an/contract-form-values";

type PartyRef = { id: number; name: string; deletedAt: Date | string | null } | null;

export interface ContractListRow extends ContractRowLike {
  id: number;
  supplier?: PartyRef;
  contractor?: PartyRef;
}

/** Số của cột "Công nợ còn lại (TT)" theo id hợp đồng. `debtTt` null: loại không có số. */
export type ContractListFigures = Record<number, { debtTt: string | null; groupSize: number }>;

interface Props {
  projectId: number;
  initialData: ContractListRow[];
  /** Ngưỡng cảnh báo hết hạn (ngày) từ ProjectSettings (mặc định 90). */
  warningDays?: number;
  canCreate: boolean;
  canEdit: boolean;
  supplierOptions: { id: number; name: string }[];
  contractorOptions: { id: number; name: string }[];
  ownerInvestor: string | null;
  figures?: ContractListFigures;
}

function PartyCell({ row }: { row: ContractListRow }) {
  if (row.docType === "contract" && isPartyKind(row.partyKind)) {
    const party = row.partyKind === "ncc" ? row.supplier : row.partyKind === "doi_thi_cong" ? row.contractor : null;
    const name = party?.name ?? row.partyName ?? "";
    return (
      <span>
        {CONTRACT_PARTY_KIND_SHORT[row.partyKind]} · {name || "—"}
        {party?.deletedAt && <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">(đã xóa khỏi danh mục)</span>}
      </span>
    );
  }
  if (!row.partyName) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-muted-foreground">
      {row.partyName}
      {row.docType === "contract" && <span className="ml-1 text-xs">(chưa gắn danh mục)</span>}
    </span>
  );
}

export function HopDongClient({ projectId, initialData, warningDays = 90, canCreate, canEdit, supplierOptions, contractorOptions, ownerInvestor, figures }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ContractListRow | null>(null);
  const [deleting, setDeleting] = useState<ContractListRow | null>(null);
  const [currentTime] = useState(Date.now);
  const [busy, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());
  const daysLeft = (r: ContractListRow) =>
    r.expiryDate ? Math.ceil((new Date(r.expiryDate).getTime() - currentTime) / 86_400_000) : null;
  const expired = initialData.filter((r) => { const d = daysLeft(r); return d !== null && d <= 0; }).length;
  const expiringSoon = initialData.filter((r) => { const d = daysLeft(r); return d !== null && d > 0 && d <= warningDays; }).length;
  const unbound = initialData.filter((r) => r.docType === "contract" && !isPartyKind(r.partyKind)).length;

  async function confirmDelete() {
    if (!deleting) return;
    const res = await softDeleteContract(deleting.id, projectId);
    if (!res.ok) return void toast.error(res.message);
    toast.success("Đã xóa hợp đồng");
    setDeleting(null);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Hợp đồng & giấy phép</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Bấm tên tài liệu để xem chi tiết. Cảnh báo các tài liệu sắp hết hạn trong {warningDays} ngày tới.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/du-an/${projectId}/hop-dong/hoa-don-cdt`} />}>Sổ hóa đơn xuất CĐT</Button>
          {canCreate && <Button onClick={() => setCreateOpen(true)}>Thêm hợp đồng</Button>}
        </div>
      </div>

      {(expired > 0 || expiringSoon > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {expired > 0 && <span className="rounded bg-red-50 px-2 py-1 text-red-700 dark:bg-red-500/10 dark:text-red-300">{expired} đã hết hạn</span>}
          {expiringSoon > 0 && (
            <span className="rounded bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              {expiringSoon} sắp hết hạn (≤ {warningDays}n)
            </span>
          )}
        </div>
      )}
      {unbound > 0 && (
        <div className="rounded bg-muted px-3 py-2 text-sm text-muted-foreground">
          {unbound} hợp đồng chưa gắn đối tác nên chưa có số liệu.
        </div>
      )}

      {initialData.length === 0 ? (
        <div className="rounded border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Chưa có hợp đồng nào. Bấm «Thêm hợp đồng» để tạo; bản scan có thể đính kèm sau.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên tài liệu</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Đối tác</TableHead>
              <TableHead className="text-right">Giá trị theo DT</TableHead>
              <TableHead className="text-right">Giá trị theo TT</TableHead>
              <TableHead className="text-right">Công nợ còn lại (TT)</TableHead>
              <TableHead>Ngày ký</TableHead>
              <TableHead>Hết hạn</TableHead>
              <TableHead>Trạng thái</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialData.map((r) => {
              const d = daysLeft(r);
              const fig = figures?.[r.id];
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link className="text-primary hover:underline" href={`/du-an/${projectId}/hop-dong/${r.id}`}>{r.docName}</Link>
                  </TableCell>
                  <TableCell>{docTypeLabel(r.docType)}</TableCell>
                  <TableCell><PartyCell row={r} /></TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.valueVnd as number | string | null)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.docType === "contract" ? formatNumber(r.valueTtVnd as number | string | null) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fig?.debtTt == null ? "—" : formatNumber(fig.debtTt)}
                    {fig && fig.groupSize > 1 && <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">gộp {fig.groupSize}</span>}
                  </TableCell>
                  <TableCell>{formatDate(r.signedDate)}</TableCell>
                  <TableCell>
                    {formatDate(r.expiryDate)}
                    {d !== null && d <= 0 && <span className="ml-1 rounded bg-red-50 px-1 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">hết hạn</span>}
                    {d !== null && d > 0 && d <= warningDays && (
                      <span className="ml-1 rounded bg-amber-50 px-1 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">còn {d}n</span>
                    )}
                  </TableCell>
                  <TableCell>{statusLabel(r.status)}</TableCell>
                  {canEdit && (
                    <TableCell className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Sửa</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(r)}>Xóa</Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <CrudDialog title="Thêm hợp đồng" open={createOpen} onOpenChange={setCreateOpen}>
        <ContractForm
          mode="create"
          projectId={projectId}
          initialValues={toContractFormValues()}
          supplierOptions={supplierOptions}
          contractorOptions={contractorOptions}
          ownerInvestor={ownerInvestor}
          onSaved={() => { setCreateOpen(false); refresh(); }}
        />
      </CrudDialog>

      <CrudDialog title="Sửa hợp đồng" open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <ContractForm
            key={editing.id}
            mode="edit"
            projectId={projectId}
            contractId={editing.id}
            initialValues={toContractFormValues(editing)}
            {...withBoundPartyOptions(editing, supplierOptions, contractorOptions)}
            ownerInvestor={ownerInvestor}
            onSaved={() => { setEditing(null); refresh(); }}
          />
        )}
      </CrudDialog>

      <CrudDialog title="Xóa hợp đồng" open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <p className="text-sm text-muted-foreground">
          Xóa <strong>{deleting?.docName}</strong>? Hợp đồng bị ẩn khỏi danh mục; số liệu ở sổ gốc không đổi.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeleting(null)}>Hủy</Button>
          <Button variant="destructive" disabled={busy} onClick={confirmDelete}>Xóa</Button>
        </div>
      </CrudDialog>
    </div>
  );
}
