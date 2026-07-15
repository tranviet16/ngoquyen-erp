"use client";

/**
 * ExcelExportButton: triggers POST /api/export/excel and downloads the file.
 * PrintButton: uses browser print with configurable page/fit settings.
 */

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

interface ExcelExportButtonProps {
  template: string;
  params: Record<string, unknown>;
  label?: string;
  filename?: string;
}

type PrintPageSize = "a4" | "a3";
type PrintOrientation = "landscape" | "portrait";

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
  const styleKey = useId().replace(/:/g, "");
  const [pageSize, setPageSize] = useState<PrintPageSize>("a3");
  const [orientation, setOrientation] = useState<PrintOrientation>("landscape");
  const [fitWidth, setFitWidth] = useState(true);
  const [compact, setCompact] = useState(true);

  function clearPrintState() {
    document.body.classList.remove("print-export-active", "print-fit-width", "print-compact");
    document.getElementById(`print-page-style-${styleKey}`)?.remove();
  }

  useEffect(() => {
    window.addEventListener("afterprint", clearPrintState);
    return () => {
      window.removeEventListener("afterprint", clearPrintState);
      clearPrintState();
    };
  });

  function handlePrint() {
    clearPrintState();
    const style = document.createElement("style");
    style.id = `print-page-style-${styleKey}`;
    style.textContent = `@page { size: ${pageSize.toUpperCase()} ${orientation}; margin: 8mm; }`;
    document.head.appendChild(style);
    document.body.classList.add("print-export-active");
    document.body.classList.toggle("print-fit-width", fitWidth);
    document.body.classList.toggle("print-compact", compact);
    window.setTimeout(() => window.print(), 30);
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Khổ giấy"
        value={pageSize}
        onChange={(e) => setPageSize(e.target.value as PrintPageSize)}
        className="h-8 rounded border bg-background px-2 text-xs"
      >
        <option value="a3">A3</option>
        <option value="a4">A4</option>
      </select>
      <select
        aria-label="Hướng giấy"
        value={orientation}
        onChange={(e) => setOrientation(e.target.value as PrintOrientation)}
        className="h-8 rounded border bg-background px-2 text-xs"
      >
        <option value="landscape">Ngang</option>
        <option value="portrait">Dọc</option>
      </select>
      <label className="flex h-8 items-center gap-1 rounded border px-2 text-xs">
        <input type="checkbox" checked={fitWidth} onChange={(e) => setFitWidth(e.target.checked)} />
        Vừa ngang
      </label>
      <label className="flex h-8 items-center gap-1 rounded border px-2 text-xs">
        <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
        Gọn
      </label>
      <button onClick={handlePrint} className="px-3 py-1.5 text-sm border rounded hover:bg-muted">
        {label}
      </button>
    </div>
  );
}
