"use client";

/**
 * Màn HĐ-TT (client, chỉ trên màn hình — bản in vẫn là `HdTtView` nguyên vẹn). Bảng 13 cột tiền trong một hộp cuộn
 * (hd-tt-screen-table.tsx), chip `loc` lọc theo đúng vị từ của Tổng quan (`loc` sống trên URL qua `useUrlState`),
 * dòng tổng luôn là tổng cả bảng, dòng kiểm tổng chỉ ra S ngoài quy tắc (hd-tt-screen-checks.tsx).
 * Người có quyền `edit` bật "Nhập H / S / X / Z" để gõ ngay trên bảng:
 *   - đọc ô theo từng trường (`hdTtCellPatch`), lưu bằng action sẵn có `updateCounterpartySupplier(linkId, …)`;
 *   - nháp khóa theo `${linkId}:${ô}`, giữ qua các lần render lại cho tới khi giá trị server bằng nháp (`mergeDrafts`);
 *   - lưu lỗi (cả dòng NCC đã bị xóa) → giữ nháp, đánh dấu ô kèm thông báo, đưa con trỏ về ô đó;
 *   - lưu xong → Enter xuống dòng dưới. Không gọi `router.refresh()`: action đã revalidate trang đang xem.
 * Hook đo: `data-hd-tt-screen`, `data-hd-tt-state` (JSON trạng thái URL), `data-hd-tt-rows`, `data-visible-rows`,
 * `data-can-edit`, `data-editing`, `data-loc-chip` (+ `data-count`), `data-hd-tt-edit-toggle`.
 */

import { useMemo, useRef, useState } from "react";
import { updateCounterpartySupplier } from "@/lib/du-an/dt-hd-tt/counterparty-service";
import type { HdTtReport } from "@/lib/du-an/dt-hd-tt/hd-tt-report";
import {
  buildHdTtView, buildScreenRows, canTypeSplit, draftKey, hdTtCellPatch, hdTtLocCounts, mergeDrafts, splitBlockers, textMatchesStored,
  type Drafts, type HdTtEditField, type HdTtScreenRow,
} from "@/lib/du-an/dt-hd-tt/hd-tt-screen-model";
import type { HdTtLoc } from "@/lib/du-an/dt-hd-tt/overview-todos";
import { canonicalJson, HD_TT_LOCS, HD_TT_URL, type HdTtParams } from "@/lib/du-an/dt-hd-tt/screen-links";
import type { CommitMove } from "./hd-tt-edit-cell";
import { HdTtScreenChecks } from "./hd-tt-screen-checks";
import { HdTtScreenTable, type HdTtEditController } from "./hd-tt-screen-table";
import { ActiveFilterLine, FilterChip } from "./report-bits";
import { useUrlState } from "./use-url-state";

const LOC_LABELS: Record<HdTtLoc, string> = {
  "con-phai-lay-hd": "Còn phải lấy HĐ (U > 0)",
  "con-phai-lay-ve": "Còn phải lấy về (Y > 0)",
  "co-viec": "Có việc cần làm (Z)",
};

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export interface HdTtScreenProps {
  projectId: number;
  report: HdTtReport;
  /** Trạng thái server đọc từ `searchParams` — chỉ cho lần render đầu (xem useUrlState). */
  initialParams: HdTtParams;
  /** Quyền `edit` của công trình (`canEditFrom`); false → không có nút nhập, không có ô nhập. */
  canEdit: boolean;
}

