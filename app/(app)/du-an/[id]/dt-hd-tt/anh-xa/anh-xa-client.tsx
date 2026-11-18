"use client";

/**
 * Màn Ánh xạ: ba tab DT / HĐ / TT, mỗi khóa tên|ĐVT một dòng (số dòng, Σ tiền, NCC). Bộ đếm "chưa gán"
 * đứng đầu, khóa chưa gán xếp trước. Bấm "Gán" / "Sửa" mở ô gán ngay dưới dòng; "Xác nhận các đề xuất"
 * xác nhận hàng loạt các đề xuất đủ điều kiện trong danh sách đang lọc. Cuối trang: alias mồ côi.
 */

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vndFormatter } from "@/lib/format";
import type { AliasBoard, AliasKeyRow } from "@/lib/du-an/dt-hd-tt/alias-board";
import { confirmAliases } from "@/lib/du-an/dt-hd-tt/alias-service";
import { ALIAS_SOURCES, ALIAS_SOURCE_LABEL, ALIAS_STATUS_LABEL, isBulkConfirmable, type AliasSource } from "@/lib/du-an/dt-hd-tt/register-ui";
import { AliasEditor } from "./anh-xa-editor";
import { OrphanAliases } from "./anh-xa-orphans";

type StatusFilter = "all" | "chua_gan" | "de_xuat" | "xac_nhan" | "ngoai_dt";
const FILTER_LABEL: Record<StatusFilter, string> = { all: "Tất cả", chua_gan: "Chưa gán", ...ALIAS_STATUS_LABEL };
const AMOUNT_TITLE: Record<AliasSource, string> = { dt: "Giá trị DT", hd: "Σ chưa VAT", tt: "Σ gồm VAT" };
const PARTY_TITLE: Record<AliasSource, string> = { dt: "NCC phụ trách", hd: "NCC", tt: "Đầu mối" };

const statusOf = (r: AliasKeyRow): Exclude<StatusFilter, "all"> => r.alias?.status ?? "chua_gan";

interface Props {
  projectId: number;
  board: AliasBoard;
  initialTab: AliasSource;
  canCreate: boolean;
  canEdit: boolean;
}

