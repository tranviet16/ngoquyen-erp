"use client";

/**
 * Màn hình DT-HĐ (client, chỉ trên màn hình — bản in vẫn là `DtHdView` nguyên vẹn): mở ra một dòng tóm
 * tắt mỗi đầu mối; bấm đầu mối mở các nhóm, bấm nhóm mở dòng dự toán; dòng hóa đơn "↳" sau công tắc
 * "Hiện dòng hóa đơn". Lọc theo tình trạng (chip), một đầu mối (ô chọn) và tên (ô tìm): khối khớp mở sẵn,
 * khối khác ẩn, nhóm giữ tổng của báo cáo, đầu bảng ghi "đang lọc: hiện n / m dòng".
 * Khối đang mở, đầu mối, tình trạng và công tắc HĐ sống trên URL (`mo`, `dauMoi`, `loc`, `hd` của
 * screen-links) qua `useUrlState`: đọc URL đang hiện khi gắn trang, chỉ nhận props khi chúng bằng URL,
 * ghi lại bằng replaceState — nên giữ nguyên sau reload và Back. Ô tìm và nhóm đang mở chỉ ở client.
 * Bảng tóm tắt KHÔNG bọc `overflow-x-auto` để đầu bảng dính theo `main` (app/globals.css).
 * Hook đo: `data-dt-hd-screen`, `data-dt-hd-state` (JSON trạng thái URL), `data-dt-hd-open`,
 * `data-dt-hd-blocks`, `data-visible-lines` / `data-total-lines`, `data-loc-chip`.
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { DtHdReport } from "@/lib/du-an/dt-hd-tt/dt-hd-report";
import { blockKey, buildScreenView, locCounts, openBlockKeys, SCREEN_STATUSES, SUMMARY_COLUMNS, toggleBlock } from "@/lib/du-an/dt-hd-tt/dt-hd-screen-model";
import { canonicalJson } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { DT_HD_LOCS, DT_HD_URL, NONE_FILTER_VALUE, type DtHdBlockKey, type DtHdLoc, type DtHdParams } from "@/lib/du-an/dt-hd-tt/screen-links";
import { BrokenTieOut, DtHdScreenBlock, SUMMARY_COLS } from "./dt-hd-screen-block";
import { DtHdScreenPartB } from "./dt-hd-screen-part-b";
import { ActiveFilterLine, FilterChip, moneyOrZero, TH } from "./report-bits";
import { useUrlState } from "./use-url-state";

const TH_NUM = TH.replace("text-left", "text-right");
const locLabel = (loc: DtHdLoc): string => SCREEN_STATUSES.find((s) => s.slug === loc)?.label ?? loc;
const pickerValue = (v: string): DtHdBlockKey | undefined => (v === "" ? undefined : v === NONE_FILTER_VALUE ? NONE_FILTER_VALUE : Number(v));

export interface DtHdScreenProps {
  projectId: number;
  report: DtHdReport;
  /** Trạng thái server đọc từ `searchParams` — chỉ cho lần render đầu (xem useUrlState). */
  initialParams: DtHdParams;
  /** Khóa tên|ĐVT đang lưu của các dòng HĐ "Chưa gán" ở Phần B, theo id dòng. */
  partBKeys: Readonly<Record<number, string>>;
}

