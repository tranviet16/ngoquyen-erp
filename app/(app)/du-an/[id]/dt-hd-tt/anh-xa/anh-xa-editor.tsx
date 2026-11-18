"use client";

/**
 * Ô gán của một khóa trên màn Ánh xạ: chọn Mã nhóm, Dòng DT (lọc theo Mã nhóm), hệ số (hd / tt) hoặc
 * loại (dt), rồi "Xác nhận", "Lưu đề xuất", "Ngoài DT" (hd / tt) hoặc "Bỏ gán". Khóa chưa gán → tạo
 * alias; alias đang có → chỉ gửi các trường đã đổi (server trộn với bản đọc lại dưới khóa).
 */

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AliasKeyRow, DtLineOption, GroupOption } from "@/lib/du-an/dt-hd-tt/alias-board";
import { createAlias, softDeleteAlias, updateAlias } from "@/lib/du-an/dt-hd-tt/alias-service";
import type { AliasPatch } from "@/lib/du-an/dt-hd-tt/alias-rules";
import type { CostKind } from "@/lib/du-an/dt-hd-tt/keys";
import { COST_KINDS, parseNumberText } from "@/lib/du-an/dt-hd-tt/register-ui";
import type { AliasStatus } from "@/lib/du-an/dt-hd-tt/report-inputs";

interface Props {
  projectId: number;
  row: AliasKeyRow;
  groups: GroupOption[];
  dtLines: DtLineOption[];
  /** Có quyền `edit` — bỏ gán alias đang có. */
  canDelete: boolean;
  onDone: () => void;
}

const selectClass = "h-8 w-full rounded-md border bg-transparent px-2 text-sm";

export function AliasEditor({ projectId, row, groups, dtLines, canDelete, onDone }: Props) {
  const alias = row.alias;
  const isDt = row.source === "dt";
  const [groupId, setGroupId] = useState(alias?.groupCodeId ? String(alias.groupCodeId) : "");
  const [dtKey, setDtKey] = useState(alias?.dtKey ?? "");
  const [factor, setFactor] = useState(alias?.factor == null ? "" : String(alias.factor).replace(".", ","));
  const [kind, setKind] = useState<string>(alias?.kind ?? row.lineKind ?? "");
  const [note, setNote] = useState(alias?.note ?? "");
  const [busy, setBusy] = useState(false);

  const lineOf = (key: string) => dtLines.find((l) => l.key === key);
  // Dòng DT đang lưu nhưng đã mất khỏi dự toán: hiện thành lựa chọn riêng để người dùng thấy và chọn lại.
  const staleKey = alias?.dtKey && !lineOf(alias.dtKey) ? alias.dtKey : null;
  const dtOptions = [
    ...(staleKey ? [{ key: staleKey, label: `(dòng DT không còn) ${staleKey.split("|").join(" · ")}` }] : []),
    ...(groupId ? dtLines.filter((l) => String(l.groupCodeId) === groupId || l.key === dtKey) : dtLines),
  ];

  function pickGroup(value: string) {
    setGroupId(value);
    // Dòng DT đang chọn (còn trong dự toán) thuộc nhóm khác → bỏ chọn: server lưu nhóm của dòng DT và
    // từ chối nhóm chọn khác nhóm đó.
    const line = dtKey ? lineOf(dtKey) : undefined;
    if (value && line && String(line.groupCodeId ?? "") !== value) setDtKey("");
  }

  function pickDtLine(value: string) {
    setDtKey(value);
    const line = value ? lineOf(value) : undefined;
    if (line) setGroupId(line.groupCodeId === null ? "" : String(line.groupCodeId)); // nhóm = nhóm của dòng DT
  }

  async function save(status: AliasStatus) {
    let factorValue: number | null = null;
    try {
      factorValue = isDt ? null : parseNumberText(factor, "Hệ số", "decimal");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    const next = {
      groupCodeId: groupId ? Number(groupId) : null,
      dtKey: isDt ? null : dtKey || null,
      factor: factorValue,
      kind: isDt ? ((kind || null) as CostKind | null) : null,
      status,
      note: note.trim() || null,
    };
    // Alias đang có: chỉ gửi trường đã đổi (trạng thái luôn gửi — đó là nút vừa bấm).
    const patch: AliasPatch = { status };
    if (alias) {
      if (next.groupCodeId !== alias.groupCodeId) patch.groupCodeId = next.groupCodeId;
      if (next.dtKey !== alias.dtKey) patch.dtKey = next.dtKey;
      if (next.factor !== alias.factor) patch.factor = next.factor;
      if (next.kind !== alias.kind) patch.kind = next.kind;
      if (next.note !== alias.note) patch.note = next.note;
    }
    setBusy(true);
    try {
      const result = alias
        ? await updateAlias(alias.id, projectId, patch)
        : await createAlias({ projectId, source: row.source, itemKey: row.itemKey, ...next });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(status === "xac_nhan" ? "Đã xác nhận ánh xạ" : status === "ngoai_dt" ? "Đã đánh dấu Ngoài DT" : "Đã lưu đề xuất");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!alias || !window.confirm(`Bỏ gán "${row.itemName}"? Các dòng sẽ trở lại "chưa gán".`)) return;
    setBusy(true);
    try {
      const result = await softDeleteAlias(alias.id, projectId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Đã bỏ gán");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 bg-muted/40 p-3 md:grid-cols-6">
      <label className="flex flex-col gap-1 text-xs md:col-span-2">
        <span className="text-muted-foreground">Mã nhóm</span>
        <select value={groupId} onChange={(e) => pickGroup(e.target.value)} className={selectClass}>
          <option value="">— Không —</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.code} – {g.name}</option>)}
        </select>
      </label>
      {isDt ? (
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Loại</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
            {COST_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs md:col-span-2">
            <span className="text-muted-foreground">Dòng DT {groupId ? "(theo Mã nhóm)" : ""}</span>
            <select value={dtKey} onChange={(e) => pickDtLine(e.target.value)} className={selectClass}>
              <option value="">— Chỉ gán tới Mã nhóm —</option>
              {dtOptions.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Hệ số (trống = theo giá trị)</span>
            <Input value={factor} onChange={(e) => setFactor(e.target.value)} inputMode="decimal" className="h-8" />
          </label>
        </>
      )}
      <label className="col-span-2 flex flex-col gap-1 text-xs md:col-span-6">
        <span className="text-muted-foreground">Ghi chú</span>
        <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8" />
      </label>
      <div className="col-span-2 flex flex-wrap gap-2 md:col-span-6">
        <Button size="sm" disabled={busy} onClick={() => save("xac_nhan")}>Xác nhận</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => save("de_xuat")}>Lưu đề xuất</Button>
        {!isDt && <Button size="sm" variant="outline" disabled={busy} onClick={() => save("ngoai_dt")}>Ngoài DT</Button>}
        {alias && canDelete && <Button size="sm" variant="destructive" disabled={busy} onClick={remove}>Bỏ gán</Button>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDone}>Đóng</Button>
      </div>
    </div>
  );
}
