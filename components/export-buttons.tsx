"use client";

/**
 * ExcelExportButton: triggers POST /api/export/excel and downloads the file.
 * PrintButton: calls window.print() — uses @media print styles from globals.css.
 */

import { useState } from "react";
import { toast } from "sonner";

interface ExcelExportButtonProps {
  template: string;
  params: Record<string, unknown>;
  label?: string;
  filename?: string;
}

export function ExcelExportButton({ template, params, label = "Xuất Excel", filename }: ExcelExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch("/api/export/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, params }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(`Xuất Excel thất bại: ${err.error ?? res.statusText}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? `export-${template}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Đã tải file Excel");
    } catch (err) {
      toast.error(`Lỗi: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="no-print px-3 py-1.5 text-sm border rounded hover:bg-muted disabled:opacity-50 flex items-center gap-1.5"
    >
      <span>{loading ? "Đang xuất..." : label}</span>
    </button>
  );
}

export function PrintButton({ label = "Xuất PDF (In)" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print px-3 py-1.5 text-sm border rounded hover:bg-muted"
    >
      {label}
    </button>
  );
}
