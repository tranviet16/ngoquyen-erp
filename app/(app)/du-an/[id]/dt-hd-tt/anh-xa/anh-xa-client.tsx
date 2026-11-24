"use client";

/**
 * Màn Ánh xạ: ba tab DT / HĐ / TT, mỗi khóa tên|ĐVT một dòng (số dòng, Σ tiền, NCC). Bộ đếm "chưa gán"
 * đứng đầu, khóa chưa gán xếp trước. Bấm "Gán" / "Sửa" mở ô gán ngay dưới dòng; "Xác nhận các đề xuất"
 * xác nhận hàng loạt các đề xuất đủ điều kiện trong danh sách đang lọc. Cuối trang: alias mồ côi.
 * Tab / trạng thái / ô tìm / khóa sống trên URL (`tab`, `status`, `q`, `key` — screen-links). "Chưa
 * gán" theo `effectiveAliasStatus`: alias trỏ Dòng DT không còn là chưa gán, mở nó cần quyền `edit`.
 */

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScreenStateHook } from "@/components/du-an/dt-hd-tt/screen-state-hook";
import { useUrlState } from "@/components/du-an/dt-hd-tt/use-url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vndFormatter } from "@/lib/format";
import type { AliasBoard } from "@/lib/du-an/dt-hd-tt/alias-board";
import { confirmAliases } from "@/lib/du-an/dt-hd-tt/alias-service";
import { filterAnhXaRows, matchesStatus, rowStatus, statusAppliesTo, unmappedRows } from "@/lib/du-an/dt-hd-tt/anh-xa-filter";
import { ALIAS_SOURCES, ALIAS_SOURCE_LABEL, ALIAS_STATUS_LABEL, isBulkConfirmable, type AliasSource } from "@/lib/du-an/dt-hd-tt/register-ui";
import { ANH_XA_QUERY_MAX, ANH_XA_STATUSES, ANH_XA_URL, type AnhXaParams, type AnhXaStatus } from "@/lib/du-an/dt-hd-tt/screen-links";
import { AliasEditor } from "./anh-xa-editor";
import { OrphanAliases } from "./anh-xa-orphans";

const STATUS_LABEL: Record<AnhXaStatus, string> = { chua_gan: "Chưa gán", ...ALIAS_STATUS_LABEL, thieu_he_so: "Chưa có hệ số" };
const AMOUNT_TITLE: Record<AliasSource, string> = { dt: "Giá trị DT", hd: "Σ chưa VAT", tt: "Σ gồm VAT" };
const PARTY_TITLE: Record<AliasSource, string> = { dt: "NCC phụ trách", hd: "NCC", tt: "Đầu mối" };

interface Props {
  projectId: number;
  board: AliasBoard;
  /** Tham số server đọc từ URL — chỉ dùng cho lần render đầu (xem useUrlState). */
  initialParams: AnhXaParams;
  /** Tab khi URL không có `tab`: tab đầu tiên còn khóa chưa gán, chốt lúc vào trang. */
  defaultTab: AliasSource;
  canCreate: boolean;
  canEdit: boolean;
}

