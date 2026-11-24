/**
 * Mô hình trang Tổng quan của Đối chiếu DT-HĐ-TT (cho lãnh đạo / chỉ huy), dựng thuần từ ba báo cáo,
 * bảng Ánh xạ và các dòng NCC. Mọi con số là ĐỌC THẲNG một ô có sẵn của báo cáo — không có tổng mới:
 *   - Phần III dòng Gxd (sau thuế): dự toán, thực tế, chênh = `phanIIIDiff` (cùng phép tính bản in);
 *   - HĐ-TT dòng TỔNG CỘNG (gồm VAT): Σ E, Σ T, Σ U, Σ I, Σ V, Σ Y;
 *   - đầu mối vượt dự toán: dòng Phần II A và B có chênh < 0 (khối C không có dự toán nên không xét);
 *   - kiểm tổng: các dòng đối soát sẵn có của ba báo cáo.
 * Hai số "thực tế" khác tập dòng (Phần III gồm mọi đầu mối; Σ T chỉ NCC có HĐ) nên mang nhãn khác nhau;
 * Σ U bù trừ giữa các NCC nên nhãn nói rõ. Cuối file là thẻ "Thực tế" của Dashboard công trình dùng sổ
 * (`bookActualCard`), đọc cùng ô Phần III. Module thuần, an toàn cho bundle client.
 */

import { formatVND } from "@/lib/utils/format";
import type { AliasBoard } from "./alias-board";
import type { PhanIIRow } from "./dt-tt-report";
import {
  buildOverviewTodos, hdTtLocQuery, UNSETTLED_LINK, unsettledCounterparties, type OverviewTodo, type ScreenLink, type SupplierLinkRow,
} from "./overview-todos";
import type { PhanIIIRow } from "./phan-iii";
import type { TieOut } from "./report-inputs";
import type { DtHdTtReports } from "./reports";

// ---------------------------------------------------------------------------
// Số chính
// ---------------------------------------------------------------------------

export type FigureId = "gxd-estimate" | "gxd-actual" | "gxd-diff" | "sigma-e" | "sigma-t" | "sigma-u" | "sigma-i" | "sigma-v" | "sigma-y";

/** Thứ tự hiện của các số chính. */
export const FIGURE_IDS: readonly FigureId[] = ["gxd-estimate", "gxd-actual", "gxd-diff", "sigma-e", "sigma-t", "sigma-u", "sigma-i", "sigma-v", "sigma-y"];

export interface OverviewFigure {
  id: FigureId;
  label: string;
  /** Ô báo cáo mà số này đọc ra và cơ sở VAT của nó. */
  basis: string;
  /** null chỉ khi ô báo cáo để trống (vd. chênh của dòng chưa có thực tế). */
  value: number | null;
  link: ScreenLink;
}

const PHAN_III_BASIS = "DT-TT Phần III, dòng Gxd · sau thuế";
const HD_TT_BASIS = "HĐ-TT, dòng TỔNG CỘNG · gồm VAT";
const PHAN_III_LINK: ScreenLink = { target: "dt-tt", params: { hash: "phan-iii" } };
const HD_TT_LINK: ScreenLink = { target: "hd-tt" };

/** Chênh DT − TT của một dòng Phần III, đúng như bản in tính ngay trong ô (`dt-tt-view.tsx`): thực tế null → trống. */
export function phanIIIDiff(row: Pick<PhanIIIRow, "estimate" | "actual">): number | null {
  return row.actual === null ? null : row.estimate - row.actual;
}

/** Dòng "CHI PHÍ XÂY DỰNG SAU THUẾ (Gxd)" của Phần III. */
export function phanIIITotalRow(reports: Pick<DtHdTtReports, "phanIII">): PhanIIIRow {
  const row = reports.phanIII.rows.find((r) => r.key === "total");
  if (!row) throw new Error("Phần III không có dòng Gxd");
  return row;
}

/** Ba số dự toán – thực tế của dòng Gxd (Tổng quan, và thẻ "Thực tế" của Dashboard qua `bookActualCard`). */
export function selectBudgetHeadline(reports: Pick<DtHdTtReports, "phanIII">): { estimate: OverviewFigure; actual: OverviewFigure; diff: OverviewFigure } {
  const total = phanIIITotalRow(reports);
  return {
    estimate: { id: "gxd-estimate", label: "Dự toán (Gxd, sau thuế)", basis: PHAN_III_BASIS, value: total.estimate, link: PHAN_III_LINK },
    actual: { id: "gxd-actual", label: "Thực tế toàn công trình (Phần III)", basis: PHAN_III_BASIS, value: total.actual, link: PHAN_III_LINK },
    diff: { id: "gxd-diff", label: "Chênh DT − TT", basis: `${PHAN_III_BASIS} · dương là tiết kiệm`, value: phanIIIDiff(total), link: PHAN_III_LINK },
  };
}