export function AnhXaClient({ projectId, board, initialTab, canCreate, canEdit }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<AliasSource>(initialTab);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  const groupCode = new Map(board.groups.map((g) => [g.id, g.code]));
  const dtLabel = new Map(board.dtLines.map((l) => [l.key, l.label]));
  const rows = board.tabs[tab];
  const needle = search.trim().toLowerCase();
  const visible = rows.filter(
    (r) => (filter === "all" || statusOf(r) === filter) && (!needle || `${r.itemName} ${r.unit} ${r.parties}`.toLowerCase().includes(needle)),
  );
  const unmapped = rows.filter((r) => r.alias === null);
  const confirmable = visible.flatMap((r) => (r.alias && isBulkConfirmable({ ...r.alias, source: r.source }) ? [r.alias.id] : []));
  const isDt = tab === "dt";

  async function confirmVisible() {
    if (!window.confirm(`Xác nhận ${confirmable.length} đề xuất đang hiện?`)) return;
    setConfirming(true);
    try {
      const result = await confirmAliases(projectId, confirmable);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const stale = result.staleDtLine ? `, trong đó ${result.staleDtLine} trỏ tới Dòng DT không còn — chọn lại Dòng DT` : "";
      toast.success(`Đã xác nhận ${result.confirmed} ánh xạ${result.skipped ? ` (bỏ qua ${result.skipped}${stale})` : ""}`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  const closeAndRefresh = () => {
    setOpenKey(null);
    refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-semibold">Ánh xạ tên hàng</h2>
        {ALIAS_SOURCES.map((s) => {
          const count = board.tabs[s].filter((r) => r.alias === null).length;
          return (
            <button
              key={s}
              type="button"
              onClick={() => { setTab(s); setOpenKey(null); }}
              className={`rounded px-3 py-1 text-sm ${tab === s ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}
            >
              {ALIAS_SOURCE_LABEL[s]} {count > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-900">{count} chưa gán</span>}
            </button>
          );
        })}
      </div>

      <p className="text-sm">
        <strong className={unmapped.length > 0 ? "text-amber-700" : "text-green-700"}>{unmapped.length} khóa chưa gán</strong>
        {unmapped.length > 0 && <> · {unmapped.reduce((n, r) => n + r.lineCount, 0)} dòng · {vndFormatter(unmapped.reduce((n, r) => n + r.amount, 0))}</>}
        <span className="text-muted-foreground"> / {rows.length} khóa. Dòng chưa gán vẫn được cộng vào mọi tổng của báo cáo.</span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên, ĐVT, NCC…" className="h-8 w-64" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)} className="h-8 rounded-md border bg-transparent px-2 text-sm">
          {(Object.keys(FILTER_LABEL) as StatusFilter[]).filter((f) => !(isDt && f === "ngoai_dt")).map((f) => (
            <option key={f} value={f}>{FILTER_LABEL[f]}</option>
          ))}
        </select>
        {canEdit && confirmable.length > 0 && (
          <Button size="sm" variant="outline" disabled={confirming} onClick={confirmVisible}>
            Xác nhận {confirmable.length} đề xuất đang hiện
          </Button>
        )}
      </div>

      <div className="max-h-[640px] overflow-auto rounded border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1">Tên hàng</th>
              <th className="px-2 py-1">ĐVT</th>
              {isDt && <th className="px-2 py-1">Loại</th>}
              <th className="px-2 py-1 text-right">Số dòng</th>
              <th className="px-2 py-1 text-right">{AMOUNT_TITLE[tab]}</th>
              <th className="px-2 py-1">{PARTY_TITLE[tab]}</th>
              <th className="px-2 py-1">Mã nhóm</th>
              {!isDt && <th className="px-2 py-1">Dòng DT</th>}
              {!isDt && <th className="px-2 py-1 text-right">Hệ số</th>}
              <th className="px-2 py-1">Trạng thái</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const a = r.alias;
              const canOpen = a ? canEdit : canCreate;
              const open = openKey === r.itemKey;
              return (
                <Fragment key={r.itemKey}>
                  <tr className={`border-t ${a ? "" : "bg-amber-50/60"}`}>
                    <td className="px-2 py-1">{r.itemName}</td>
                    <td className="px-2 py-1">{r.unit}</td>
                    {isDt && <td className="px-2 py-1">{a?.kind && a.kind !== r.lineKind ? <strong>{a.kind}</strong> : r.lineKind}</td>}
                    <td className="px-2 py-1 text-right">{r.lineCount}</td>
                    <td className="px-2 py-1 text-right">{vndFormatter(r.amount)}</td>
                    <td className="px-2 py-1 text-xs">{r.parties}</td>
                    <td className="px-2 py-1">{a?.groupCodeId ? groupCode.get(a.groupCodeId) ?? `#${a.groupCodeId}` : ""}</td>
                    {!isDt && <td className="max-w-72 truncate px-2 py-1 text-xs" title={a?.dtKey ? dtLabel.get(a.dtKey) : undefined}>{a?.dtKey ? dtLabel.get(a.dtKey) ?? "(dòng DT không còn)" : ""}</td>}
                    {!isDt && <td className="px-2 py-1 text-right">{a?.factor ?? ""}</td>}
                    <td className="px-2 py-1">{a ? ALIAS_STATUS_LABEL[a.status] : <span className="text-amber-700">chưa gán</span>}</td>
                    <td className="px-2 py-1 text-right">
                      {canOpen && (
                        <Button size="sm" variant={open ? "secondary" : "outline"} onClick={() => setOpenKey(open ? null : r.itemKey)}>
                          {a ? "Sửa" : "Gán"}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={isDt ? 9 : 10} className="p-0">
                        <AliasEditor projectId={projectId} row={r} groups={board.groups} dtLines={board.dtLines} canDelete={canEdit} onDone={closeAndRefresh} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={isDt ? 9 : 10} className="px-2 py-6 text-center text-muted-foreground">Không có khóa nào.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <OrphanAliases projectId={projectId} orphans={board.orphans} groups={board.groups} canEdit={canEdit} onChanged={refresh} />
    </div>
  );
}
