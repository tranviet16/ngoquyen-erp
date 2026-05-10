"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { fmtNum } from "@/lib/sl-dt/format";
import {
  updateProgressStatus,
  adminPatchChiTieuRow,
  cascadeRecomputeLuyKe,
  setSubtotalLabel,
} from "./actions";
import { useRouter } from "next/navigation";
import type { ChiTieuRow } from "@/lib/sl-dt/report-service";

interface Props {
  rows: ChiTieuRow[];
  year: number;
  month: number;
  milestoneOptions: string[];
  role?: string;
}

const SETTLEMENT_OPTIONS = ["Đã quyết toán", "Tạm dừng", "Đã ký HĐ", "Đã ký phụ lục"];

const groupCls = {
  sl: "bg-amber-50 dark:bg-amber-950/30",
  dt: "bg-emerald-50 dark:bg-emerald-950/30",
};

const ADMIN_NUM_FIELDS = [
  "estimateValue",
  "prevSlLuyKeTho",
  "prevDtThoLuyKe",
  "slKeHoachKy",
  "slThucKyTho",
  "dtKeHoachKy",
  "dtThoKy",
  "slTrat",
  "dtTratKy",
] as const;
type AdminNumField = (typeof ADMIN_NUM_FIELDS)[number];

interface EditForm {
  targetMilestone: string;
  milestoneText: string;
  settlementStatus: string;
  ghiChu: string;
  nums: Record<AdminNumField, string>;
}

const emptyNums: Record<AdminNumField, string> = {
  estimateValue: "", prevSlLuyKeTho: "", prevDtThoLuyKe: "",
  slKeHoachKy: "", slThucKyTho: "", dtKeHoachKy: "", dtThoKy: "",
  slTrat: "", dtTratKy: "",
};
const empty: EditForm = {
  targetMilestone: "", milestoneText: "", settlementStatus: "", ghiChu: "",
  nums: { ...emptyNums },
};

function subtotalKey(r: ChiTieuRow): { scope: "grand" | "phase" | "group"; key: string } | null {
  if (r.kind === "grand") return { scope: "grand", key: "_" };
  if (r.kind === "phase") return { scope: "phase", key: r.phaseCode };
  if (r.kind === "group") return { scope: "group", key: `${r.phaseCode}/${r.groupCode}` };
  return null;
}