export function DtHdScreen({ projectId, report, initialParams, partBKeys }: DtHdScreenProps) {
  // Nhóm người dùng đã bấm đổi so với mặc định (lọc theo dòng → mở; không → đóng).
  const [groupToggles, setGroupToggles] = useState<ReadonlySet<string>>(() => new Set());
  const resetGroups = () => setGroupToggles(new Set());
  // Trạng thái nhận từ ngoài vào (Back, link khác) → nhóm về mặc định.
  const [params, setParams] = useUrlState(initialParams, DT_HD_URL, resetGroups);
  const [q, setQ] = useState("");

  const view = useMemo(() => buildScreenView(report, { dauMoi: params.dauMoi, loc: params.loc, q }), [report, params.dauMoi, params.loc, q]);
  const counts = useMemo(() => locCounts(report), [report]);
  const open = new Set(openBlockKeys(params.mo, view));

  // Đổi bộ lọc = cách xem mới: các khối khớp mở lại theo mặc định.
  const setFilter = (patch: Pick<DtHdParams, "dauMoi" | "loc">) => {
    setParams({ ...params, ...patch, mo: undefined });
    resetGroups();
  };
  const search = (value: string) => {
    setQ(value);
    resetGroups();
    if (params.mo !== undefined) setParams({ ...params, mo: undefined });
  };
  const clearFilters = () => {
    setQ("");
    resetGroups();
    setParams({ hd: params.hd });
  };
  const toggleGroup = (key: string) =>
    setGroupToggles((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div
      className="space-y-3"
      data-dt-hd-screen=""
      data-dt-hd-state={canonicalJson(params)}
      data-dt-hd-open={[...open].join(",")}
      data-dt-hd-blocks={report.blocks.length}
      data-visible-lines={view.shownLines}
      data-total-lines={view.totalLines}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span data-loc-chip="">
          <FilterChip label="Tất cả" count={view.totalLines} active={params.loc === undefined} onClick={() => setFilter({ dauMoi: params.dauMoi, loc: undefined })} />
        </span>
        {DT_HD_LOCS.map((loc) => (
          <span key={loc} data-loc-chip={loc} data-count={counts[loc]}>
            <FilterChip
              label={locLabel(loc)}
              count={counts[loc]}
              active={params.loc === loc}
              onClick={() => setFilter({ dauMoi: params.dauMoi, loc: params.loc === loc ? undefined : loc })}
            />
          </span>
        ))}
        <select
          value={params.dauMoi === undefined ? "" : String(params.dauMoi)}
          onChange={(e) => setFilter({ dauMoi: pickerValue(e.target.value), loc: params.loc })}
          className="h-8 max-w-64 rounded-md border bg-transparent px-2 text-sm"
          aria-label="Đầu mối"
          data-filter-control="dauMoi"
        >
          <option value="">Tất cả đầu mối</option>
          {report.blocks.map((b) => (
            <option key={String(blockKey(b))} value={String(blockKey(b))}>{b.name}</option>
          ))}
        </select>
        <span className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => search(e.target.value)} placeholder="Tìm vật tư, nhóm, đầu mối…" className="h-8 w-64 pl-7" aria-label="Tìm theo tên" data-filter-control="q" />
        </span>
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={params.hd === true}
            onChange={(e) => setParams({ ...params, hd: e.target.checked ? true : undefined })}
            data-filter-control="hd"
          />
          Hiện dòng hóa đơn
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Số tiền chưa VAT; thực tế chưa VAT = thực tế gồm VAT ÷ (1 + VAT). Bấm tên đầu mối để mở các nhóm, bấm nhóm để xem dòng dự toán.
      </p>
      <ActiveFilterLine active={view.filtering} shown={view.shownLines} total={view.totalLines} onClear={clearFilters} />

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className={TH}>Đầu mối</th>
            {SUMMARY_COLUMNS.map((c) => (
              <th key={c.id} className={TH_NUM}>{c.label}</th>
            ))}
            <th className={TH}>Tình trạng dòng DT</th>
          </tr>
        </thead>
        {view.blocks.map((sb) => (
          <DtHdScreenBlock
            key={String(sb.key)}
            projectId={projectId}
            sb={sb}
            open={open.has(sb.key)}
            onToggle={(key) => setParams({ ...params, mo: toggleBlock(params.mo, view, key) })}
            isGroupOpen={(key) => view.linesFiltered !== groupToggles.has(key)}
            onToggleGroup={toggleGroup}
            showInvoices={params.hd === true}
            linesFiltered={view.linesFiltered}
          />
        ))}
        {view.blocks.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={SUMMARY_COLS} className="border px-2 py-6 text-center text-muted-foreground">Không có đầu mối nào khớp bộ lọc.</td>
            </tr>
          </tbody>
        )}
      </table>

      <DtHdScreenPartB projectId={projectId} report={report} partBKeys={partBKeys} />
      {report.grandCheck.ok ? (
        <p className="text-xs text-muted-foreground">
          Kiểm tổng khớp — {report.grandCheck.label}: {moneyOrZero(report.grandCheck.expected)}
        </p>
      ) : (
        <BrokenTieOut t={report.grandCheck} />
      )}
    </div>
  );
}
