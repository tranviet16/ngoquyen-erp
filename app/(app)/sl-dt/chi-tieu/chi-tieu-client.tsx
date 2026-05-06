"use client";

import { useState, useTransition } from "react";
import { fmtNum, fmtPct } from "@/lib/sl-dt/format";
import { updateProgressStatus } from "./actions";
import type { ChiTieuRow } from "@/lib/sl-dt/report-service";

interface Props {
  rows: ChiTieuRow[];
  year: number;
  month: number;
  milestoneOptions: string[];
}

const SETTLEMENT_OPTIONS = ["", "Đã quyết toán", "Chưa quyết toán"];

export function ChiTieuClient({ rows, year, month, milestoneOptions }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<{ milestoneText: string; settlementStatus: string }>({
    milestoneText: "",
    settlementStatus: "",
  });

  function startEdit(row: ChiTieuRow) {
    setEditing(row.lotId ?? null);
    setForm({
      milestoneText: row.milestoneText ?? "",
      settlementStatus: row.settlementStatus ?? "",
    });
  }

  function save(lotId: number) {
    startTransition(async () => {
      await updateProgressStatus({
        lotId,
        year,
        month,
        milestoneText: form.milestoneText || null,
        settlementStatus: form.settlementStatus || null,
      });
      setEditing(null);
    });
  }

  let stt = 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted border-b">
            <th className="p-2 text-center w-10">STT</th>
            <th className="p-2 text-left min-w-[200px]">Danh mục / Lô</th>
            <th className="p-2 text-right min-w-[120px]">Dự toán (C)</th>
            <th className="p-2 text-right min-w-[120px]">Giá HĐ (D)</th>
            <th className="p-2 text-left min-w-[180px]">Tiến độ (M)</th>
            <th className="p-2 text-left min-w-[140px]">Trạng thái QT (P)</th>
            <th className="p-2 text-right min-w-[130px]">Phải nộp (L)</th>
            <th className="p-2 text-right min-w-[130px]">Đã nộp</th>
            <th className="p-2 text-left min-w-[180px]">Trạng thái nộp (O)</th>
            <th className="p-2 text-center w-20">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const isSubtotal = r.kind !== "lot";
            if (r.kind === "lot") stt++;

            const rowCls = r.kind === "grand"
              ? "border-b bg-muted font-bold"
              : r.kind === "phase"
              ? "border-b bg-muted/70 font-semibold"
              : r.kind === "group"
              ? "border-b bg-muted/30 font-medium"
              : "border-b hover:bg-muted/10";

            const isEditing = editing === r.lotId && r.kind === "lot";

            return (
              <tr key={`${r.kind}-${idx}`} className={rowCls}>
                <td className="p-2 text-center">{r.kind === "lot" ? stt : ""}</td>
                <td className={`p-2 ${isSubtotal ? "" : "pl-4"}`}>{r.lotName}</td>
                <td className="p-2 text-right">{fmtNum(r.estimateValue)}</td>
                <td className="p-2 text-right">{fmtNum(r.contractValue)}</td>

                {/* Tiến độ */}
                <td className="p-2">
                  {isEditing ? (
                    <select
                      value={form.milestoneText}
                      onChange={(e) => setForm((f) => ({ ...f, milestoneText: e.target.value }))}
                      className="border rounded px-1 py-0.5 text-xs w-full"
                    >
                      <option value="">— Chọn mốc —</option>
                      {milestoneOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <span>{r.milestoneText ?? "—"}</span>
                  )}
                </td>

                {/* Trạng thái QT */}
                <td className="p-2">
                  {isEditing ? (
                    <select
                      value={form.settlementStatus}
                      onChange={(e) => setForm((f) => ({ ...f, settlementStatus: e.target.value }))}
                      className="border rounded px-1 py-0.5 text-xs w-full"
                    >
                      {SETTLEMENT_OPTIONS.map((o) => <option key={o} value={o}>{o || "— Chọn —"}</option>)}
                    </select>
                  ) : (
                    <span>{r.settlementStatus ?? "—"}</span>
                  )}
                </td>

                <td className="p-2 text-right font-medium">{fmtNum(r.phaiNop)}</td>
                <td className="p-2 text-right">{fmtNum(r.tienDaDong)}</td>
                <td className="p-2 text-xs">{r.paidStatus}</td>

                <td className="p-2 text-center">
                  {r.kind === "lot" && (
                    isEditing ? (
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => save(r.lotId!)}
                          disabled={pending}
                          className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded"
                        >
                          Lưu
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="px-2 py-1 text-xs border rounded"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(r)}
                        className="px-2 py-1 text-xs border rounded hover:bg-muted"
                      >
                        Sửa
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">Chưa có dữ liệu.</div>
      )}
    </div>
  );
}