function hdTtFigures(reports: Pick<DtHdTtReports, "hdTt">): OverviewFigure[] {
  const t = reports.hdTt.totals;
  const fig = (id: FigureId, label: string, value: number, link: ScreenLink = HD_TT_LINK, basis = HD_TT_BASIS): OverviewFigure => ({ id, label, basis, value, link });
  return [
    fig("sigma-e", "Hóa đơn gồm VAT (Σ E)", t.invoiceTotal),
    fig("sigma-t", "Thực tế các NCC có HĐ (HĐ-TT Σ T)", t.actual),
    fig(
      "sigma-u", "Còn phải lấy HĐ: Σ T − Σ E, bù trừ giữa các NCC", t.actualMinusInvoice,
      { target: "hd-tt", params: { query: hdTtLocQuery("con-phai-lay-hd") } }, `${HD_TT_BASIS} · bấm để xem NCC có U > 0`,
    ),
    fig("sigma-i", "Đã trả (Σ I)", t.paid),
    fig("sigma-v", "Nợ thực tế (Σ V)", t.debt),
    fig("sigma-y", "Còn phải lấy về (Σ Y)", t.stillToRecover, { target: "hd-tt", params: { query: hdTtLocQuery("con-phai-lay-ve") } }),
  ];
}

// ---------------------------------------------------------------------------
// Đầu mối cần chú ý
// ---------------------------------------------------------------------------

/** Hiện 5 dòng, "xem thêm" tới 10. */
export const OVER_BUDGET_SHOWN = 5;
export const OVER_BUDGET_MAX = 10;

export interface OverBudgetRow extends PhanIIRow {
  actual: number;
  diff: number;
  link: ScreenLink;
}

export interface OverBudget {
  /** Tối đa `OVER_BUDGET_MAX` dòng, vượt nhiều nhất trước. */
  rows: OverBudgetRow[];
  /** Số dòng A + B đang vượt (có thể nhiều hơn số dòng hiện). */
  count: number;
  /** Số đầu mối chưa chốt thực tế (Phần II A, B, C). */
  unsettled: number;
  unsettledLink: ScreenLink;
  /** Toàn bộ Phần II. */
  allLink: ScreenLink;
}

const isOver = (r: PhanIIRow): r is PhanIIRow & { actual: number; diff: number } => r.actual !== null && r.diff !== null && r.diff < 0;

export function selectOverBudget(reports: Pick<DtHdTtReports, "dtTt">): OverBudget {
  const { a, b } = reports.dtTt.phanII;
  // sort ổn định: chênh bằng nhau giữ thứ tự báo cáo (A trước B).
  const over = [...a, ...b].filter(isOver).sort((x, y) => x.diff - y.diff);
  return {
    rows: over.slice(0, OVER_BUDGET_MAX).map((r) => ({ ...r, link: { target: "dt-tt", params: { hash: `dm-${r.counterpartyId}` } } })),
    count: over.length,
    unsettled: unsettledCounterparties(reports).length,
    unsettledLink: UNSETTLED_LINK,
    allLink: { target: "dt-tt", params: { hash: "phan-ii" } },
  };
}

// ---------------------------------------------------------------------------
// Kiểm tổng
// ---------------------------------------------------------------------------

export type CheckGroup = "DT-HĐ" | "DT-TT" | "HĐ-TT";

export interface OverviewCheck {
  group: CheckGroup;
  /** Khối / đầu mối của dòng đối soát (các khối DT-HĐ cùng một nhãn). */
  scope: string | null;
  check: TieOut;
  /** Nơi xem / sửa khi lệch. */
  fix: ScreenLink;
}

/** Mọi dòng đối soát của ba báo cáo: khối DT-HĐ + kiểm tổng DT-HĐ, Phần I DT-TT, HĐ-TT. */
export function collectChecks(reports: Pick<DtHdTtReports, "dtHd" | "dtTt" | "hdTt">): OverviewCheck[] {
  const dtHdBlock = (counterpartyId: number | null): ScreenLink => ({
    target: "dt-hd",
    params: { query: new URLSearchParams({ dauMoi: counterpartyId === null ? "none" : String(counterpartyId) }).toString() },
  });
  return [
    ...reports.dtHd.blocks.map((b): OverviewCheck => ({ group: "DT-HĐ", scope: b.name, check: b.tieOut, fix: dtHdBlock(b.counterpartyId) })),
    { group: "DT-HĐ", scope: null, check: reports.dtHd.grandCheck, fix: { target: "dt-hd" } },
    ...reports.dtTt.checks.map((c): OverviewCheck => ({ group: "DT-TT", scope: null, check: c, fix: { target: "dt-tt", params: { hash: "phan-i" } } })),
    ...reports.hdTt.checks.map((c): OverviewCheck => ({ group: "HĐ-TT", scope: null, check: c, fix: HD_TT_LINK })),
  ];
}

