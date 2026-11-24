/**
 * "Việc cần làm" của trang Tổng quan (Đối chiếu DT-HĐ-TT). Mỗi việc được đếm bằng ĐÚNG vị từ mà màn
 * đích dùng để lọc, để khi bấm vào luôn thấy chính các dòng đã đếm:
 *   - tên chưa gán / đề xuất (theo nguồn)   → `aliasQueueSummary` = `effectiveAliasStatus`, như Ánh xạ;
 *   - khóa chưa có hệ số (hd / tt)          → `filterAnhXaRows(status=thieu_he_so)` = `missesFactor`;
 *   - thực tế nhập chưa gắn đầu mối        → `dtTt.untaggedReceipts` (đúng tổng các dòng không đầu mối);
 *   - đầu mối chưa chốt thực tế             → dòng Phần II có `actual === null` (lọc "chưa chốt" của Đầu mối);
 *   - NCC có HĐ chưa thuộc đầu mối         → dòng NCC (link) có đầu mối trống (lọc đầu mối = 0);
 *   - NCC có số ở HĐ-TT chưa có dòng NCC   → `suppliersWithoutLinkRow`, cùng biểu thức thông báo của Đầu mối;
 *   - dự toán chưa có loại                  → `phanIII.dtWithoutKind` (màn Dự toán lọc bằng `kindlessEstimateIds`);
 *   - chưa cài đặt tỷ lệ                    → `settings.missing` (link duy nhất được phép không lọc);
 *   - việc của kế toán (Z)                  → `HD_TT_LOC_PREDICATES["co-viec"]`.
 * Việc có số đếm / số tiền bằng 0 bị ẩn. Link đi qua `screenHref`: màn chưa sẵn sàng → trang trần.
 * Module thuần, an toàn cho bundle client.
 */

import { aliasQueueSummary, type AliasBoard, type AliasQueueEntry } from "./alias-board";
import { filterAnhXaRows } from "./anh-xa-filter";
import type { HdTtRow } from "./hd-tt-report";
import { ALIAS_SOURCE_LABEL, ALIAS_SOURCES, type AliasSource } from "./register-ui";
import type { DtHdTtReports } from "./reports";
import {
  anhXaQuery, DAU_MOI_ANCHORS, dauMoiQuery, DU_TOAN_KINDLESS, duToanQuery, NONE_FILTER_VALUE, screenHref, thucTeNhapQuery,
  UNSETTLED_ACTUAL, type AnhXaStatus, type ScreenLinkParams, type ScreenTarget,
} from "./screen-links";

// ---------------------------------------------------------------------------
// Link của Tổng quan
// ---------------------------------------------------------------------------

/** Đích + tham số đã dựng bằng builder của màn đó; href thật do `screenHref` quyết theo danh sách sẵn sàng. */
export interface ScreenLink {
  target: ScreenTarget;
  params?: ScreenLinkParams;
}

export const linkHref = (projectId: number, link: ScreenLink): string => screenHref(projectId, link.target, link.params);

// ---------------------------------------------------------------------------
// HĐ-TT `loc` (phase 7 dùng lại cho bộ lọc của màn HĐ-TT)
// ---------------------------------------------------------------------------

/** Vị từ của các giá trị `loc` trên HĐ-TT; số so sau khi làm tròn đồng, như ô báo cáo đang hiện. */
export const HD_TT_LOC_PREDICATES = {
  /** U = T − E > 0: còn phải lấy thêm HĐ. */
  "con-phai-lay-hd": (r: HdTtRow) => Math.round(r.actualMinusInvoice) > 0,
  /** Y > 0: còn phải lấy về. */
  "con-phai-lay-ve": (r: HdTtRow) => Math.round(r.stillToRecover) > 0,
  /** Z có nội dung: việc cần làm của kế toán. */
  "co-viec": (r: HdTtRow) => (r.todo ?? "").trim() !== "",
} as const satisfies Record<string, (r: HdTtRow) => boolean>;

export type HdTtLoc = keyof typeof HD_TT_LOC_PREDICATES;

