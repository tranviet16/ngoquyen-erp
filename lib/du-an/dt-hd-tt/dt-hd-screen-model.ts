/**
 * Mô hình màn hình DT-HĐ (thuần, an toàn cho bundle client): chiếu `DtHdReport` thành một dòng tóm tắt
 * mỗi khối đầu mối, các nhóm và dòng dự toán của khối, cùng bộ lọc (tình trạng / đầu mối / tên) và trạng
 * thái mở khối của URL. KHÔNG có số mới: cột tóm tắt là ô sẵn có của khối (`SUMMARY_COLUMNS`), nhóm giữ
 * tổng của báo cáo kể cả khi đang lọc; số đếm tình trạng đếm lại từ tình trạng từng dòng (ẩn số 0). Số duy
 * nhất suy ra là "Còn lại" của dòng Cộng khối (valueDt − groupsHd) — đúng phép tính bản in làm ngay trong
 * ô (dt-hd-view.tsx); test ghim nó bằng số viết tay. Phần B tách hai danh sách theo `outsideReason`.
 */

import { normalizeRecordName } from "@/lib/master-data/name-match";
import type { DtHdBlock, DtHdGroupRow, DtHdInvoiceRow, DtHdLineRow, DtHdReport } from "./dt-hd-report";
import type { DtHdStatus } from "./dt-hd-status";
import type { TieOut } from "./report-inputs";
import { DT_HD_OPEN_MAX, NONE_FILTER_VALUE, type DtHdBlockKey, type DtHdLoc } from "./screen-links";

// ---------------------------------------------------------------------------
// Tình trạng dòng dự toán → huy hiệu chữ
// ---------------------------------------------------------------------------

/** Mã tình trạng trên màn hình; bốn mã đầu trùng giá trị `loc` của URL. */
export type ScreenStatus = DtHdLoc | "du" | "theo-gia-tri";

/** Thứ tự huy hiệu và nhãn chữ. Tình trạng "" (không có dự toán, không có HĐ) không có huy hiệu. */
export const SCREEN_STATUSES: readonly { slug: ScreenStatus; status: DtHdStatus; label: string }[] = [
  { slug: "vuot", status: "Vượt", label: "Vượt" },
  { slug: "con-thieu", status: "Còn thiếu", label: "Còn thiếu" },
  { slug: "chua-co-hd", status: "Chưa có HĐ", label: "Chưa có HĐ" },
  { slug: "thieu-he-so", status: "Chưa kết luận (thiếu hệ số)", label: "Thiếu hệ số" },
  { slug: "theo-gia-tri", status: "Theo dõi theo giá trị", label: "Theo giá trị" },
  { slug: "du", status: "Đủ", label: "Đủ" },
];

export function statusSlug(status: DtHdStatus): ScreenStatus | null {
  return SCREEN_STATUSES.find((s) => s.status === status)?.slug ?? null;
}

export function statusLabel(status: DtHdStatus): string {
  return SCREEN_STATUSES.find((s) => s.status === status)?.label ?? "";
}

export interface StatusCount {
  slug: ScreenStatus;
  label: string;
  count: number;
}

/** Số dòng theo tình trạng, theo thứ tự huy hiệu; tình trạng không có dòng nào bị ẩn. */
export function countStatuses(lines: readonly DtHdLineRow[]): StatusCount[] {
  return SCREEN_STATUSES.map(({ slug, status, label }) => ({ slug, label, count: lines.filter((l) => l.status === status).length })).filter(
    (c) => c.count > 0,
  );
}

// ---------------------------------------------------------------------------
// Dòng tóm tắt của khối đầu mối
// ---------------------------------------------------------------------------

/** Cột của bảng tóm tắt: mỗi cột là ĐÚNG một trường của khối, không tính lại. */
export const SUMMARY_COLUMNS = [
  { id: "valueDt", label: "Dự toán" },
  { id: "invoiceTotal", label: "HĐ do NCC xuất" },
  { id: "inOwnGroups", label: "Trong nhóm mình" },
  { id: "outsideDt", label: "Ngoài DT" },
  { id: "crossAssigned", label: "Ở nhóm khối khác" },
  { id: "actualExVat", label: "Thực tế chưa VAT" },
  { id: "remainingVsActual", label: "Còn phải lấy HĐ" },
] as const satisfies readonly { id: keyof DtHdBlock; label: string }[];

