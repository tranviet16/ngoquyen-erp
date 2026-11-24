"use client";

/**
 * Màn Ánh xạ: ba tab DT / HĐ / TT, mỗi khóa tên|ĐVT một dòng (số dòng, Σ tiền, NCC). Bộ đếm "chưa gán"
 * đứng đầu, khóa chưa gán xếp trước. "Xác nhận các đề xuất" xác nhận hàng loạt các đề xuất đủ điều kiện
 * trong danh sách đang lọc. Cuối trang: alias mồ côi.
 * Tab / trạng thái / ô tìm / khóa sống trên URL (`tab`, `status`, `q`, `key` — screen-links). "Chưa
 * gán" theo `effectiveAliasStatus`: alias trỏ Dòng DT không còn là chưa gán, mở nó cần quyền `edit`.
 *
 * Khóa đang mở chính là `key` của URL. Bấm "Gán" / "Sửa" điều hướng thật (`router.replace`) tới URL có
 * `key` (kèm `tab`) để trang đọc dòng nguồn của khóa; props mới đi qua quy tắc đối chiếu của
 * `useUrlState` như mọi lần điều hướng khác. Đóng ô gán bỏ `key` bằng `replaceState` (không tải lại).
 * "Lưu và sang dòng kế" xác nhận rồi mở khóa kế (`nextOpenKey`) trong danh sách của tab theo bộ lọc
 * trước lần lưu; hết danh sách thì đóng và báo.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScreenStateHook } from "@/components/du-an/dt-hd-tt/screen-state-hook";
import { useUrlState } from "@/components/du-an/dt-hd-tt/use-url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vndFormatter } from "@/lib/format";
import type { AliasBoard, AliasKeyRow } from "@/lib/du-an/dt-hd-tt/alias-board";
import { confirmAliases } from "@/lib/du-an/dt-hd-tt/alias-service";
// Chỉ kiểu: module loader đọc Prisma, không được vào bundle client.
import type { AliasSourceLines } from "@/lib/du-an/dt-hd-tt/alias-source-lines";
import { filterAnhXaRows, matchesStatus, statusAppliesTo, unmappedRows } from "@/lib/du-an/dt-hd-tt/anh-xa-filter";
import { ALIAS_SOURCES, ALIAS_SOURCE_LABEL, ALIAS_STATUS_LABEL, isBulkConfirmable, nextOpenKey, type AliasSource } from "@/lib/du-an/dt-hd-tt/register-ui";
import { ANH_XA_QUERY_MAX, ANH_XA_STATUSES, ANH_XA_URL, type AnhXaParams, type AnhXaStatus } from "@/lib/du-an/dt-hd-tt/screen-links";
import { AnhXaKeyTable } from "./anh-xa-key-table";
import { OrphanAliases } from "./anh-xa-orphans";

const STATUS_LABEL: Record<AnhXaStatus, string> = { chua_gan: "Chưa gán", ...ALIAS_STATUS_LABEL, thieu_he_so: "Chưa có hệ số" };

interface Props {
  projectId: number;
  board: AliasBoard;
  /** Tham số server đọc từ URL — chỉ dùng cho lần render đầu (xem useUrlState). */
  initialParams: AnhXaParams;
  /** Tab khi URL không có `tab`: tab đầu tiên còn khóa chưa gán, chốt lúc vào trang. */
  defaultTab: AliasSource;
  canCreate: boolean;
  canEdit: boolean;
  /** Dòng nguồn của khóa `key` trên URL (null khi URL không mở khóa nào). */
  sourceLines: AliasSourceLines | null;
}

export function AnhXaClient({ projectId, board, initialParams, defaultTab, canCreate, canEdit, sourceLines }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [opening, startOpening] = useTransition();
  // Chốt tab mặc định lúc vào trang: refresh sau khi gán không được tự đổi tab dưới tay người dùng.
  const [fallbackTab] = useState(defaultTab);
  // Bộ lọc nhận từ ngoài vào (Back, link khác, mở khóa) đổi luôn khóa đang mở: khóa mở = `key` của URL.
  const [params, setParams] = useUrlState(initialParams, ANH_XA_URL);
  const [confirming, setConfirming] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  const tab = params.tab ?? fallbackTab;
  const openKey = params.key ?? null;
  const liveDtKeys = new Set(board.dtLines.map((l) => l.key));
  const rows = board.tabs[tab];
  const visible = filterAnhXaRows(rows, params, liveDtKeys);
  const unmapped = unmappedRows(rows, liveDtKeys);
  const confirmable = visible.flatMap((r) => (r.alias && isBulkConfirmable({ ...r.alias, source: r.source }) ? [r.alias.id] : []));
  const statusOptions = ANH_XA_STATUSES.filter((s) => statusAppliesTo(tab, s) || s === params.status);
  // Alias đã có (kể cả alias trỏ Dòng DT không còn) → sửa, cần `edit`; chưa có → gán, cần `create`.
  const canOpenRow = (r: AliasKeyRow) => (r.alias ? canEdit : canCreate);
  // Danh sách của tab theo bộ lọc, bỏ `key` (khóa đang mở): thứ tự để "sang dòng kế", tính trước lần lưu.
  const listKeys = filterAnhXaRows(rows, { ...params, key: undefined }, liveDtKeys).map((r) => r.itemKey);
  const openableKeys = new Set(rows.filter(canOpenRow).map((r) => r.itemKey));

  const switchTab = (s: AliasSource) => {
    const status = params.status && statusAppliesTo(s, params.status) ? params.status : undefined;
    setParams({ ...params, tab: s, status, key: undefined });
  };

  /** Mở ô gán: điều hướng thật tới URL có `key` (và `tab`), trang đọc dòng nguồn của khóa đó. */
  const openKeyNav = (itemKey: string) => {
    const { pathname, search, hash } = window.location;
    const query = ANH_XA_URL.write({ ...params, tab, key: itemKey }, search);
    startOpening(() => router.replace(`${pathname}?${query}${hash}`, { scroll: false }));
  };
  const closeKey = () => setParams({ ...params, key: undefined });
  const closeAndRefresh = () => {
    closeKey();
    refresh();
  };

  /** Sau "Lưu và sang dòng kế": mở khóa kế mở được, hoặc đóng và báo hết danh sách. */
  const advanceFrom = (current: string) => {
    const next = nextOpenKey(listKeys, current, (k) => openableKeys.has(k));
    if (next) {
      openKeyNav(next);
      return;
    }
    toast.info("Đã hết khóa trong danh sách đang lọc");
    closeAndRefresh();
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
            <button type="button" onClick={closeKey} className="text-muted-foreground underline hover:text-foreground">
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

      <AnhXaKeyTable
        projectId={projectId}
        tab={tab}
        rows={visible}
        board={board}
        liveDtKeys={liveDtKeys}
        openKey={openKey}
        canOpenRow={canOpenRow}
        canEdit={canEdit}
        opening={opening}
        sourceLines={sourceLines}
        onOpen={openKeyNav}
        onClose={closeKey}
        onDone={closeAndRefresh}
        onAdvance={advanceFrom}
      />

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
