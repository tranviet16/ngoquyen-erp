/**
 * Hợp đồng URL của các màn sửa việc trong Đối chiếu DT-HĐ-TT: tên tham số, builder (link) và parser
 * (đọc lại) của từng màn, cộng `screenHref` cho Tổng quan. Builder và parser của một màn luôn đi cặp:
 * dựng rồi đọc lại ra đúng đầu vào; giá trị lạ bị bỏ. Phase sau thêm màn của mình vào đây.
 *
 *   hoa-don       filter.supplierId=id · filter.invoiceNo=chữ · filter.mapping=chưa gán
 *   thuc-te-nhap  filter.counterpartyId=id|none · filter.mapping=chưa gán · filter.itemName=chữ
 *   chi-thuc-te   filter.supplierId=id|none · filter.counterpartyId=id|none · filter.content=chữ
 *   dau-moi       lưới đầu mối: filter.actual=chua-chot · filter.name=chữ
 *                 lưới NCC: filter.counterpartyId=0 (không thuộc đầu mối) · filter.supplierName=chữ
 *                 neo #ncc, #ncc-chua-co-dong
 *   anh-xa        tab=dt|hd|tt · status=chua_gan|de_xuat|xac_nhan|ngoai_dt|thieu_he_so · q (≤100 ký tự) · key
 *   du-toan       loai=thieu
 *   dt-hd         mo=id,…|none (≤30 khối mở) · dauMoi=id|none · loc=con-thieu|vuot|chua-co-hd|thieu-he-so · hd=1
 *   hd-tt         loc=con-phai-lay-hd|con-phai-lay-ve|co-viec
 *   dt-tt         neo #phan-i, #phan-ii, #phan-iii, #dm-{id đầu mối}
 *
 * Module thuần, an toàn cho bundle client (không Prisma, không module server).
 */

import { kindOfCategoryCode } from "./cost-kind";
import { gridQuery, gridUrlCodec, gridUrlSpec, mergeGridUrlSpecs, NONE_FILTER_VALUE } from "./grid-url-codec";
import { ALIAS_SOURCES, type AliasSource } from "./register-ui";

export { canonicalJson, gridUrlSpec, NONE_FILTER_VALUE } from "./grid-url-codec";

// ---------------------------------------------------------------------------
// Đích của link
// ---------------------------------------------------------------------------

export type ScreenTarget =
  | "hoa-don" | "thuc-te-nhap" | "chi-thuc-te" | "dau-moi" | "anh-xa" | "du-toan"
  | "dt-hd" | "dt-tt" | "hd-tt" | "cai-dat";

/** Màn đã nhận bộ lọc / neo từ URL. Link tới màn chưa sẵn sàng mở trang trần (không tham số, không neo). */
export const READY_TARGETS: readonly ScreenTarget[] = ["hoa-don", "thuc-te-nhap", "chi-thuc-te", "dau-moi", "anh-xa", "du-toan", "dt-hd", "hd-tt", "dt-tt"];

/** Màn nằm ngoài nhóm DT-HĐ-TT (tab của công trình). */
const PROJECT_TABS: readonly ScreenTarget[] = ["du-toan", "cai-dat"];

export function screenPath(projectId: number, target: ScreenTarget): string {
  return PROJECT_TABS.includes(target) ? `/du-an/${projectId}/${target}` : `/du-an/${projectId}/dt-hd-tt/${target}`;
}

export interface ScreenLinkParams {
  /** Chuỗi query của builder màn đó (không có "?"). */
  query?: string;
  /** Neo trong trang (không có "#"). */
  hash?: string;
}

export function screenHref(projectId: number, target: ScreenTarget, params: ScreenLinkParams = {}): string {
  const path = screenPath(projectId, target);
  if (!READY_TARGETS.includes(target)) return path;
  return `${path}${params.query ? `?${params.query}` : ""}${params.hash ? `#${params.hash}` : ""}`;
}

// ---------------------------------------------------------------------------
// Sổ nhập liệu (DataGrid): codec `filter.<cột>` của lib/table
// ---------------------------------------------------------------------------

/** Giá trị cột "Ánh xạ" của dòng chưa có alias; bộ lọc chữ trên cột đó = "chưa gán". */
export const UNMAPPED_TEXT = "chưa gán";
/** Đầu mối chưa chốt thực tế (thực tế báo cáo null) trên lưới Đầu mối. */
export const UNSETTLED_ACTUAL = "chua-chot";
/** NCC không thuộc đầu mối nào: lựa chọn id 0 của cột Đầu mối ở lưới NCC. */
export const NO_COUNTERPARTY = "0";
export const DAU_MOI_ANCHORS = { ncc: "ncc", nccWithoutRow: "ncc-chua-co-dong" } as const;
/** Các giá trị lọc đặc biệt của hợp đồng (khác id / chữ thường). */
export const SPECIAL_FILTER_VALUES: readonly string[] = [NONE_FILTER_VALUE, UNMAPPED_TEXT, UNSETTLED_ACTUAL, NO_COUNTERPARTY];

