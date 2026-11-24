/**
 * Mô hình màn hình HĐ-TT (chỉ màn hình — bản in `HdTtView` và sheet Excel giữ `HD_TT_MONEY_COLS`, không sửa):
 *   - nhãn dễ đọc của 13 cột tiền, giữ chữ cái của file làm mã nhỏ ("HĐ gồm VAT · E"), công thức trong tooltip;
 *   - 4 nhóm cột phủ đủ 13 cột: Hóa đơn | Thanh toán | Thực tế | Lấy về;
 *   - dòng màn hình = dòng báo cáo + vị trí trong đầu mối (`siblingIndex` / `siblingCount`) và đầu mối đã chốt
 *     thực tế chưa (`counterpartySettled`), xếp nhóm theo đầu mối, lọc theo `loc` bằng `HD_TT_LOC_PREDICATES`;
 *   - quy tắc S: S chỉ giữ Σ T khớp khi là NCC SAU của đầu mối nhiều NCC đã chốt thực tế (hd-tt-report.ts: S
 *     đè mọi quy tắc, NCC đầu nhận phần còn lại, đầu mối một NCC lấy thực tế đầu mối, chưa chốt → tạm = HĐ).
 *     Chặn ở giao diện; action lưu không đổi nên S đã nhập (vd. import) vẫn sửa được ở Đầu mối.
 * Phần nhập ô (bản vá, nháp, quyền sửa) ở hd-tt-edit-model.ts, xuất lại ở đây. Module thuần, an toàn cho bundle client.
 */

import type { HdTtReport, HdTtRow } from "./hd-tt-report";
import { HD_TT_LOC_PREDICATES, type HdTtLoc } from "./overview-todos";
import type { TieOut } from "./report-inputs";

export * from "./hd-tt-edit-model";

// ---------------------------------------------------------------------------
// Cột tiền và nhóm cột
// ---------------------------------------------------------------------------

export type HdTtMoneyKey = keyof HdTtReport["totals"];

export interface HdTtColumnLabel {
  label: string;
  /** Chữ cái cột của file đội (E, G, I…); null với hai cột tách HĐ. */
  code: string | null;
  /** Công thức / nguồn số, hiện trong tooltip của đầu cột. */
  tip: string;
}

/** Nhãn màn hình của 13 cột tiền — riêng với `HD_TT_MONEY_COLS` (đầu cột Excel, không sửa). */
export const HD_TT_SCREEN_LABELS: Record<HdTtMoneyKey, HdTtColumnLabel> = {
  invoiceExVat: { label: "HĐ chưa VAT", code: null, tip: "Σ tiền hàng các hóa đơn của NCC" },
  invoiceVat: { label: "VAT", code: null, tip: "Σ thuế VAT các hóa đơn của NCC" },
  invoiceTotal: { label: "HĐ gồm VAT", code: "E", tip: "E = HĐ chưa VAT + VAT — bấm số để xem các hóa đơn" },
  paidBook: { label: "Đã trả theo sổ chi", code: "G", tip: "G = Σ chi thực tế (ngân hàng + tiền mặt) của NCC — bấm số để xem sổ chi" },
  paid: { label: "Đã trả", code: "I", tip: "I = H (thực nộp rà soát) nếu đã nhập, chưa thì G" },
  toPay: { label: "Cần nộp thêm", code: "J", tip: "J = max(0, E − I)" },
  overpaid: { label: "Đã nộp vượt", code: "K", tip: "K = max(0, I − E)" },
  actual: {
    label: "Thực tế", code: "T",
    tip: "T = S nếu đã nhập tách; đầu mối nhiều NCC: NCC đầu nhận phần còn lại, NCC sau = S hoặc E; đầu mối một NCC: thực tế đầu mối; đầu mối chưa chốt: tạm = E; NCC không thuộc đầu mối: 0",
  },
  actualMinusInvoice: { label: "Thực tế − HĐ", code: "U", tip: "U = T − E; dương là còn phải lấy thêm HĐ" },
  debt: { label: "Nợ thực tế", code: "V", tip: "V = T − I" },
  toRecover: { label: "Sẽ lấy về", code: "W", tip: "W = max(0, J − V)" },
  recovered: { label: "Đã lấy về", code: "X", tip: "X nhập tay" },
  stillToRecover: { label: "Còn phải lấy về", code: "Y", tip: "Y = W − X" },
};

export interface HdTtColumnGroup {
  id: "hoa-don" | "thanh-toan" | "thuc-te" | "lay-ve";
  label: string;
  keys: readonly HdTtMoneyKey[];
}

/** Bốn nhóm cột, theo thứ tự cột của file; mỗi cột tiền thuộc đúng một nhóm. */
export const HD_TT_COLUMN_GROUPS: readonly HdTtColumnGroup[] = [
  { id: "hoa-don", label: "Hóa đơn", keys: ["invoiceExVat", "invoiceVat", "invoiceTotal"] },
  { id: "thanh-toan", label: "Thanh toán", keys: ["paidBook", "paid", "toPay", "overpaid"] },
  { id: "thuc-te", label: "Thực tế", keys: ["actual", "actualMinusInvoice", "debt"] },
  { id: "lay-ve", label: "Lấy về", keys: ["toRecover", "recovered", "stillToRecover"] },
];

/** Chế độ nhập thêm cột ô nhập H ngay trước I và S ngay trước T; X và Z nhập ngay trong cột của chúng. */
export const EDIT_COLUMN_BEFORE: Partial<Record<HdTtMoneyKey, "H" | "S">> = { paid: "H", actual: "S" };

