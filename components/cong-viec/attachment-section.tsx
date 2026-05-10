"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteAttachmentAction,
  listAttachmentsAction,
  uploadAttachmentAction,
} from "@/app/(app)/van-hanh/cong-viec/attachments-actions";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
]);

interface AttachmentRow {
  id: number;
  taskId: number;
  uploaderId: string;
  uploaderName: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string | Date;
  canDelete: boolean;
}

interface Props {
  taskId: number;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function iconFor(mime: string): string {
  if (mime === "application/pdf") return "📄";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.includes("spreadsheet")) return "📊";
  if (mime.includes("wordprocessing")) return "📝";
  if (mime === "application/zip") return "🗜️";
  return "📎";
}

export function AttachmentSection({ taskId }: Props) {
  const [items, setItems] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, startBusy] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const rows = await listAttachmentsAction(taskId);
      setItems(rows as AttachmentRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    startBusy(async () => {
      for (const file of list) {
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: vượt quá 25MB`);
          continue;
        }
        if (!ALLOWED.has(file.type)) {
          toast.error(`${file.name}: loại file không được phép`);
          continue;
        }
        const tid = toast.loading(`${file.name} — đang tải lên (${fmtSize(file.size)})…`);
        try {
          const fd = new FormData();
          fd.set("taskId", String(taskId));
          fd.set("file", file);
          const row = await uploadAttachmentAction(fd);
          setItems((cur) => [row as AttachmentRow, ...cur]);
          toast.success(`${file.name} đã tải lên`, { id: tid });
        } catch (err) {
          toast.error(`${file.name}: ${err instanceof Error ? err.message : String(err)}`, { id: tid });
        }
      }
    });
  }

  function doDelete(id: number) {
    if (!confirm("Xoá file này?")) return;
    startBusy(async () => {
      try {
        await deleteAttachmentAction(id);
        setItems((cur) => cur.filter((a) => a.id !== id));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="border-t pt-3">
      <h3 className="text-sm font-semibold mb-2">Tệp đính kèm ({items.length})</h3>

      {loading ? (
        <p className="text-xs text-muted-foreground mb-2">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-2">Chưa có tệp.</p>
      ) : (
        <ul className="space-y-1 mb-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded border bg-slate-50 px-2 py-1 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span>{iconFor(a.mimeType)}</span>
                <a
                  href={`/api/tasks/${a.taskId}/attachments/${a.id}`}
                  target="_blank"
                  rel="noopener"
                  className="truncate text-blue-600 hover:underline"
                  title={a.filename}
                >
                  {a.filename}
                </a>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {fmtSize(a.sizeBytes)} • {a.uploaderName ?? "?"} • {fmtDate(a.createdAt)}
                </span>
              </div>
              {a.canDelete && (
                <button
                  type="button"
                  className="text-[11px] text-red-600 hover:underline"
                  onClick={() => doDelete(a.id)}
                  disabled={busy}
                >
                  Xoá
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div
        className={`rounded border-2 border-dashed p-3 text-center text-xs ${dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15" : "border-border"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx,.zip"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="mb-1 text-muted-foreground">Kéo thả tệp vào đây (PDF, ảnh, Office, zip; tối đa 25MB)</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          {busy ? "Đang tải lên…" : "Chọn tệp"}
        </Button>
      </div>
    </div>
  );
}
