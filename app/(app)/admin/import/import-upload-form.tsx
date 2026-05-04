"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startPreview } from "./import-actions";

interface AdapterOption { name: string; label: string; }

interface Props {
  adapters: AdapterOption[];
}

export function ImportUploadForm({ adapters }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedAdapter, setSelectedAdapter] = useState(adapters[0]?.name ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    startTransition(async () => {
      try {
        const result = await startPreview(data);
        if (result.duplicateWarning) {
          toast.warning(`File này đã được import trước đó (hash trùng). Kiểm tra kỹ trước khi tiếp tục.`);
        }
        if (result.validationErrors.length > 0) {
          toast.error(`Có ${result.validationErrors.length} lỗi validation. Kiểm tra trang chi tiết.`);
        } else {
          toast.success(`Đã phân tích ${result.parsedData.rows.length} dòng. Vào trang chi tiết để commit.`);
        }
        router.push(`/admin/import/${result.runId}`);
      } catch (err) {
        toast.error(`Lỗi: ${String(err)}`);
      }
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
            onChange={(e) => setSelectedAdapter(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            required
          >
            {adapters.map((a) => (
              <option key={a.name} value={a.name}>{a.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">File Excel (.xlsx)</label>
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls"
            required
            className="w-full border rounded px-3 py-2 text-sm file:mr-2 file:border-0 file:bg-primary file:text-primary-foreground file:px-2 file:py-1 file:rounded file:text-xs"
          />
        </div>
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
