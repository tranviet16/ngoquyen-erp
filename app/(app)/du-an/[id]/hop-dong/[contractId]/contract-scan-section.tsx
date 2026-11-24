"use client";

/**
 * Bản scan của hợp đồng: bảng tệp (Xem / Tải về / Xóa / Xóa vĩnh viễn), tải lên nhiều tệp — gửi tuần
 * tự từng tệp, mỗi tệp báo kết quả riêng. Client chặn trước tệp > 25 MB; server kiểm lại tất cả.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils/format";
import { deleteContractScan, purgeContractScan, uploadContractScan } from "./scan-actions";

/** Khớp MAX_SCAN_BYTES của server; body server action (multipart) được đặt rộng hơn ở next.config.ts. */
const MAX_BYTES = 25 * 1024 * 1024;
const TYPE_LABEL: Record<string, string> = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG" };

export interface ScanRow {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date | string;
  deletedAt: Date | string | null;
  uploaderName: string;
}

interface Props {
  projectId: number;
  contractId: number;
  scans: ScanRow[];
  canEdit: boolean;
  isAdmin: boolean;
  /** Hợp đồng đã xóa (admin mở để dọn): không xem / tải được, chỉ xóa vĩnh viễn. */
  contractDeleted?: boolean;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;

export function ContractScanSection({ projectId, contractId, scans, canEdit, isAdmin, contractDeleted = false }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState<{ id: number; purge: boolean } | null>(null);
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const href = (id: number) => `/api/du-an/${projectId}/hop-dong/${contractId}/scan/${id}`;
  const active = scans.filter((s) => !s.deletedAt);
  const deleted = isAdmin ? scans.filter((s) => s.deletedAt) : [];

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let okCount = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          toast.error(`«${file.name}» nặng ${mb(file.size)}, tối đa 25 MB`);
          continue;
        }
        const fd = new FormData();
        fd.set("projectId", String(projectId));
        fd.set("contractId", String(contractId));
        fd.set("file", file);
        try {
          const res = await uploadContractScan(fd);
          if (res.ok) {
            okCount += 1;
            toast.success(`Đã tải lên «${file.name}»`);
          } else toast.error(res.message);
        } catch {
          // Lời gọi bị từ chối trước khi tới action (mất mạng, phiên bản mới, quá giới hạn body).
          toast.error(`«${file.name}»: không gửi được tệp — tải lại trang rồi thử lại`);
        }
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      if (okCount > 0) refresh();
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    let res;
    try {
      res = confirm.purge ? await purgeContractScan(confirm.id, projectId) : await deleteContractScan(confirm.id, projectId);
    } catch {
      return void toast.error("Không gửi được yêu cầu — tải lại trang rồi thử lại");
    }
    if (!res.ok) return void toast.error(res.message);
    toast.success(confirm.purge ? "Đã xóa vĩnh viễn bản scan" : "Đã xóa bản scan");
    setConfirm(null);
    refresh();
  }

  const row = (s: ScanRow, isDeleted: boolean) => (
    <TableRow key={s.id} className={isDeleted ? "text-muted-foreground" : ""}>
      <TableCell className="max-w-[280px] truncate" title={s.filename}>{s.filename}{isDeleted && " (đã xóa)"}</TableCell>
      <TableCell>{TYPE_LABEL[s.mimeType] ?? s.mimeType}</TableCell>
      <TableCell className="text-right tabular-nums">{mb(s.sizeBytes)}</TableCell>
      <TableCell>{s.uploaderName}</TableCell>
      <TableCell>{formatDateTime(s.createdAt)}</TableCell>
      <TableCell className="whitespace-nowrap text-right">
        {confirm?.id === s.id ? (
          <>
            <span className="mr-2 text-xs">{confirm.purge ? "Xóa vĩnh viễn, không khôi phục được?" : "Xóa bản scan?"}</span>
            <Button size="sm" variant="destructive" onClick={runConfirm}>Xác nhận</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Hủy</Button>
          </>
        ) : (
          <>
            {!isDeleted && !contractDeleted && (
              <>
                <Button size="sm" variant="ghost" render={<a href={`${href(s.id)}?xem=1`} target="_blank" rel="noopener noreferrer" />}>Xem</Button>
                <Button size="sm" variant="ghost" render={<a href={href(s.id)} />}>Tải về</Button>
                {canEdit && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ id: s.id, purge: false })}>Xóa</Button>}
              </>
            )}
            {isAdmin && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ id: s.id, purge: true })}>Xóa vĩnh viễn</Button>}
          </>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">Bản scan</h4>
        {canEdit && (
          <div>
            <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => upload(e.target.files)} />
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Đang tải lên…" : "Tải lên bản scan"}
            </Button>
          </div>
        )}
      </div>
      {active.length === 0 && deleted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có bản scan. Bản scan không bắt buộc.</p>
      ) : (
        <Table className="min-w-0">
          <TableHeader>
            <TableRow>
              <TableHead>Tên tệp</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead className="text-right">Cỡ</TableHead>
              <TableHead>Người tải</TableHead>
              <TableHead>Ngày</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((s) => row(s, false))}
            {deleted.map((s) => row(s, true))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