// ---------------------------------------------------------------------------
// Cả trang
// ---------------------------------------------------------------------------

export interface Overview {
  figures: Record<FigureId, OverviewFigure>;
  overBudget: OverBudget;
  todos: OverviewTodo[];
  checks: OverviewCheck[];
}

/**
 * Mô hình trang Tổng quan. `links` là các dòng NCC của công trình (`listCounterparties`), dùng cho hai việc
 * về NCC chưa thuộc đầu mối / chưa có dòng.
 */
export function buildOverview(reports: DtHdTtReports, board: AliasBoard, links: readonly SupplierLinkRow[]): Overview {
  const headline = selectBudgetHeadline(reports);
  const list = [headline.estimate, headline.actual, headline.diff, ...hdTtFigures(reports)];
  return {
    figures: Object.fromEntries(list.map((f) => [f.id, f])) as Record<FigureId, OverviewFigure>,
    overBudget: selectOverBudget(reports),
    todos: buildOverviewTodos(reports, board, links),
    checks: collectChecks(reports),
  };
}

// ---------------------------------------------------------------------------
// Thẻ "Thực tế" của Dashboard công trình (công trình dùng sổ)
// ---------------------------------------------------------------------------

export const BOOK_ACTUAL_LABEL = "Thực tế (sổ DT-HĐ-TT)";

/** Trang Tổng quan: trang index của tab Đối chiếu DT-HĐ-TT (mọi màn của tab nằm dưới đường dẫn này). */
export const tongQuanPath = (projectId: number): string => `/du-an/${projectId}/dt-hd-tt`;

export type BookActualTone = "danger" | "warning" | "success";

export interface BookActualCard {
  label: string;
  /** Phần III dòng Gxd, cột thực tế — đúng ô mà Tổng quan hiện ở số "gxd-actual". */
  actual: number | null;
  value: string;
  /** "Gxd … · Chênh DT − TT …", thêm "thực tế chưa đủ" khi số của sổ còn thiếu. */
  sub: string;
  tone: BookActualTone;
  /**
   * Thực tế của sổ chưa đủ: Phần II A và B đều trống, có thực tế nhập chưa gắn đầu mối, hoặc có đầu mối chưa
   * chốt. Các trường hợp này chỉ làm thực tế THIẾU (không bao giờ thừa).
   */
  incomplete: boolean;
}

/** Tiền trên thẻ Dashboard: làm tròn đồng như ô báo cáo, định dạng như các thẻ khác của Dashboard. */
const cardMoney = (v: number | null): string => formatVND(v === null ? null : Math.round(v));

/**
 * Thẻ "Thực tế" của Dashboard trên công trình dùng sổ: số là thực tế Phần III dòng Gxd, dòng phụ là dự toán
 * Gxd và chênh (`phanIIIDiff`) — ba số của `selectBudgetHeadline`, cùng ô với Tổng quan. Sắc thái theo thứ tự:
 *   1. danger khi chênh < 0: thực tế thiếu chỉ làm chênh lớn lên, nên chênh âm là thật;
 *   2. warning khi thực tế chưa đủ — Phần II A và B đều trống, thực tế nhập chưa gắn đầu mối ≠ 0 (so sau khi
 *      làm tròn đồng, như bản in), hoặc có dòng Phần II thực tế null (cùng định nghĩa "chưa chốt" của Tổng quan);
 *   3. success.
 * Khi vừa danger vừa chưa đủ, dòng phụ vẫn mang "thực tế chưa đủ".
 */
export function bookActualCard(reports: Pick<DtHdTtReports, "phanIII" | "dtTt">): BookActualCard {
  const { estimate, actual, diff } = selectBudgetHeadline(reports);
  const { a, b } = reports.dtTt.phanII;
  const incomplete =
    actual.value === null
    || (a.length === 0 && b.length === 0)
    || Math.round(reports.dtTt.untaggedReceipts) !== 0
    || unsettledCounterparties(reports).length > 0;
  const tone: BookActualTone = diff.value !== null && Math.round(diff.value) < 0 ? "danger" : incomplete ? "warning" : "success";
  return {
    label: BOOK_ACTUAL_LABEL,
    actual: actual.value,
    value: cardMoney(actual.value),
    sub: `Gxd ${cardMoney(estimate.value)} · Chênh DT − TT ${cardMoney(diff.value)}${incomplete ? " · thực tế chưa đủ" : ""}`,
    tone,
    incomplete,
  };
}