export type SummaryColumnId = (typeof SUMMARY_COLUMNS)[number]["id"];

export interface DtHdSummaryRow {
  key: DtHdBlockKey;
  name: string;
  values: Record<SummaryColumnId, number | null>;
  statuses: StatusCount[];
  lineCount: number;
  /** Dòng đối soát của khối, chỉ khi lệch (✗); khớp thì null — màn hình không hiện huy hiệu. */
  brokenTieOut: TieOut | null;
}

export const blockKey = (b: Pick<DtHdBlock, "counterpartyId">): DtHdBlockKey => b.counterpartyId ?? NONE_FILTER_VALUE;

export function summaryRow(b: DtHdBlock): DtHdSummaryRow {
  const lines = b.groups.flatMap((g) => g.lines);
  const values = Object.fromEntries(SUMMARY_COLUMNS.map((c) => [c.id, b[c.id]])) as Record<SummaryColumnId, number | null>;
  return { key: blockKey(b), name: b.name, values, statuses: countStatuses(lines), lineCount: lines.length, brokenTieOut: b.tieOut.ok ? null : b.tieOut };
}

/** Dòng "Cộng khối" của bản in: DT, HĐ trong các nhóm, Còn lại = DT − HĐ trong các nhóm. */
export function blockTotals(b: Pick<DtHdBlock, "valueDt" | "groupsHd">): { valueDt: number; groupsHd: number; balance: number } {
  return { valueDt: b.valueDt, groupsHd: b.groupsHd, balance: b.valueDt - b.groupsHd };
}

// ---------------------------------------------------------------------------
// Bộ lọc và dựng màn
// ---------------------------------------------------------------------------

export interface DtHdFilters {
  dauMoi?: DtHdBlockKey;
  loc?: DtHdLoc;
  /** Ô tìm (không lên URL): tên vật tư, mã / tên nhóm hoặc tên đầu mối, không dấu. */
  q?: string;
}

export const groupLabel = (g: Pick<DtHdGroupRow, "code" | "name">): string => (g.code ? `${g.code} — ${g.name}` : g.name);

export interface ScreenGroup {
  key: string;
  label: string;
  group: DtHdGroupRow;
  /** Đếm trên MỌI dòng của nhóm (không theo bộ lọc), như tổng của nhóm. */
  statuses: StatusCount[];
  /** Dòng hiện: mọi dòng, hoặc chỉ dòng khớp khi lọc theo tình trạng / tên. */
  lines: DtHdLineRow[];
}

export interface ScreenBlock {
  key: DtHdBlockKey;
  block: DtHdBlock;
  summary: DtHdSummaryRow;
  groups: ScreenGroup[];
  shownLines: number;
}

export interface DtHdScreenView {
  blocks: ScreenBlock[];
  /** Đang lọc (đầu mối, tình trạng hoặc tên) — khi đó khối khớp mở mặc định. */
  filtering: boolean;
  /** Lọc theo dòng (tình trạng / tên) — khi đó chỉ hiện nhóm và dòng khớp, nhóm mở mặc định. */
  linesFiltered: boolean;
  shownLines: number;
  totalLines: number;
}

export function buildScreenView(report: DtHdReport, f: DtHdFilters): DtHdScreenView {
  const q = normalizeRecordName(f.q ?? "");
  const linesFiltered = f.loc !== undefined || q !== "";
  const has = (text: string) => normalizeRecordName(text).includes(q);
  const blocks: ScreenBlock[] = [];
  let totalLines = 0;
  for (const b of report.blocks) {
    const key = blockKey(b);
    const summary = summaryRow(b);
    totalLines += summary.lineCount;
    if (f.dauMoi !== undefined && f.dauMoi !== key) continue;
    const groups = b.groups.map((g): ScreenGroup => {
      const label = groupLabel(g);
      const byName = q === "" || has(b.name) || has(label);
      const lines = g.lines.filter((l) => (f.loc === undefined || statusSlug(l.status) === f.loc) && (byName || has(l.itemName)));
      return { key: `${key}:${g.groupCodeId ?? NONE_FILTER_VALUE}`, label, group: g, statuses: countStatuses(g.lines), lines: linesFiltered ? lines : g.lines };
    });
    const shown = linesFiltered ? groups.filter((g) => g.lines.length > 0) : groups;
    const shownLines = shown.reduce((n, g) => n + g.lines.length, 0);
    if (linesFiltered && shownLines === 0) continue;
    blocks.push({ key, block: b, summary, groups: shown, shownLines });
  }
  return {
    blocks,
    filtering: f.dauMoi !== undefined || linesFiltered,
    linesFiltered,
    shownLines: blocks.reduce((n, b) => n + b.shownLines, 0),
    totalLines,
  };
}

