"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BUNDLE_MAX_FILES,
  BUNDLE_MAX_TOTAL_BYTES,
  BundleError,
  bundleSkipReason,
  normalizeBundlePath,
} from "@/lib/import/bundle-path";
import { startPreview } from "./import-actions";

interface AdapterOption {
  name: string;
  label: string;
  acceptsBundle: boolean;
}

interface Props {
  adapters: AdapterOption[];
}

interface FolderSelection {
  accepted: { path: string; file: File }[];
  skippedPaths: string[];
  totalBytes: number;
}

/** Tách file của thư mục đã chọn: chỉ gửi .xlsx/.csv (không ẩn); file khác chỉ gửi đường dẫn để liệt kê. */
function splitFolder(files: FileList | null): FolderSelection {
  const selection: FolderSelection = { accepted: [], skippedPaths: [], totalBytes: 0 };
  for (const file of Array.from(files ?? [])) {
    const rawPath = file.webkitRelativePath || file.name;
    const path = normalizeBundlePath(rawPath); // ném BundleError khi đường dẫn không hợp lệ
    if (bundleSkipReason(path)) {
      selection.skippedPaths.push(rawPath);
      continue;
    }
    selection.accepted.push({ path: rawPath, file });
    selection.totalBytes += file.size;
  }
  return selection;
}

function assertFolderLimits(selection: FolderSelection): void {
  if (selection.accepted.length === 0) throw new BundleError("Thư mục không có file .xlsx / .csv nào");
  if (selection.accepted.length > BUNDLE_MAX_FILES) {
    throw new BundleError(`Thư mục có ${selection.accepted.length} file .xlsx/.csv — tối đa ${BUNDLE_MAX_FILES}`);
  }
  if (selection.totalBytes > BUNDLE_MAX_TOTAL_BYTES) throw new BundleError("Thư mục vượt quá 20 MB file .xlsx/.csv");
}

export function ImportUploadForm({ adapters }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedAdapter, setSelectedAdapter] = useState(adapters[0]?.name ?? "");
  const [folderSummary, setFolderSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const folderRef = useRef<HTMLInputElement | null>(null);
  const isBundle = adapters.find((a) => a.name === selectedAdapter)?.acceptsBundle ?? false;

  // `webkitdirectory` chưa có trong kiểu React — gắn thuộc tính DOM trực tiếp.
  const setFolderInput = useCallback((el: HTMLInputElement | null) => {
    folderRef.current = el;
    el?.setAttribute("webkitdirectory", "");
  }, []);

  function handleFolderChange(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const selection = splitFolder(e.target.files);
      const mb = (selection.totalBytes / 1024 / 1024).toFixed(1);
      setFolderSummary(
        `${selection.accepted.length} file .xlsx/.csv (${mb} MB)` +
          (selection.skippedPaths.length > 0 ? `, bỏ qua ${selection.skippedPaths.length} file khác` : ""),
      );
    } catch (err) {
      setFolderSummary(null);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  function buildFormData(): FormData {
    const data = new FormData();
    data.set("adapter", selectedAdapter);
    if (!isBundle) {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Chọn file Excel");
      data.set("file", file);
      return data;
    }
    const selection = splitFolder(folderRef.current?.files ?? null);
    assertFolderLimits(selection);
    for (const { path, file } of selection.accepted) {
      data.append("files", file);
      data.append("paths", path);
    }
    data.set("skipped", JSON.stringify(selection.skippedPaths));
    return data;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let data: FormData;
    try {
      data = buildFormData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }

    startTransition(async () => {
      const result = await startPreview(data);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (result.duplicateWarning) {
        toast.warning("Nguồn này đã được import trước đó (hash trùng). Kiểm tra kỹ trước khi tiếp tục.");
      }
      if (result.blockingCount > 0 || result.missingAckCount > 0) {
        toast.warning(
          `Còn ${result.blockingCount} lỗi chặn, ${result.missingAckCount} mục cần xác nhận. Xem trang chi tiết.`,
        );
      } else if (result.validationErrorCount > 0) {
        toast.error(`Có ${result.validationErrorCount} lỗi validation. Kiểm tra trang chi tiết.`);
      } else {
        toast.success(`Đã phân tích ${result.rowsTotal} dòng. Vào trang chi tiết để ghi.`);
      }
      router.push(`/admin/import/${result.runId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">Adapter (loại file)</label>
          <select
            name="adapter"
            value={selectedAdapter}
            onChange={(e) => {
              setSelectedAdapter(e.target.value);
              setFolderSummary(null);
            }}
            className="w-full border rounded px-3 py-2 text-sm"
            required
          >
            {adapters.map((a) => (
              <option key={a.name} value={a.name}>{a.label}</option>
            ))}
          </select>
        </div>
        {isBundle ? (
          <div>
            <label className="text-sm font-medium block mb-1">Thư mục nguồn (.xlsx, .csv)</label>
            <input
              key="folder"
              ref={setFolderInput}
              type="file"
              name="folder"
              multiple
              required
              onChange={handleFolderChange}
              className="w-full border rounded px-3 py-2 text-sm file:mr-2 file:border-0 file:bg-primary file:text-primary-foreground file:px-2 file:py-1 file:rounded file:text-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {folderSummary ??
                `Chọn cả thư mục. Chỉ nhận .xlsx/.csv (tối đa ${BUNDLE_MAX_FILES} file, 20 MB); file khác được bỏ qua và liệt kê.`}
            </p>
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium block mb-1">File Excel (.xlsx)</label>
            <input
              key="file"
              ref={fileRef}
              type="file"
              name="file"
              accept=".xlsx,.xls"
              required
              className="w-full border rounded px-3 py-2 text-sm file:mr-2 file:border-0 file:bg-primary file:text-primary-foreground file:px-2 file:py-1 file:rounded file:text-xs"
            />
          </div>
        )}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50"
      >
        {isPending ? "Đang phân tích..." : "Tải lên và phân tích"}
      </button>
    </form>
  );
}
