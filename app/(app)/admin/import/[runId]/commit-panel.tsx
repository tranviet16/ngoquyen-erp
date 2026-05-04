"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { doCommit } from "../import-actions";

interface Props {
  runId: number;
}

export function CommitPanel({ runId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);

  function handleCommit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) { toast.error("Chọn lại file để commit"); return; }

    startTransition(async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const result = await doCommit(runId, base64, {});
        toast.success(`Commit thành công: ${result.rowsImported} dòng nhập, ${result.rowsSkipped} bỏ qua`);
        router.refresh();
      } catch (err) {
        toast.error(`Commit thất bại: ${String(err)}`);
      }
    });
  }

  return (
    <div className="border rounded-lg p-4 bg-blue-50 space-y-3">
      <h2 className="font-semibold text-blue-900">Sẵn sàng để commit</h2>
      <p className="text-sm text-blue-700">
        Upload lại file gốc để xác nhận và ghi dữ liệu vào cơ sở dữ liệu.
        Thao tác này không thể hoàn tác.
      </p>
      <form onSubmit={handleCommit} className="flex gap-3 items-end">
        <div>
          <label className="text-sm font-medium block mb-1">Chọn lại file Excel</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={isPending || !file}
          className="px-4 py-2 bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50"
        >
          {isPending ? "Đang commit..." : "Commit dữ liệu"}
        </button>
      </form>
      <p className="text-xs text-muted-foreground">
        Lưu ý: Nếu có conflict (NCC/Item chưa khớp), liên hệ admin để map thủ công
        trước khi commit. Conflict resolver UI đầy đủ sẽ có trong Phase 10.
      </p>
    </div>
  );
}