export const HOA_DON_GRID_SPEC = gridUrlSpec(
  [{ id: "supplierId", kind: "select" }, { id: "invoiceNo", kind: "text" }, { id: "mapping", kind: "text" }],
  ["supplierId", "invoiceNo", "mapping"],
);
export const THUC_TE_NHAP_GRID_SPEC = gridUrlSpec(
  [{ id: "counterpartyId", kind: "select" }, { id: "mapping", kind: "text" }, { id: "itemName", kind: "text" }],
  ["counterpartyId", "mapping", "itemName"],
);
export const CHI_THUC_TE_GRID_SPEC = gridUrlSpec(
  [{ id: "supplierId", kind: "select" }, { id: "counterpartyId", kind: "select" }, { id: "content", kind: "text" }],
  ["supplierId", "counterpartyId", "content"],
);
/** Lưới đầu mối: cột "Thực tế" là cột tiền, nhưng lọc theo "chưa chốt" (equals qua `filterAccessor`). */
export const DAU_MOI_COUNTERPARTY_GRID_SPEC = gridUrlSpec(
  [{ id: "name", kind: "text" }, { id: "actual", kind: "currency" }],
  ["name", "actual"],
  { actual: { kind: "equals", options: [UNSETTLED_ACTUAL] } },
);
export const DAU_MOI_SUPPLIER_GRID_SPEC = gridUrlSpec(
  [{ id: "supplierName", kind: "text" }, { id: "counterpartyId", kind: "select" }],
  ["supplierName", "counterpartyId"],
);
/** Cả trang Đầu mối: hai lưới đồng bộ hai tập cột rời nhau (cột chung như `note` không đồng bộ). */
export const DAU_MOI_PAGE_SPEC = mergeGridUrlSpecs(DAU_MOI_COUNTERPARTY_GRID_SPEC, DAU_MOI_SUPPLIER_GRID_SPEC);

/** Codec URL của từng lưới: trang server đọc lần đầu và client đọc / ghi bằng cùng một hàm. */
export const HOA_DON_URL = gridUrlCodec(HOA_DON_GRID_SPEC);
export const THUC_TE_NHAP_URL = gridUrlCodec(THUC_TE_NHAP_GRID_SPEC);
export const CHI_THUC_TE_URL = gridUrlCodec(CHI_THUC_TE_GRID_SPEC);
export const DAU_MOI_COUNTERPARTY_URL = gridUrlCodec(DAU_MOI_PAGE_SPEC, Object.keys(DAU_MOI_COUNTERPARTY_GRID_SPEC.filterable));
export const DAU_MOI_SUPPLIER_URL = gridUrlCodec(DAU_MOI_PAGE_SPEC, Object.keys(DAU_MOI_SUPPLIER_GRID_SPEC.filterable));

type IdOrNone = number | typeof NONE_FILTER_VALUE;

export const hoaDonQuery = (f: { supplierId?: number; invoiceNo?: string; mapping?: typeof UNMAPPED_TEXT }) =>
  gridQuery(HOA_DON_GRID_SPEC, f);
export const thucTeNhapQuery = (f: { counterpartyId?: IdOrNone; mapping?: typeof UNMAPPED_TEXT; itemName?: string }) =>
  gridQuery(THUC_TE_NHAP_GRID_SPEC, f);
export const chiThucTeQuery = (f: { supplierId?: IdOrNone; counterpartyId?: IdOrNone; content?: string }) =>
  gridQuery(CHI_THUC_TE_GRID_SPEC, f);
export const dauMoiQuery = (f: { actual?: typeof UNSETTLED_ACTUAL; name?: string; counterpartyId?: number; supplierName?: string }) =>
  gridQuery(DAU_MOI_PAGE_SPEC, f);

// ---------------------------------------------------------------------------
// Ánh xạ: tab / status / q / key (tham số riêng, không qua codec lưới)
// ---------------------------------------------------------------------------

export const ANH_XA_STATUSES = ["chua_gan", "de_xuat", "xac_nhan", "ngoai_dt", "thieu_he_so"] as const;
export type AnhXaStatus = (typeof ANH_XA_STATUSES)[number];
/** Ô tìm của Ánh xạ giữ tối đa 100 ký tự trên URL. */
export const ANH_XA_QUERY_MAX = 100;
const ANH_XA_PARAMS = ["tab", "status", "q", "key"] as const;

export interface AnhXaParams {
  tab?: AliasSource;
  /** Không có = "Tất cả". */
  status?: AnhXaStatus;
  q?: string;
  /** Khóa tên|ĐVT chính xác: lọc đúng khóa đó và mở ô gán của nó. */
  key?: string;
}

