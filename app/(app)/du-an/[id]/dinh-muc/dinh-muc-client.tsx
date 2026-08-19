"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { vndFormatter } from "@/lib/format";
import type { NormRow } from "@/lib/du-an/norm-service";
import {
  rollupNormByGroup,
  type GroupNormRow,
  type MaterialGroupLite,
} from "@/lib/du-an/material-group-rollup";
import {
  assignEstimatesToGroup,
  createGroup,
  deleteGroup,
  unassignEstimates,
} from "@/lib/du-an/material-group-service";

const FLAG_LABELS: Record<string, string> = { green: "OK", yellow: "Cảnh báo", red: "Vượt mức" };
const FLAG_STYLES: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  yellow: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

interface Props {
  projectId: number;
  rows: NormRow[];
  groups: MaterialGroupLite[];
  thresholds: { yellow: number; red: number };
  canEdit: boolean;
}

function fmt(n: number): string {
  if (!n) return "—";
  return vndFormatter(Math.round(n));
}

function qtyFmt(n: number | null): string {
  if (n == null || n === 0) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function FlagBadge({ flag, muted }: { flag: string; muted?: boolean }) {
  if (muted) {
    return <span className="text-[11px] text-muted-foreground">(thuộc nhóm)</span>;
  }
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${FLAG_STYLES[flag] ?? ""}`}>
      {FLAG_LABELS[flag] ?? flag}
    </span>
  );
}

function GroupDialog({
  projectId,
  groups,
  selectedIds,
  onClose,
  onDone,
}: {
  projectId: number;
  groups: MaterialGroupLite[];
  selectedIds: number[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">(groups.length > 0 ? "existing" : "new");
  const [groupId, setGroupId] = useState<number | null>(groups[0]?.id ?? null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const commit = () => {
    startTransition(async () => {
      try {
        let targetId = groupId;
        if (mode === "new") {
          const created = await createGroup(projectId, name, note || undefined);
          targetId = created.id;
        }
        if (targetId == null) throw new Error("Chưa chọn nhóm");
        const r = await assignEstimatesToGroup(projectId, targetId, selectedIds);
        toast.success(`Đã gộp ${r.assigned} dòng vào nhóm`);
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Gộp nhóm thất bại");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[440px] rounded-lg border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">Nhóm vật tư thay thế</p>
        <p className="mb-3 text-xs text-muted-foreground">
          {selectedIds.length} dòng được chọn sẽ vào cùng một nhóm — định mức sẽ chấm cờ theo tổng của nhóm.
        </p>
        {groups.length > 0 && (
          <div className="mb-2 flex gap-2 text-sm">
            <button
              type="button"
              className={`rounded-full border px-2 py-0.5 text-xs ${mode === "existing" ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => setMode("existing")}
            >
              Nhóm có sẵn
            </button>
            <button
              type="button"
              className={`rounded-full border px-2 py-0.5 text-xs ${mode === "new" ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => setMode("new")}
            >
              Tạo nhóm mới
            </button>
          </div>
        )}
        {mode === "existing" && groups.length > 0 ? (
          <select
            value={groupId ?? ""}
            onChange={(e) => setGroupId(Number(e.target.value))}
            className="mb-3 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : (
          <>
            <label className="mb-2 block text-sm">
              Tên nhóm
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="vd: Cát xây"
                className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              />
            </label>
            <label className="mb-3 block text-sm">
              Ghi chú (căn cứ thay thế)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="vd: đã hỏi CĐT, dùng cát vàng thay cát mịn được"
                className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              />
            </label>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Hủy
          </Button>
          <Button size="sm" onClick={commit} disabled={isPending || (mode === "new" && !name.trim())}>
            {isPending ? "Đang gộp…" : "Gộp nhóm"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DinhMucClient({ projectId, rows, groups, thresholds, canEdit }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, startTransition] = useTransition();

  const { groupRows, groupedEstimateIds } = useMemo(
    () => rollupNormByGroup(rows, groups, thresholds),
    [rows, groups, thresholds],
  );
  const groupRowByFirstMember = useMemo(() => {
    const map = new Map<number, GroupNormRow>();
    for (const g of groupRows) {
      // neo dòng nhóm tại thành viên xuất hiện đầu tiên theo thứ tự bảng
      const first = rows.find((r) => g.memberEstimateIds.includes(r.estimate_id));
      if (first) map.set(first.estimate_id, g);
    }
    return map;
  }, [groupRows, rows]);
  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  const redCount = rows.filter((r) => !groupedEstimateIds.has(r.estimate_id) && r.flag === "red").length +
    groupRows.filter((g) => g.flag === "red").length;
  const yellowCount = rows.filter((r) => !groupedEstimateIds.has(r.estimate_id) && r.flag === "yellow").length +
    groupRows.filter((g) => g.flag === "yellow").length;

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedGrouped = [...selected].filter((id) => groupedEstimateIds.has(id));

  const handleUnassign = () => {
    startTransition(async () => {
      try {
        const r = await unassignEstimates(projectId, selectedGrouped);
        toast.success(`Đã bỏ ${r.unassigned} dòng khỏi nhóm`);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bỏ nhóm thất bại");
      }
    });
  };

  const handleDeleteGroup = (g: GroupNormRow) => {
    if (!window.confirm(`Xóa nhóm "${g.groupName}"? Các dòng thành viên trở về đánh giá riêng lẻ.`)) return;
    startTransition(async () => {
      try {
        await deleteGroup(g.groupId, projectId);
        toast.success("Đã xóa nhóm");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Xóa nhóm thất bại");
      }
    });
  };

  const renderMemberRow = (r: NormRow, muted: boolean) => (
    <tr key={r.estimate_id} className={`border-t hover:bg-muted/20 ${muted ? "opacity-60" : ""}`}>
      {canEdit && (
        <td className="px-2 py-1">
          <input
            type="checkbox"
            checked={selected.has(r.estimate_id)}
            onChange={() => toggleSelect(r.estimate_id)}
          />
        </td>
      )}
      <td className="px-2 py-1 font-mono text-xs">{r.itemCode}</td>
      <td className="px-2 py-1">
        {r.itemName}
        {muted && r.materialGroupId != null && (
          <span className="ml-1 text-[10px] text-muted-foreground">
            [{groupNameById.get(r.materialGroupId) ?? "nhóm"}]
          </span>
        )}
      </td>
      <td className="px-2 py-1">{r.unit}</td>
      <td className="px-2 py-1 text-right">{qtyFmt(r.estimate_qty)}</td>
      <td className="px-2 py-1 text-right">{fmt(r.estimate_total_vnd)}</td>
      <td className="px-2 py-1 text-right">{qtyFmt(r.actual_qty)}</td>
      <td className="px-2 py-1 text-right">{fmt(r.actual_amount_tt)}</td>
      <td className="px-2 py-1 text-right">{`${(r.used_pct * 100).toFixed(1)}%`}</td>
      <td className="px-2 py-1 text-right">{qtyFmt(r.remaining_qty)}</td>
      <td className="px-2 py-1 text-right">{fmt(r.remaining_amount_vnd)}</td>
      <td className="px-2 py-1">
        <FlagBadge flag={r.flag ?? ""} muted={muted} />
      </td>
    </tr>
  );

  const renderGroupRow = (g: GroupNormRow) => (
    <tr key={`g-${g.groupId}`} className="border-t bg-violet-50/60 font-medium dark:bg-violet-500/10">
      {canEdit && <td className="px-2 py-1" />}
      <td className="px-2 py-1 text-xs text-violet-700 dark:text-violet-300">NHÓM</td>
      <td className="px-2 py-1">
        {g.groupName}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {g.memberEstimateIds.length} vật tư thay thế nhau
          {g.groupNote ? ` · ${g.groupNote}` : ""}
        </span>
        {canEdit && (
          <button
            type="button"
            className="ml-2 rounded border px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
            onClick={() => handleDeleteGroup(g)}
          >
            Xóa nhóm
          </button>
        )}
      </td>
      <td className="px-2 py-1" title={g.unitConsistent ? undefined : "Đơn vị khác nhau — chỉ tính theo tiền"}>
        {g.unitLabel ?? "hỗn hợp"}
      </td>
      <td className="px-2 py-1 text-right">{qtyFmt(g.est_qty_sum)}</td>
      <td className="px-2 py-1 text-right">{fmt(g.est_total_vnd_sum)}</td>
      <td className="px-2 py-1 text-right">{qtyFmt(g.actual_qty_sum)}</td>
      <td className="px-2 py-1 text-right">{fmt(g.actual_amount_tt_sum)}</td>
      <td className="px-2 py-1 text-right" title={g.usedPctBasis === "money" ? "Tính theo tiền" : "Tính theo khối lượng"}>
        {`${(g.used_pct * 100).toFixed(1)}%`}
        {g.usedPctBasis === "money" && <span className="text-xs text-muted-foreground"> ₫</span>}
      </td>
      <td className="px-2 py-1 text-right">
        {g.est_qty_sum != null && g.actual_qty_sum != null ? qtyFmt(g.est_qty_sum - g.actual_qty_sum) : "—"}
      </td>
      <td className="px-2 py-1 text-right">{fmt(g.est_total_vnd_sum - g.actual_amount_tt_sum)}</td>
      <td className="px-2 py-1">
        <FlagBadge flag={g.flag} />
      </td>
    </tr>
  );

  // Thứ tự render: giữ thứ tự bảng; dòng nhóm chèn tại vị trí thành viên đầu,
  // các thành viên của nhóm cụm ngay dưới, lần xuất hiện sau bỏ qua.
  const rendered = new Set<number>();
  const bodyRows: React.ReactNode[] = [];
  for (const r of rows) {
    if (rendered.has(r.estimate_id)) continue;
    const group = groupRowByFirstMember.get(r.estimate_id);
    if (group) {
      bodyRows.push(renderGroupRow(group));
      for (const memberId of group.memberEstimateIds) {
        const member = rows.find((x) => x.estimate_id === memberId);
        if (member) {
          bodyRows.push(renderMemberRow(member, true));
          rendered.add(memberId);
        }
      }
      continue;
    }
    if (groupedEstimateIds.has(r.estimate_id)) continue; // đã render trong cụm nhóm
    bodyRows.push(renderMemberRow(r, false));
    rendered.add(r.estimate_id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Theo Dõi Định Mức</h2>
          <p className="text-sm text-muted-foreground">
            {redCount > 0 && <span className="font-medium text-red-600">{redCount} vượt mức | </span>}
            {yellowCount > 0 && <span className="font-medium text-yellow-600">{yellowCount} cảnh báo | </span>}
            {rows.length} hạng mục · {groupRows.length} nhóm thay thế
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedGrouped.length === 0}
              onClick={handleUnassign}
            >
              Bỏ nhóm ({selectedGrouped.length})
            </Button>
            <Button size="sm" disabled={selected.size < 2} onClick={() => setDialogOpen(true)}>
              Nhóm vật tư thay thế ({selected.size})
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Vật tư trong cùng nhóm thay thế được đánh giá định mức theo tổng nhóm — cờ từng dòng thành viên
        chỉ mang tính tham khảo (mờ). Chọn ≥2 dòng cùng hạng mục để gộp nhóm.
      </p>
      <div className="overflow-x-auto rounded border">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left">
              {canEdit && <th className="w-8 px-2 py-2" />}
              <th className="w-28 px-2 py-2">Mã</th>
              <th className="px-2 py-2">Tên vật tư / công việc</th>
              <th className="w-16 px-2 py-2">ĐVT</th>
              <th className="w-24 px-2 py-2 text-right">ĐM SL</th>
              <th className="w-28 px-2 py-2 text-right">ĐM Chi phí</th>
              <th className="w-24 px-2 py-2 text-right">TT SL</th>
              <th className="w-28 px-2 py-2 text-right">TT Chi phí</th>
              <th className="w-24 px-2 py-2 text-right">% Đã dùng</th>
              <th className="w-24 px-2 py-2 text-right">Còn lại SL</th>
              <th className="w-28 px-2 py-2 text-right">Còn lại VND</th>
              <th className="w-24 px-2 py-2">Cờ</th>
            </tr>
          </thead>
          <tbody>{bodyRows}</tbody>
        </table>
      </div>
      {dialogOpen && (
        <GroupDialog
          projectId={projectId}
          groups={groups}
          selectedIds={[...selected]}
          onClose={() => setDialogOpen(false)}
          onDone={() => {
            setDialogOpen(false);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