// ---------------------------------------------------------------------------
// Dòng màn hình, nhóm theo đầu mối, lọc
// ---------------------------------------------------------------------------

export interface HdTtScreenRow extends HdTtRow {
  /** Vị trí NCC trong đầu mối theo thứ tự báo cáo (0 = NCC đầu, nhận phần còn lại). */
  siblingIndex: number;
  /** Số NCC của đầu mối; 0 khi NCC không thuộc đầu mối nào. */
  siblingCount: number;
  /** Đầu mối đã chốt thực tế (thực tế đầu mối khác null). */
  counterpartySettled: boolean;
}

/** Dòng màn hình từ dòng báo cáo: NCC cùng đầu mối nằm liền nhau, NCC đầu mang thực tế của đầu mối. */
export function buildScreenRows(rows: readonly HdTtRow[]): HdTtScreenRow[] {
  const siblings = new Map<number, HdTtRow[]>();
  for (const r of rows) if (r.counterpartyId !== null) siblings.set(r.counterpartyId, [...(siblings.get(r.counterpartyId) ?? []), r]);
  return rows.map((r) => {
    const group = r.counterpartyId === null ? [] : siblings.get(r.counterpartyId) ?? [];
    return {
      ...r,
      siblingIndex: Math.max(0, group.indexOf(r)),
      siblingCount: group.length,
      counterpartySettled: group.length > 0 && group[0].counterpartyActual !== null,
    };
  });
}

/** Khóa nhóm: id đầu mối, hoặc `none` = "Không thuộc đầu mối nào". */
export type HdTtGroupKey = number | "none";

export interface HdTtScreenGroup {
  key: HdTtGroupKey;
  name: string;
  rows: HdTtScreenRow[];
}

export const NO_COUNTERPARTY_LABEL = "Không thuộc đầu mối nào";

/** Nhóm theo đầu mối, giữ thứ tự báo cáo (NCC không thuộc đầu mối xếp cuối như báo cáo). */
export function groupByCounterparty(rows: readonly HdTtScreenRow[]): HdTtScreenGroup[] {
  const groups = new Map<HdTtGroupKey, HdTtScreenGroup>();
  for (const r of rows) {
    const key: HdTtGroupKey = r.counterpartyId ?? "none";
    const g = groups.get(key) ?? { key, name: r.counterpartyName ?? NO_COUNTERPARTY_LABEL, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  return [...groups.values()];
}

export interface HdTtScreenView {
  groups: HdTtScreenGroup[];
  shown: number;
  total: number;
  filtering: boolean;
}

/** Dòng hiện theo `loc` (cùng vị từ với số đếm của Tổng quan), nhóm theo đầu mối. */
export function buildHdTtView(rows: readonly HdTtScreenRow[], loc: HdTtLoc | undefined): HdTtScreenView {
  const shown = loc === undefined ? [...rows] : rows.filter(HD_TT_LOC_PREDICATES[loc]);
  return { groups: groupByCounterparty(shown), shown: shown.length, total: rows.length, filtering: loc !== undefined };
}

export function hdTtLocCounts(rows: readonly HdTtRow[]): Record<HdTtLoc, number> {
  const count = (loc: HdTtLoc) => rows.filter(HD_TT_LOC_PREDICATES[loc]).length;
  return { "con-phai-lay-hd": count("con-phai-lay-hd"), "con-phai-lay-ve": count("con-phai-lay-ve"), "co-viec": count("co-viec") };
}

// ---------------------------------------------------------------------------
// Quy tắc S
// ---------------------------------------------------------------------------

export type SplitBlock = "no-counterparty" | "single" | "first" | "unsettled";

/** Lý do ô S bị khóa (title của ô). */
export const SPLIT_BLOCK_TITLES: Record<SplitBlock, string> = {
  "no-counterparty": "Gắn NCC vào đầu mối trước",
  single: "Đầu mối chỉ có một NCC",
  first: "NCC đầu tiên nhận phần còn lại — nhập S ở NCC sau",
  unsettled: "Đầu mối chưa chốt thực tế",
};

type SplitFacts = Pick<HdTtScreenRow, "counterpartyId" | "siblingIndex" | "siblingCount" | "counterpartySettled">;

/** Vì sao nhập S ở dòng này làm Σ T lệch; null = nhập được. */
export function splitBlock(row: SplitFacts): SplitBlock | null {
  if (row.counterpartyId === null || row.siblingCount === 0) return "no-counterparty";
  if (row.siblingCount === 1) return "single";
  if (row.siblingIndex === 0) return "first";
  if (!row.counterpartySettled) return "unsettled";
  return null;
}

/** S nhập được: NCC sau của đầu mối nhiều NCC đã chốt thực tế. */
export const canTypeSplit = (row: SplitFacts): boolean => splitBlock(row) === null;

/** Dòng đang lưu S ngoài quy tắc (vd. số import) — nguyên nhân Σ T ✗ mà dòng kiểm phải chỉ ra. */
export function splitBlockers(rows: readonly HdTtScreenRow[]): HdTtScreenRow[] {
  return rows.filter((r) => r.split !== null && !canTypeSplit(r));
}

/** Dòng kiểm Σ T của báo cáo HĐ-TT (dòng kiểm còn lại là Σ E). */
export const isActualCheck = (t: TieOut): boolean => t.label.startsWith("Σ T");
