"use client";

import { useState, useTransition } from "react";
import { fmtNum } from "@/lib/sl-dt/format";
import { upsertPaymentPlan, deletePaymentPlan } from "./actions";
import type { PaymentPlanRow } from "@/lib/sl-dt/report-service";

interface Props {
  rows: PaymentPlanRow[];
  milestoneOptions: string[];
}

type FormState = {
  dot1Amount: string; dot1Milestone: string;
  dot2Amount: string; dot2Milestone: string;
  dot3Amount: string; dot3Milestone: string;
  dot4Amount: string; dot4Milestone: string;
};

function emptyForm(row: PaymentPlanRow): FormState {
  return {
    dot1Amount: String(row.dot1Amount), dot1Milestone: row.dot1Milestone ?? "",
    dot2Amount: String(row.dot2Amount), dot2Milestone: row.dot2Milestone ?? "",
    dot3Amount: String(row.dot3Amount), dot3Milestone: row.dot3Milestone ?? "",
    dot4Amount: String(row.dot4Amount), dot4Milestone: row.dot4Milestone ?? "",
  };
}

export function PaymentPlanClient({ rows, milestoneOptions }: Props) {
  const [editingLotId, setEditingLotId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [pending, startTransition] = useTransition();

  function openEdit(row: PaymentPlanRow) {
    setEditingLotId(row.lotId);
    setForm(emptyForm(row));
  }

  function closeEdit() { setEditingLotId(null); setForm(null); }

  function handleSave() {
    if (!editingLotId || !form) return;
    startTransition(async () => {
      await upsertPaymentPlan({
        lotId: editingLotId,
        dot1Amount: parseFloat(form.dot1Amount) || 0,
        dot1Milestone: form.dot1Milestone || null,
        dot2Amount: parseFloat(form.dot2Amount) || 0,
        dot2Milestone: form.dot2Milestone || null,
        dot3Amount: parseFloat(form.dot3Amount) || 0,
        dot3Milestone: form.dot3Milestone || null,
        dot4Amount: parseFloat(form.dot4Amount) || 0,
        dot4Milestone: form.dot4Milestone || null,
      });
      closeEdit();
    });
  }

  function handleDelete(lotId: number) {
    if (!confirm("Xóa kế hoạch nộp tiền cho lô này?")) return;
    startTransition(async () => {
      await deletePaymentPlan(lotId);
    });
  }

  const editingRow = rows.find((r) => r.lotId === editingLotId);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted border-b">
              <th className="p-2 text-center w-10">STT</th>
              <th className="p-2 text-left min-w-[180px]">Lô</th>
              <th className="p-2 text-left w-24">G. đoạn</th>
              <th className="p-2 text-right min-w-[110px]">Dự toán</th>
              <th className="p-2 text-right min-w-[100px]">Đợt 1</th>
              <th className="p-2 text-left min-w-[140px]">Mốc 1</th>
              <th className="p-2 text-right min-w-[100px]">Đợt 2</th>
              <th className="p-2 text-left min-w-[140px]">Mốc 2</th>
              <th className="p-2 text-right min-w-[100px]">Đợt 3</th>
              <th className="p-2 text-left min-w-[140px]">Mốc 3</th>
              <th className="p-2 text-right min-w-[100px]">Đợt 4</th>
              <th className="p-2 text-left min-w-[140px]">Mốc 4</th>
              <th className="p-2 text-center w-24">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.lotId} className="border-b hover:bg-muted/10">
                <td className="p-2 text-center">{i + 1}</td>
                <td className="p-2 font-medium">{r.lotName}</td>
                <td className="p-2 text-muted-foreground">{r.phaseCode}</td>
                <td className="p-2 text-right">{fmtNum(r.estimateValue)}</td>
                <td className="p-2 text-right">{fmtNum(r.dot1Amount)}</td>
                <td className="p-2">{r.dot1Milestone ?? "—"}</td>
                <td className="p-2 text-right">{fmtNum(r.dot2Amount)}</td>
                <td className="p-2">{r.dot2Milestone ?? "—"}</td>
                <td className="p-2 text-right">{fmtNum(r.dot3Amount)}</td>
                <td className="p-2">{r.dot3Milestone ?? "—"}</td>
                <td className="p-2 text-right">{fmtNum(r.dot4Amount)}</td>
                <td className="p-2">{r.dot4Milestone ?? "—"}</td>
                <td className="p-2 text-center">
                  <div className="flex gap-1 justify-center">
                    <button onClick={() => openEdit(r)} className="px-2 py-1 text-xs border rounded hover:bg-muted">Sửa</button>
                    {r.planId && (
                      <button onClick={() => handleDelete(r.lotId)} disabled={pending} className="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-50">Xóa</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inline edit modal */}
      {editingLotId && form && editingRow && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-background border rounded-lg shadow-xl p-6 w-full max-w-2xl space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Chỉnh sửa kế hoạch nộp tiền</h2>
              <p className="text-sm text-muted-foreground">{editingRow.lotName}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {([1, 2, 3, 4] as const).map((dot) => {
                const amtKey = `dot${dot}Amount` as keyof FormState;
                const milKey = `dot${dot}Milestone` as keyof FormState;
                return (
                  <div key={dot} className="space-y-2 border rounded p-3">
                    <div className="font-medium text-sm">Đợt {dot}</div>
                    <div>
                      <label className="text-xs text-muted-foreground">Số tiền</label>
                      <input
                        type="number"
                        value={form[amtKey]}
                        onChange={(e) => setForm((f) => f ? { ...f, [amtKey]: e.target.value } : f)}
                        className="border rounded px-2 py-1 text-sm w-full mt-0.5"
                        min={0}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Mốc</label>
                      <select
                        value={form[milKey]}
                        onChange={(e) => setForm((f) => f ? { ...f, [milKey]: e.target.value } : f)}
                        className="border rounded px-2 py-1 text-sm w-full mt-0.5"
                      >
                        <option value="">— Chọn mốc —</option>
                        {milestoneOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={closeEdit} className="px-4 py-2 text-sm border rounded">Hủy</button>
              <button
                onClick={handleSave}
                disabled={pending}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
              >
                {pending ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