export function HdTtScreen({ projectId, report, initialParams, canEdit }: HdTtScreenProps) {
  const [params, setParams] = useUrlState(initialParams, HD_TT_URL);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set());
  // Dòng server mới (sau một lần lưu, của ô này hay ô khác): bỏ nháp đã bằng giá trị server, giữ phần còn lại.
  const [seenRows, setSeenRows] = useState(report.rows);
  if (seenRows !== report.rows) {
    setSeenRows(report.rows);
    setDrafts(mergeDrafts(drafts, report.rows));
  }
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const inFlight = useRef(new Set<string>());
  /** Chữ vừa lưu xong của từng ô, để lần rời ô ngay sau Enter không lưu lại lần nữa trước khi trang render lại. */
  const savedText = useRef(new Map<string, string>());

  const rows = useMemo(() => buildScreenRows(report.rows), [report.rows]);
  const view = useMemo(() => buildHdTtView(rows, params.loc), [rows, params.loc]);
  const counts = useMemo(() => hdTtLocCounts(report.rows), [report.rows]);
  const blockers = useMemo(() => splitBlockers(rows), [rows]);
  const failed = Object.values(drafts).filter((d) => d.error !== null).length;

  const focusCell = (key: string | undefined) => {
    const el = key ? inputs.current.get(key) : undefined;
    el?.focus();
    el?.select();
  };
  const dropDraft = (key: string) =>
    setDrafts((d) => {
      if (!(key in d)) return d;
      const rest = { ...d };
      delete rest[key];
      return rest;
    });
  /** Ô cùng trường ở dòng có thể nhập kế tiếp (theo thứ tự đang hiện). */
  const nextKey = (row: HdTtScreenRow, field: HdTtEditField): string | undefined => {
    const order = view.groups.flatMap((g) => g.rows).filter((r) => r.linkId !== null && (field !== "S" || canTypeSplit(r)));
    const next = order[order.findIndex((r) => r.linkId === row.linkId) + 1];
    return next?.linkId != null ? draftKey(next.linkId, field) : undefined;
  };

  async function commit(row: HdTtScreenRow, field: HdTtEditField, text: string, move: CommitMove) {
    if (row.linkId === null) return;
    const key = draftKey(row.linkId, field);
    const next = move === "down" ? nextKey(row, field) : undefined;
    if (inFlight.current.has(key)) return;
    if (textMatchesStored(row, field, text) || savedText.current.get(key) === text) {
      if (textMatchesStored(row, field, text)) dropDraft(key);
      focusCell(next);
      return;
    }
    const fail = (message: string) => {
      setDrafts((d) => ({ ...d, [key]: { text, error: message } }));
      focusCell(key);
    };
    let patch;
    try {
      patch = hdTtCellPatch(field, text);
    } catch (err) {
      fail(errorText(err));
      return;
    }
    inFlight.current.add(key);
    setSaving((s) => new Set(s).add(key));
    try {
      const result = await updateCounterpartySupplier(row.linkId, projectId, patch);
      if (!result.ok) {
        fail(result.message);
        return;
      }
      savedText.current.set(key, text);
      // Giữ nháp (không lỗi) tới khi trang render lại với giá trị mới — `mergeDrafts` bỏ nó khi đã bằng.
      setDrafts((d) => (d[key]?.text === text ? { ...d, [key]: { text, error: null } } : d));
      focusCell(next);
    } catch (err) {
      fail(errorText(err));
    } finally {
      inFlight.current.delete(key);
      setSaving((s) => {
        const rest = new Set(s);
        rest.delete(key);
        return rest;
      });
    }
  }

  const editMode = canEdit && editing;
  const edit: HdTtEditController | null = editMode
    ? {
        drafts,
        saving,
        change: (key, text) => {
          savedText.current.delete(key);
          setDrafts((d) => ({ ...d, [key]: { text, error: d[key]?.error ?? null } }));
        },
        commit: (row, field, text, move) => void commit(row, field, text, move),
        revert: (key) => {
          savedText.current.delete(key);
          dropDraft(key);
        },
        register: (key, el) => {
          if (el) inputs.current.set(key, el);
          else inputs.current.delete(key);
        },
      }
    : null;

  return (
    <div
      className="space-y-3"
      data-hd-tt-screen=""
      data-hd-tt-state={canonicalJson(params)}
      data-hd-tt-rows={rows.length}
      data-visible-rows={view.shown}
      data-can-edit={canEdit ? "true" : "false"}
      data-editing={editMode ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span data-loc-chip="">
          <FilterChip label="Tất cả" count={rows.length} active={params.loc === undefined} onClick={() => setParams({})} />
        </span>
        {HD_TT_LOCS.map((loc) => (
          <span key={loc} data-loc-chip={loc} data-count={counts[loc]}>
            <FilterChip label={LOC_LABELS[loc]} count={counts[loc]} active={params.loc === loc} onClick={() => setParams(params.loc === loc ? {} : { loc })} />
          </span>
        ))}
        {canEdit && (
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
            className="ml-auto inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            data-hd-tt-edit-toggle=""
          >
            {editing ? "Xong nhập" : "Nhập H / S / X / Z"}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Số gồm VAT. Bấm số E / G để mở sổ Hóa đơn / Chi thực tế của NCC đó; rê chuột lên đầu cột để xem công thức.
        {editMode && " Enter lưu và xuống dòng, Tab sang ô kế (rời ô là lưu), Esc bỏ nháp. S chỉ nhập ở NCC sau của đầu mối nhiều NCC đã chốt thực tế."}
      </p>
      {editMode && failed > 0 && <p className="text-xs font-medium text-red-700 dark:text-red-300">{failed} ô chưa lưu được — xem thông báo dưới ô.</p>}
      <ActiveFilterLine active={view.filtering} shown={view.shown} total={view.total} onClear={() => setParams({})} />
      <HdTtScreenTable projectId={projectId} groups={view.groups} totals={report.totals} filtering={view.filtering} edit={edit} />
      <HdTtScreenChecks projectId={projectId} report={report} blockers={blockers} />
    </div>
  );
}
