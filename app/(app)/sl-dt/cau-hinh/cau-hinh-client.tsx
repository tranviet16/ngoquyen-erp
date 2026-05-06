"use client";

import { useState, useTransition } from "react";
import { upsertMilestoneScore, deleteMilestoneScore } from "./actions";

interface MilestoneScore {
  id: number;
  milestoneText: string;
  score: number;
  sortOrder: number;
}

interface Props {
  scores: MilestoneScore[];
}

type FormState = { milestoneText: string; score: string; sortOrder: string };

function emptyForm(): FormState {
  return { milestoneText: "", score: "0", sortOrder: "0" };
}

export function CauHinhClient({ scores }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [pending, startTransition] = useTransition();

  function openAdd() { setShowAdd(true); setEditingId(null); setForm(emptyForm()); }
  function openEdit(s: MilestoneScore) {
    setEditingId(s.id);
    setShowAdd(false);
    setForm({ milestoneText: s.milestoneText, score: String(s.score), sortOrder: String(s.sortOrder) });
  }
  function closeForm() { setShowAdd(false); setEditingId(null); }

  function handleSave() {
    startTransition(async () => {
      await upsertMilestoneScore(editingId, {
        milestoneText: form.milestoneText,
        score: parseInt(form.score, 10) || 0,
        sortOrder: parseInt(form.sortOrder, 10) || 0,
      });
      closeForm();
    });
  }

  function handleDelete(id: number, text: string) {
    if (!confirm(`Xóa mốc "${text}"?`)) return;
    startTransition(async () => {
      await deleteMilestoneScore(id);
    });
  }

  const isFormOpen = showAdd || editingId !== null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openAdd} className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded">
          + Thêm mốc
        </button>
      </div>

      {isFormOpen && (
        <div className="border rounded p-4 space-y-3 bg-muted/20">
          <div className="font-medium text-sm">{editingId ? "Chỉnh sửa mốc" : "Thêm mốc mới"}</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Tên mốc</label>
              <input
                type="text"
                value={form.milestoneText}
                onChange={(e) => setForm((f) => ({ ...f, milestoneText: e.target.value }))}
                className="border rounded px-2 py-1 text-sm w-full"
                placeholder="VD: Xong khung BTCT"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Điểm (0–100)</label>
              <input
                type="number"
                value={form.score}
                onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
                className="border rounded px-2 py-1 text-sm w-full"
                min={0}
                max={100}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Thứ tự</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                className="border rounded px-2 py-1 text-sm w-full"
                min={0}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={pending || !form.milestoneText.trim()}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50"
            >
              {pending ? "Đang lưu..." : "Lưu"}
            </button>
            <button onClick={closeForm} className="px-3 py-1.5 text-sm border rounded">Hủy</button>
          </div>
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted border-b">
            <th className="p-2 text-center w-10">STT</th>
            <th className="p-2 text-left">Tên mốc</th>
            <th className="p-2 text-center w-20">Điểm</th>
            <th className="p-2 text-center w-20">Thứ tự</th>
            <th className="p-2 text-center w-28">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s, i) => (
            <tr key={s.id} className={`border-b hover:bg-muted/10 ${editingId === s.id ? "bg-muted/20" : ""}`}>
              <td className="p-2 text-center">{i + 1}</td>
              <td className="p-2">{s.milestoneText}</td>
              <td className="p-2 text-center font-mono">{s.score}</td>
              <td className="p-2 text-center text-muted-foreground">{s.sortOrder}</td>
              <td className="p-2 text-center">
                <div className="flex gap-1 justify-center">
                  <button onClick={() => openEdit(s)} className="px-2 py-1 text-xs border rounded hover:bg-muted">Sửa</button>
                  <button onClick={() => handleDelete(s.id, s.milestoneText)} disabled={pending} className="px-2 py-1 text-xs border rounded text-red-600 hover:bg-red-50">Xóa</button>
                </div>
              </td>
            </tr>
          ))}
          {scores.length === 0 && (
            <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Chưa có mốc nào. Nhấn "+ Thêm mốc" để thêm.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