/** Query `loc=…` của HĐ-TT (dựng bằng URLSearchParams như các builder khác). */
export const hdTtLocQuery = (loc: HdTtLoc): string => new URLSearchParams({ loc }).toString();

// ---------------------------------------------------------------------------
// Vị từ dùng chung với các màn đích
// ---------------------------------------------------------------------------

/** Dòng NCC (link) tối thiểu: lấy từ `listCounterparties`. */
export interface SupplierLinkRow {
  supplierId: number;
  counterpartyId: number | null;
}

/** Live DT keys của Ánh xạ: các Dòng DT còn trong dự toán. */
export const boardLiveDtKeys = (board: Pick<AliasBoard, "dtLines">): Set<string> => new Set(board.dtLines.map((l) => l.key));

/** NCC có số ở HĐ-TT nhưng chưa có dòng NCC — cùng biểu thức với thông báo `withoutRow` của trang Đầu mối. */
export function suppliersWithoutLinkRow(rows: readonly HdTtRow[], links: readonly SupplierLinkRow[]): HdTtRow[] {
  const linked = new Set(links.map((l) => l.supplierId));
  return rows.filter((r) => !linked.has(r.supplierId));
}

/** Đầu mối chưa chốt thực tế: dòng Phần II (A, B, C) có thực tế null — như lọc "chưa chốt" của Đầu mối. */
export function unsettledCounterparties(reports: Pick<DtHdTtReports, "dtTt">) {
  const { a, b, c } = reports.dtTt.phanII;
  return [...a, ...b, ...c].filter((r) => r.actual === null);
}

export const UNSETTLED_LINK: ScreenLink = { target: "dau-moi", params: { query: dauMoiQuery({ actual: UNSETTLED_ACTUAL }) } };

const anhXaLink = (tab: AliasSource, status: AnhXaStatus): ScreenLink => ({ target: "anh-xa", params: { query: anhXaQuery({ tab, status }) } });
const nonZeroMoney = (v: number) => Math.round(v) !== 0;

// ---------------------------------------------------------------------------
// Danh sách việc
// ---------------------------------------------------------------------------

export type TodoId =
  | `chua-gan-${AliasSource}`
  | `de-xuat-${AliasSource}`
  | "thieu-he-so-hd"
  | "thieu-he-so-tt"
  | "tt-chua-gan-dau-moi"
  | "dau-moi-chua-chot"
  | "ncc-chua-thuoc-dau-moi"
  | "ncc-chua-co-dong"
  | "du-toan-chua-co-loai"
  | "chua-cai-dat"
  | "ke-toan-co-viec";

export interface OverviewTodo {
  id: TodoId;
  label: string;
  /** Số dòng / khóa mà màn đích sẽ hiện; null với việc đo bằng tiền hoặc việc có / không. */
  count: number | null;
  /** Ô tiền có sẵn của báo cáo đi kèm việc, với cơ sở VAT của nó. */
  amount: { value: number; basis: string } | null;
  /** Chữ của nút đi sửa. */
  action: string;
  link: ScreenLink;
}

/** Thứ tự nguồn trong danh sách việc: hóa đơn, thực tế nhập, dự toán. */
const TODO_SOURCES: readonly AliasSource[] = ["hd", "tt", "dt"];
const sourceName = (s: AliasSource) => ALIAS_SOURCE_LABEL[s].toLowerCase();

export interface TodoCandidate {
  todo: OverviewTodo;
  /** Cần làm (số đếm > 0, số tiền ≠ 0 hoặc cờ bật) — chỉ việc cần làm mới hiện. */
  due: boolean;
}