/** Số dòng dự toán theo từng giá trị `loc` trên cả báo cáo (số trên chip lọc). */
export function locCounts(report: DtHdReport): Record<DtHdLoc, number> {
  const lines = report.blocks.flatMap((b) => b.groups.flatMap((g) => g.lines));
  const count = (loc: DtHdLoc) => lines.filter((l) => statusSlug(l.status) === loc).length;
  return { "con-thieu": count("con-thieu"), vuot: count("vuot"), "chua-co-hd": count("chua-co-hd"), "thieu-he-so": count("thieu-he-so") };
}

// ---------------------------------------------------------------------------
// Khối đang mở (tham số `mo`)
// ---------------------------------------------------------------------------

/** Khối đang mở: `mo` nếu URL có; không có thì đang lọc → mọi khối khớp, không lọc → không khối nào. */
export function openBlockKeys(mo: readonly DtHdBlockKey[] | undefined, view: Pick<DtHdScreenView, "blocks" | "filtering">): DtHdBlockKey[] {
  if (mo) return [...mo];
  return view.filtering ? view.blocks.map((b) => b.key) : [];
}

/**
 * `mo` mới sau khi bấm mở / đóng một khối: đổi trạng thái khối đó trên tập đang mở, giữ tối đa 30 khối
 * mở sau cùng. Không lọc mà đóng hết → bỏ tham số; đang lọc mà đóng hết → `[]` (`mo=`), để các khối khớp
 * không tự mở lại.
 */
export function toggleBlock(mo: readonly DtHdBlockKey[] | undefined, view: Pick<DtHdScreenView, "blocks" | "filtering">, key: DtHdBlockKey): DtHdBlockKey[] | undefined {
  const current = openBlockKeys(mo, view);
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  if (next.length === 0 && !view.filtering) return undefined;
  return next.slice(-DT_HD_OPEN_MAX);
}

// ---------------------------------------------------------------------------
// Dòng hóa đơn "↳" và Phần B
// ---------------------------------------------------------------------------

/**
 * Phần B tách hai danh sách theo `outsideReason` của engine (cùng quy tắc `effectiveAliasStatus` của Ánh
 * xạ): "Chưa gán" và "Ngoài DT". Thứ tự giữ như báo cáo (NCC rồi dòng). Không có tổng riêng: tổng duy
 * nhất là `partBTotal` của báo cáo.
 */
export function splitPartB(report: Pick<DtHdReport, "partB">): { chuaGan: DtHdInvoiceRow[]; ngoaiDt: DtHdInvoiceRow[] } {
  const lines = report.partB.flatMap((s) => s.lines);
  return { chuaGan: lines.filter((l) => l.outsideReason !== "ngoai_dt"), ngoaiDt: lines.filter((l) => l.outsideReason === "ngoai_dt") };
}

const qtyText = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

/** Chữ của dòng HĐ, cùng cách viết với bản in: "↳ NCC · HĐ số · tên (SL × hệ số / thiếu hệ số)". */
export function invoiceText(i: Pick<DtHdInvoiceRow, "supplierName" | "invoiceNo" | "itemName" | "qty" | "factor">): string {
  const conv =
    i.qty === null ? "" : i.factor === null ? ` (SL ${qtyText.format(i.qty)}, thiếu hệ số)` : i.factor === 1 ? "" : ` (SL ${qtyText.format(i.qty)} × ${qtyText.format(i.factor)})`;
  return `↳ ${i.supplierName} · HĐ ${i.invoiceNo || "—"} · ${i.itemName}${conv}`;
}