const isSource = (v: string | null | undefined): v is AliasSource => (ALIAS_SOURCES as readonly string[]).includes(v ?? "");
const isAnhXaStatus = (v: string | null | undefined): v is AnhXaStatus => (ANH_XA_STATUSES as readonly string[]).includes(v ?? "");

/** Cắt theo điểm mã (không cắt đôi cặp surrogate). */
export function cutAnhXaQuery(q: string): string {
  const chars = Array.from(q);
  return chars.length > ANH_XA_QUERY_MAX ? chars.slice(0, ANH_XA_QUERY_MAX).join("") : q;
}

function setAnhXaParams(params: URLSearchParams, p: AnhXaParams): URLSearchParams {
  if (isSource(p.tab)) params.set("tab", p.tab);
  if (isAnhXaStatus(p.status)) params.set("status", p.status);
  if (p.q) params.set("q", cutAnhXaQuery(p.q));
  if (p.key) params.set("key", p.key);
  return params;
}

export function anhXaQuery(p: AnhXaParams): string {
  return setAnhXaParams(new URLSearchParams(), p).toString();
}

export function parseAnhXaQuery(search: string | URLSearchParams): AnhXaParams {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const out: AnhXaParams = {};
  const tab = params.get("tab");
  const status = params.get("status");
  const q = params.get("q");
  const key = params.get("key");
  if (isSource(tab)) out.tab = tab;
  if (isAnhXaStatus(status)) out.status = status;
  if (q) out.q = cutAnhXaQuery(q);
  if (key) out.key = key;
  return out;
}

/** Ghi tham số Ánh xạ vào query đang hiện, giữ nguyên mọi tham số khác. */
export function patchAnhXaQuery(liveSearch: string, p: AnhXaParams): string {
  const params = new URLSearchParams(liveSearch);
  for (const name of ANH_XA_PARAMS) params.delete(name);
  return setAnhXaParams(params, p).toString();
}

/** Codec URL của màn Ánh xạ (dạng `UrlCodec` của `useUrlState`): chỉ vá tham số của nó. */
export const ANH_XA_URL = {
  parse: (search: string): AnhXaParams => parseAnhXaQuery(search),
  write: (p: AnhXaParams, liveSearch: string): string => patchAnhXaQuery(liveSearch, p),
};

// ---------------------------------------------------------------------------
// Dự toán: loai=thieu (chỉ xem, lọc ở server)
// ---------------------------------------------------------------------------

/** Dự toán có hạng mục không phải VL / NC / MAY / MTC — báo cáo gom vào `phanIII.dtWithoutKind`. */
export const DU_TOAN_KINDLESS = "thieu";

export interface DuToanParams {
  loai?: typeof DU_TOAN_KINDLESS;
}

export function duToanQuery(p: DuToanParams): string {
  return p.loai === DU_TOAN_KINDLESS ? new URLSearchParams({ loai: DU_TOAN_KINDLESS }).toString() : "";
}

export function parseDuToanQuery(search: string | URLSearchParams): DuToanParams {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return params.get("loai") === DU_TOAN_KINDLESS ? { loai: DU_TOAN_KINDLESS } : {};
}

/**
 * Id dòng dự toán "chưa có loại", cùng quy tắc báo cáo dùng cho `dtWithoutKindValue`
 * (report-service.ts): mã hạng mục ĐANG CÒN của dòng không có hậu tố VL / NC / MAY / MTC, và cả dòng
 * có hạng mục đã xóa mềm (tra không thấy → mã rỗng). `estimates` là dòng chưa xóa mềm.
 */
export function kindlessEstimateIds(
  estimates: readonly { id: number; categoryId: number }[],
  liveCategories: readonly { id: number; code: string }[],
): number[] {
  const codeOf = new Map(liveCategories.map((c) => [c.id, c.code]));
  return estimates.filter((e) => kindOfCategoryCode(codeOf.get(e.categoryId) ?? "") === null).map((e) => e.id);
}

// ---------------------------------------------------------------------------
// DT-HĐ: mo / dauMoi / loc / hd (trạng thái của màn báo cáo) — hợp đồng ở dt-hd-url.ts
// ---------------------------------------------------------------------------

export {
  DT_HD_LOCS, DT_HD_OPEN_MAX, DT_HD_URL, dtHdQuery, parseDtHdQuery, patchDtHdQuery, type DtHdBlockKey, type DtHdLoc, type DtHdParams,
} from "./dt-hd-url";

// ---------------------------------------------------------------------------
// HĐ-TT: loc · DT-TT: neo — hợp đồng ở hd-tt-dt-tt-url.ts
// ---------------------------------------------------------------------------

export {
  DT_TT_ANCHORS, dtTtAnchor, dtTtCounterpartyAnchor, HD_TT_LOCS, HD_TT_URL, hdTtQuery, parseDtTtAnchor, parseHdTtQuery, patchHdTtQuery,
  type DtTtAnchor, type DtTtPartAnchor, type HdTtParams,
} from "./hd-tt-dt-tt-url";