/** Mọi việc kèm cờ "cần làm" (chưa lọc) — `buildOverviewTodos` chỉ giữ việc cần làm. */
export function overviewTodoCandidates(reports: DtHdTtReports, board: AliasBoard, links: readonly SupplierLinkRow[]): TodoCandidate[] {
  const live = boardLiveDtKeys(board);
  const entries: AliasQueueEntry[] = ALIAS_SOURCES.flatMap((source) => board.tabs[source].map((r) => ({ source, itemKey: r.itemKey, alias: r.alias })));
  const queue = aliasQueueSummary(entries, live);
  const out: TodoCandidate[] = [];
  const add = (t: Omit<OverviewTodo, "amount"> & { amount?: OverviewTodo["amount"] }, due = (t.count ?? 0) > 0) =>
    out.push({ todo: { ...t, amount: t.amount ?? null }, due });

  for (const s of TODO_SOURCES) {
    add({ id: `chua-gan-${s}`, label: `Tên ${sourceName(s)} chưa gán`, count: queue.chuaGan[s], action: "Gán ở Ánh xạ", link: anhXaLink(s, "chua_gan") });
  }
  for (const s of TODO_SOURCES) {
    add({ id: `de-xuat-${s}`, label: `Đề xuất ${sourceName(s)} chờ xác nhận`, count: queue.deXuat[s], action: "Xác nhận ở Ánh xạ", link: anhXaLink(s, "de_xuat") });
  }
  for (const s of ["hd", "tt"] as const) {
    const count = filterAnhXaRows(board.tabs[s], { tab: s, status: "thieu_he_so" }, live).length;
    add({ id: `thieu-he-so-${s}`, label: `Khóa ${sourceName(s)} chưa có hệ số`, count, action: "Nhập hệ số ở Ánh xạ", link: anhXaLink(s, "thieu_he_so") });
  }

  const untagged = reports.dtTt.untaggedReceipts;
  add(
    {
      id: "tt-chua-gan-dau-moi", label: "Thực tế nhập chưa gắn đầu mối", count: null, amount: { value: untagged, basis: "gồm VAT" },
      action: "Gắn đầu mối ở Thực tế nhập", link: { target: "thuc-te-nhap", params: { query: thucTeNhapQuery({ counterpartyId: NONE_FILTER_VALUE }) } },
    },
    nonZeroMoney(untagged),
  );
  add({ id: "dau-moi-chua-chot", label: "Đầu mối chưa chốt thực tế", count: unsettledCounterparties(reports).length, action: "Chốt ở Đầu mối", link: UNSETTLED_LINK });
  add({
    id: "ncc-chua-thuoc-dau-moi", label: "NCC có HĐ nhưng chưa thuộc đầu mối", count: links.filter((l) => l.counterpartyId === null).length,
    action: "Gắn ở Đầu mối", link: { target: "dau-moi", params: { query: dauMoiQuery({ counterpartyId: 0 }), hash: DAU_MOI_ANCHORS.ncc } },
  });
  add({
    id: "ncc-chua-co-dong", label: "NCC có số ở HĐ-TT nhưng chưa có dòng NCC", count: suppliersWithoutLinkRow(reports.hdTt.rows, links).length,
    action: "Thêm dòng ở Đầu mối", link: { target: "dau-moi", params: { hash: DAU_MOI_ANCHORS.nccWithoutRow } },
  });

  const kindless = reports.phanIII.dtWithoutKind;
  add(
    {
      id: "du-toan-chua-co-loai", label: "Dự toán chưa có loại VL / NC / MTC", count: null, amount: { value: kindless, basis: "chưa VAT" },
      action: "Xem ở Dự toán", link: { target: "du-toan", params: { query: duToanQuery({ loai: DU_TOAN_KINDLESS }) } },
    },
    nonZeroMoney(kindless),
  );
  add({ id: "chua-cai-dat", label: "Chưa cài đặt tỷ lệ (đang dùng tỷ lệ mặc định)", count: null, action: "Mở Cài đặt", link: { target: "cai-dat" } }, reports.settings.missing);
  add({
    id: "ke-toan-co-viec", label: "Việc cần làm của kế toán (cột Z)", count: reports.hdTt.rows.filter(HD_TT_LOC_PREDICATES["co-viec"]).length,
    action: "Xem ở HĐ-TT", link: { target: "hd-tt", params: { query: hdTtLocQuery("co-viec") } },
  });
  return out;
}

/** Việc cần làm theo thứ tự hiện; việc bằng 0 bị ẩn. */
export function buildOverviewTodos(reports: DtHdTtReports, board: AliasBoard, links: readonly SupplierLinkRow[]): OverviewTodo[] {
  return overviewTodoCandidates(reports, board, links).filter((c) => c.due).map((c) => c.todo);
}