export function ChiTieuClient({ rows, year, month, milestoneOptions, role }: Props) {
  const isAdmin = role === "admin";
  const router = useRouter();
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<EditForm>(empty);
  const [labelEdit, setLabelEdit] = useState<string | null>(null); // "scope:key"
  const [labelDraft, setLabelDraft] = useState<string>("");

  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const editingRef = useRef<{ lotId: number; original: ChiTieuRow } | null>(null);
  const formRef = useRef<EditForm>(empty);
  formRef.current = form;

  function startEdit(row: ChiTieuRow) {
    if (row.lotId == null) return;
    setEditing(row.lotId);
    const next: EditForm = {
      targetMilestone: row.targetMilestone ?? "",
      milestoneText: row.milestoneText ?? "",
      settlementStatus: row.settlementStatus ?? "",
      ghiChu: row.ghiChu ?? "",
      nums: {
        estimateValue: String(row.estimateValue ?? 0),
        prevSlLuyKeTho: String(row.prevSlLuyKeTho ?? 0),
        prevDtThoLuyKe: String(row.prevDtThoLuyKe ?? 0),
        slKeHoachKy: String(row.slKeHoachKy ?? 0),
        slThucKyTho: String(row.slThucKyTho ?? 0),
        dtKeHoachKy: String(row.dtKeHoachKy ?? 0),
        dtThoKy: String(row.dtThoKy ?? 0),
        slTrat: String(row.slTrat ?? 0),
        dtTratKy: String(row.dtTratKy ?? 0),
      },
    };
    setForm(next);
    formRef.current = next;
    editingRef.current = { lotId: row.lotId, original: row };
  }

  function setNum(field: AdminNumField, value: string) {
    setForm((f) => ({ ...f, nums: { ...f.nums, [field]: value } }));
  }

  function saveRow(lotId: number, original: ChiTieuRow, currentForm: EditForm) {
    startTransition(async () => {
      const progressP = updateProgressStatus({
        lotId, year, month,
        targetMilestone: currentForm.targetMilestone || null,
        milestoneText: currentForm.milestoneText || null,
        settlementStatus: currentForm.settlementStatus || null,
        ghiChu: currentForm.ghiChu || null,
      });
      let numericP: Promise<{ futureMonthsCount: number }> | null = null;
      if (isAdmin) {
        const numPatch: Record<string, number> = {};
        const origByField: Record<AdminNumField, number> = {
          estimateValue: original.estimateValue ?? 0,
          prevSlLuyKeTho: original.prevSlLuyKeTho ?? 0,
          prevDtThoLuyKe: original.prevDtThoLuyKe ?? 0,
          slKeHoachKy: original.slKeHoachKy ?? 0,
          slThucKyTho: original.slThucKyTho ?? 0,
          dtKeHoachKy: original.dtKeHoachKy ?? 0,
          dtThoKy: original.dtThoKy ?? 0,
          slTrat: original.slTrat ?? 0,
          dtTratKy: original.dtTratKy ?? 0,
        };
        for (const f of ADMIN_NUM_FIELDS) {
          const next = Number(currentForm.nums[f]);
          if (!Number.isFinite(next)) continue;
          if (next !== origByField[f]) numPatch[f] = next;
        }
        if (Object.keys(numPatch).length > 0) {
          numericP = adminPatchChiTieuRow(year, month, lotId, numPatch);
        }
      }
      const [progress, numeric] = await Promise.all([progressP, numericP]);
      // Numeric edits affect lũy kế chronologically; ask before cascading.
      const futureCount = numeric?.futureMonthsCount ?? 0;
      if (futureCount > 0) {
        const ok = window.confirm(
          `Có ${futureCount} tháng sau (${original.lotName}) đang phụ thuộc vào lũy kế tháng này.\n` +
          `Cập nhật lại lũy kế cho các tháng sau ngay bây giờ?`,
        );
        if (ok) {
          await cascadeRecomputeLuyKe(lotId, year, month);
        }
      }
      // Surface freshly-computed auto target without a manual reload.
      if (progress?.resolvedTargetMilestone !== undefined) {
        router.refresh();
      }
    });
  }

  function commitEditing() {
    if (!editingRef.current) return;
    saveRow(editingRef.current.lotId, editingRef.current.original, formRef.current);
    setEditing(null);
    editingRef.current = null;
  }

  function cancelEditing() {
    setEditing(null);
    editingRef.current = null;
  }

  function handleRowBlur(e: React.FocusEvent<HTMLTableRowElement>) {
    if (!editingRef.current) return;
    const next = e.relatedTarget as Node | null;
    const row = rowRefs.current.get(editingRef.current.lotId);
    if (next && row && row.contains(next)) return;
    commitEditing();
  }

  function handleRowKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEditing();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  }

  function startLabelEdit(r: ChiTieuRow) {
    const k = subtotalKey(r);
    if (!k) return;
    setLabelEdit(`${k.scope}:${k.key}`);
    setLabelDraft(r.lotName);
  }

  function commitLabel(r: ChiTieuRow, original: string) {
    const k = subtotalKey(r);
    if (!k) return;
    const trimmed = labelDraft.trim();
    setLabelEdit(null);
    if (trimmed === original) return;
    startTransition(async () => {
      await setSubtotalLabel(k.scope, k.key, trimmed);
    });
  }

  function cellClickToEdit(r: ChiTieuRow) {
    if (r.kind !== "lot" || r.lotId == null) return;
    if (editing === r.lotId) return;
    if (editingRef.current && editingRef.current.lotId !== r.lotId) {
      saveRow(editingRef.current.lotId, editingRef.current.original, formRef.current);
    }
    startEdit(r);
  }

  // Auto-focus on label input when entering label edit mode
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (labelEdit && labelInputRef.current) labelInputRef.current.focus();
  }, [labelEdit]);

  const numInputCls =
    "w-full text-right tabular-nums border rounded px-1 py-0.5 text-xs bg-background";
  const txtInputCls = "border rounded px-1 py-0.5 text-xs w-full bg-background";

  let stt = 0;

  return (
    <div className="overflow-x-auto border rounded">
      {pending && <div className="text-[11px] text-muted-foreground px-2 py-0.5">Đang lưu…</div>}
      <table className="text-xs border-collapse">
        <thead className="bg-muted/40 sticky top-0 z-10">
          <tr>
            <th rowSpan={2} className="px-2 py-1 text-center sticky left-0 bg-muted/40 border-r w-10">STT</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[160px]">Danh mục</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[110px]">Dự toán phần thô</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[110px]">SL lũy kế đầu kỳ</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[110px]">DT lũy kế đầu kỳ</th>
            <th colSpan={2} className={`px-2 py-1 text-center border-r border-l ${groupCls.sl}`}>Sản lượng kỳ này</th>
            <th colSpan={2} className={`px-2 py-1 text-center border-r border-l ${groupCls.dt}`}>Doanh thu kỳ này</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[100px]">SL trát</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[100px]">DT trát</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[120px] bg-blue-50 dark:bg-blue-500/15">DT cần thực hiện theo tiến độ</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[160px]">Công việc cần hoàn thành theo DT lũy kế</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[160px]">Tiến độ thực tế</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[140px] bg-blue-50 dark:bg-blue-500/15">Tình trạng thực hiện DT</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[120px]">Tình trạng (settlement)</th>
            <th rowSpan={2} className="px-2 py-1 text-left min-w-[140px]">Ghi chú</th>
          </tr>
          <tr>
            <th className={`px-2 py-1 text-right border-r min-w-[100px] ${groupCls.sl}`}>Chỉ tiêu</th>
            <th className={`px-2 py-1 text-right border-r min-w-[100px] ${groupCls.sl}`}>Thực hiện</th>
            <th className={`px-2 py-1 text-right border-r min-w-[100px] ${groupCls.dt}`}>Chỉ tiêu</th>
            <th className={`px-2 py-1 text-right border-r min-w-[100px] ${groupCls.dt}`}>Thực hiện</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            if (r.kind === "lot") stt++;
            const rowCls =
              r.kind === "grand" ? "border-t-[3px] border-b-[3px] border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-50 font-bold [&>td]:!bg-transparent [&>td]:py-2.5"
              : r.kind === "phase" ? "border-t-2 border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 font-semibold [&>td]:!bg-transparent [&>td]:py-2"
              : r.kind === "group" ? "border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 font-medium [&>td]:!bg-transparent"
              : "border-t hover:bg-muted/20 transition-colors";
            const isEditing = editing === r.lotId && r.kind === "lot";
            const isLot = r.kind === "lot";
            const editClickProps = isLot && !isEditing
              ? { onClick: () => cellClickToEdit(r), title: "Bấm để sửa", role: "button" as const }
              : {};

            const subKey = subtotalKey(r);
            const labelKeyStr = subKey ? `${subKey.scope}:${subKey.key}` : null;
            const isLabelEditing = !!labelKeyStr && labelEdit === labelKeyStr;

            return (
              <tr
                key={`${r.kind}-${idx}`}
                ref={(el) => {
                  if (isLot && r.lotId != null) {
                    if (el) rowRefs.current.set(r.lotId, el);
                    else rowRefs.current.delete(r.lotId);
                  }
                }}
                className={rowCls}
                onBlur={isEditing ? handleRowBlur : undefined}
                onKeyDown={isEditing ? handleRowKeyDown : undefined}
              >
                <td className="px-2 py-1 text-center text-muted-foreground sticky left-0 bg-inherit border-r">{isLot ? stt : ""}</td>

                {/* Danh mục */}
                <td
                  className={`px-2 py-1 border-r ${isLot ? "pl-3" : ""} ${!isLot && isAdmin && subKey ? "cursor-pointer hover:bg-muted/30" : ""}`}
                  onClick={!isLot && isAdmin && subKey && !isLabelEditing ? () => startLabelEdit(r) : undefined}
                  title={!isLot && isAdmin ? "Bấm để sửa nhãn" : undefined}
                >
                  {isLabelEditing ? (
                    <input
                      ref={labelInputRef}
                      type="text"
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      onBlur={() => commitLabel(r, r.lotName)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                        else if (e.key === "Escape") { e.preventDefault(); setLabelEdit(null); }
                      }}
                      className={txtInputCls}
                    />
                  ) : (
                    r.lotName
                  )}
                </td>

                <td className="px-2 py-1 text-right border-r tabular-nums" {...editClickProps}>
                  {isEditing && isAdmin ? (
                    <input type="number" step="any" value={form.nums.estimateValue} onChange={(e) => setNum("estimateValue", e.target.value)} className={numInputCls} />
                  ) : fmtNum(r.estimateValue)}
                </td>
                <td className="px-2 py-1 text-right border-r tabular-nums" {...editClickProps}>
                  {isEditing && isAdmin ? (
                    <input type="number" step="any" value={form.nums.prevSlLuyKeTho} onChange={(e) => setNum("prevSlLuyKeTho", e.target.value)} className={numInputCls} />
                  ) : fmtNum(r.prevSlLuyKeTho)}
                </td>
                <td className="px-2 py-1 text-right border-r tabular-nums" {...editClickProps}>
                  {isEditing && isAdmin ? (
                    <input type="number" step="any" value={form.nums.prevDtThoLuyKe} onChange={(e) => setNum("prevDtThoLuyKe", e.target.value)} className={numInputCls} />
                  ) : fmtNum(r.prevDtThoLuyKe)}
                </td>
                <td className={`px-2 py-1 text-right border-r tabular-nums ${groupCls.sl}`} {...editClickProps}>
                  {isEditing && isAdmin ? (
                    <input type="number" step="any" value={form.nums.slKeHoachKy} onChange={(e) => setNum("slKeHoachKy", e.target.value)} className={numInputCls} />
                  ) : fmtNum(r.slKeHoachKy)}
                </td>
                <td className={`px-2 py-1 text-right border-r tabular-nums ${groupCls.sl}`} {...editClickProps}>
                  {isEditing && isAdmin ? (
                    <input type="number" step="any" value={form.nums.slThucKyTho} onChange={(e) => setNum("slThucKyTho", e.target.value)} className={numInputCls} />
                  ) : fmtNum(r.slThucKyTho)}
                </td>
                <td className={`px-2 py-1 text-right border-r tabular-nums ${groupCls.dt}`} {...editClickProps}>
                  {isEditing && isAdmin ? (
                    <input type="number" step="any" value={form.nums.dtKeHoachKy} onChange={(e) => setNum("dtKeHoachKy", e.target.value)} className={numInputCls} />
                  ) : fmtNum(r.dtKeHoachKy)}
                </td>
                <td className={`px-2 py-1 text-right border-r tabular-nums ${groupCls.dt}`} {...editClickProps}>
                  {isEditing && isAdmin ? (
                    <input type="number" step="any" value={form.nums.dtThoKy} onChange={(e) => setNum("dtThoKy", e.target.value)} className={numInputCls} />
                  ) : fmtNum(r.dtThoKy)}
                </td>
                <td className="px-2 py-1 text-right border-r tabular-nums" {...editClickProps}>
                  {isEditing && isAdmin ? (
                    <input type="number" step="any" value={form.nums.slTrat} onChange={(e) => setNum("slTrat", e.target.value)} className={numInputCls} />
                  ) : fmtNum(r.slTrat)}
                </td>
                <td className="px-2 py-1 text-right border-r tabular-nums" {...editClickProps}>
                  {isEditing && isAdmin ? (
                    <input type="number" step="any" value={form.nums.dtTratKy} onChange={(e) => setNum("dtTratKy", e.target.value)} className={numInputCls} />
                  ) : fmtNum(r.dtTratKy)}
                </td>
                <td className="px-2 py-1 text-right border-r tabular-nums bg-blue-50/50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-200 font-medium">{fmtNum(r.dtCanThucHien)}</td>

                {/* Công việc cần hoàn thành theo DT lũy kế */}
                <td className="px-1 py-0.5 border-r" {...editClickProps}>
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={form.targetMilestone}
                        onChange={(e) => setForm((f) => ({ ...f, targetMilestone: e.target.value }))}
                        className="border rounded px-1 py-0.5 text-xs flex-1"
                      >
                        <option value="">{r.suggestedTarget ? `— Tự động (${r.suggestedTarget}) —` : "— Tự động —"}</option>
                        {milestoneOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      {r.suggestedTarget && r.suggestedTarget !== form.targetMilestone && (
                        <button
                          type="button"
                          title={`Áp dụng gợi ý: ${r.suggestedTarget}`}
                          onClick={() => setForm((f) => ({ ...f, targetMilestone: r.suggestedTarget! }))}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-500/20 dark:hover:bg-blue-500/30 dark:text-blue-200 whitespace-nowrap"
                        >
                          ↳
                        </button>
                      )}
                    </div>
                  ) : isLot ? (
                    r.targetMilestone ? (
                      <span>{r.targetMilestone}</span>
                    ) : r.suggestedTarget ? (
                      <span className="text-muted-foreground italic" title="Tự động (chưa lưu)">{r.suggestedTarget}</span>
                    ) : (
                      <span>—</span>
                    )
                  ) : (
                    <span></span>
                  )}
                </td>

                {/* Tiến độ thực tế */}
                <td className="px-1 py-0.5 border-r" {...editClickProps}>
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
                    <span>{r.milestoneText ?? (isLot ? "—" : "")}</span>
                  )}
                </td>

                <td className="px-2 py-1 border-r bg-blue-50/50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-200 text-[11px]">{r.tinhTrang}</td>

                {/* Settlement */}
                <td className="px-1 py-0.5 border-r" {...editClickProps}>
                  {isEditing ? (
                    <select
                      value={form.settlementStatus}
                      onChange={(e) => setForm((f) => ({ ...f, settlementStatus: e.target.value }))}
                      className="border rounded px-1 py-0.5 text-xs w-full"
                    >
                      <option value="">—</option>
                      {SETTLEMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <span>{r.settlementStatus ?? (isLot ? "—" : "")}</span>
                  )}
                </td>

                {/* Ghi chú */}
                <td className="px-1 py-0.5" {...editClickProps}>
                  {isEditing ? (
                    <input
                      type="text"
                      value={form.ghiChu}
                      onChange={(e) => setForm((f) => ({ ...f, ghiChu: e.target.value }))}
                      className={txtInputCls}
                      placeholder="ghi chú"
                    />
                  ) : (
                    <span>{r.ghiChu ?? ""}</span>
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
      <div className="text-[11px] text-muted-foreground px-2 py-1 border-t bg-muted/20">
        Bấm vào ô bất kỳ để sửa. <kbd className="px-1 border rounded">Enter</kbd> để lưu, <kbd className="px-1 border rounded">Esc</kbd> để huỷ, click ra ngoài hàng cũng tự lưu.
        {isAdmin && " Admin có thể bấm vào cột Danh mục ở dòng tổng để đổi tên."}
      </div>
    </div>
  );
}