export function AnhXaClient({ projectId, board, initialParams, defaultTab, canCreate, canEdit }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Chốt tab mặc định lúc vào trang: refresh sau khi gán không được tự đổi tab dưới tay người dùng.
  const [fallbackTab] = useState(defaultTab);
  const [openKey, setOpenKey] = useState<string | null>(initialParams.key ?? null);
  // Bộ lọc nhận từ ngoài vào (Back, link khác) → đóng ô đang mở, mở khóa của `key` nếu có.
  const [params, setParams] = useUrlState(initialParams, ANH_XA_URL, (p) => setOpenKey(p.key ?? null));
  const [confirming, setConfirming] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  const tab = params.tab ?? fallbackTab;
  const liveDtKeys = new Set(board.dtLines.map((l) => l.key));
  const groupCode = new Map(board.groups.map((g) => [g.id, g.code]));
  const dtLabel = new Map(board.dtLines.map((l) => [l.key, l.label]));
  const rows = board.tabs[tab];
  const visible = filterAnhXaRows(rows, params, liveDtKeys);
  const unmapped = unmappedRows(rows, liveDtKeys);
  const confirmable = visible.flatMap((r) => (r.alias && isBulkConfirmable({ ...r.alias, source: r.source }) ? [r.alias.id] : []));
  const isDt = tab === "dt";
  const statusOptions = ANH_XA_STATUSES.filter((s) => statusAppliesTo(tab, s) || s === params.status);

  const switchTab = (s: AliasSource) => {
    setOpenKey(null);
    const status = params.status && statusAppliesTo(s, params.status) ? params.status : undefined;
    setParams({ ...params, tab: s, status, key: undefined });
  };

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
          const count = unmappedRows(board.tabs[s], liveDtKeys).length;
          return (
            <button
              key={s}
              type="button"
              onClick={() => switchTab(s)}
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
        <Input
          value={params.q ?? ""}
          onChange={(e) => setParams({ ...params, q: e.target.value || undefined })}
          maxLength={ANH_XA_QUERY_MAX}
          placeholder="Tìm tên, ĐVT, NCC…"
          className="h-8 w-64"
          data-filter-control="q"
        />
        <select
          value={params.status ?? "all"}
          onChange={(e) => setParams({ ...params, status: e.target.value === "all" ? undefined : (e.target.value as AnhXaStatus) })}
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
          data-filter-control="status"
        >
          <option value="all">Tất cả</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        {params.key && (
          <span className="flex items-center gap-2 text-sm">
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-0.5 text-amber-900">Đang lọc: một khóa</span>
            <button type="button" onClick={() => setParams({ ...params, key: undefined })} className="text-muted-foreground underline hover:text-foreground">
              Bỏ lọc
            </button>
          </span>
        )}
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
              // Alias đã có (kể cả alias trỏ Dòng DT không còn) → sửa, cần `edit`; chưa có → gán, cần `create`.
              const canOpen = a ? canEdit : canCreate;
              const open = canOpen && openKey === r.itemKey;
              const status = rowStatus(r, liveDtKeys);
              return (
                <Fragment key={r.itemKey}>
                  <tr className={`border-t ${status === "chua_gan" ? "bg-amber-50/60" : ""}`}>
                    <td className="px-2 py-1">{r.itemName}</td>
                    <td className="px-2 py-1">{r.unit}</td>
                    {isDt && <td className="px-2 py-1">{a?.kind && a.kind !== r.lineKind ? <strong>{a.kind}</strong> : r.lineKind}</td>}
                    <td className="px-2 py-1 text-right">{r.lineCount}</td>
                    <td className="px-2 py-1 text-right">{vndFormatter(r.amount)}</td>
                    <td className="px-2 py-1 text-xs">{r.parties}</td>
                    <td className="px-2 py-1">{a?.groupCodeId ? groupCode.get(a.groupCodeId) ?? `#${a.groupCodeId}` : ""}</td>
                    {!isDt && <td className="max-w-72 truncate px-2 py-1 text-xs" title={a?.dtKey ? dtLabel.get(a.dtKey) : undefined}>{a?.dtKey ? dtLabel.get(a.dtKey) ?? "(dòng DT không còn)" : ""}</td>}
                    {!isDt && <td className="px-2 py-1 text-right">{a?.factor ?? ""}</td>}
                    <td className="px-2 py-1">{status === "chua_gan" ? <span className="text-amber-700">chưa gán</span> : ALIAS_STATUS_LABEL[status]}</td>
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
      <ScreenStateHook
        name="anh-xa"
        state={params}
        visibleRows={visible.length}
        samples={{
          status: ANH_XA_STATUSES.filter((s) => statusAppliesTo(tab, s) && rows.some((r) => matchesStatus(r, s, liveDtKeys))),
          q: rows.length > 0 ? [rows[0].itemName] : [],
          key: rows.length > 0 ? [rows[0].itemKey] : [],
        }}
        extra={{ "data-tab": tab, "data-open-key": openKey ?? "", "data-total-rows": rows.length }}
      />
    </div>
  );
}
