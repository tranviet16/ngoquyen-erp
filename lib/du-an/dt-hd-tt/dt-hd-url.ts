/**
 * Hợp đồng URL của màn báo cáo DT-HĐ (dòng `dt-hd` của screen-links, xuất lại ở đó — mọi nơi import qua
 * screen-links): `mo` = các khối đang mở (id đầu mối hoặc `none`, tối đa 30), `dauMoi` = một đầu mối,
 * `loc` = tình trạng dòng dự toán, `hd=1` = hiện dòng hóa đơn. Builder và parser đi cặp: dựng rồi đọc lại
 * ra đúng đầu vào; giá trị lạ bị bỏ. Dựng bằng URLSearchParams. Module thuần, an toàn cho bundle client.
 */

import { NONE_FILTER_VALUE } from "./grid-url-codec";

/** Lọc dòng dự toán theo tình trạng; mỗi giá trị ứng đúng một tình trạng của `dtHdStatus`. */
export const DT_HD_LOCS = ["con-thieu", "vuot", "chua-co-hd", "thieu-he-so"] as const;
export type DtHdLoc = (typeof DT_HD_LOCS)[number];
/** Khối đầu mối trên URL: id đầu mối, hoặc `none` = khối "Chưa có đầu mối". */
export type DtHdBlockKey = number | typeof NONE_FILTER_VALUE;
/** `mo` giữ tối đa 30 khối mở (giữ các khối mở sau cùng). */
export const DT_HD_OPEN_MAX = 30;
const DT_HD_PARAMS = ["mo", "dauMoi", "loc", "hd"] as const;

export interface DtHdParams {
  /**
   * Khối đang mở. Không có = mặc định: đang lọc thì mở các khối khớp, không lọc thì đóng hết.
   * `[]` (URL `mo=`) = đóng hết dù đang lọc.
   */
  mo?: DtHdBlockKey[];
  /** Chỉ một đầu mối. */
  dauMoi?: DtHdBlockKey;
  loc?: DtHdLoc;
  /** Hiện các dòng hóa đơn "↳" dưới dòng dự toán. */
  hd?: true;
}

const BLOCK_KEY = /^(?:none|[1-9]\d{0,8})$/;
const isLoc = (v: string | null | undefined): v is DtHdLoc => (DT_HD_LOCS as readonly string[]).includes(v ?? "");

function parseBlockKey(raw: string): DtHdBlockKey | null {
  const v = raw.trim();
  if (!BLOCK_KEY.test(v)) return null;
  return v === NONE_FILTER_VALUE ? NONE_FILTER_VALUE : Number(v);
}

/** Khóa hợp lệ, không lặp, tối đa `DT_HD_OPEN_MAX` (giữ các khóa sau cùng). */
function cleanOpenKeys(keys: readonly DtHdBlockKey[]): DtHdBlockKey[] {
  const valid = keys.filter((k) => parseBlockKey(String(k)) !== null);
  return [...new Set(valid)].slice(-DT_HD_OPEN_MAX);
}

function setDtHdParams(params: URLSearchParams, p: DtHdParams): URLSearchParams {
  if (p.mo) params.set("mo", cleanOpenKeys(p.mo).join(","));
  if (p.dauMoi !== undefined && parseBlockKey(String(p.dauMoi)) !== null) params.set("dauMoi", String(p.dauMoi));
  if (isLoc(p.loc)) params.set("loc", p.loc);
  if (p.hd === true) params.set("hd", "1");
  return params;
}

export function dtHdQuery(p: DtHdParams): string {
  return setDtHdParams(new URLSearchParams(), p).toString();
}

export function parseDtHdQuery(search: string | URLSearchParams): DtHdParams {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const out: DtHdParams = {};
  const mo = params.get("mo");
  if (mo !== null) {
    const keys = cleanOpenKeys(mo.split(",").map(parseBlockKey).filter((k): k is DtHdBlockKey => k !== null));
    // `mo=` = đóng hết; chỉ toàn giá trị lạ = bỏ tham số như mọi giá trị lạ khác.
    if (mo.trim() === "") out.mo = [];
    else if (keys.length > 0) out.mo = keys;
  }
  const dauMoi = parseBlockKey(params.get("dauMoi") ?? "");
  if (dauMoi !== null) out.dauMoi = dauMoi;
  const loc = params.get("loc");
  if (isLoc(loc)) out.loc = loc;
  if (params.get("hd") === "1") out.hd = true;
  return out;
}

/** Ghi tham số DT-HĐ vào query đang hiện, giữ nguyên mọi tham số khác. */
export function patchDtHdQuery(liveSearch: string, p: DtHdParams): string {
  const params = new URLSearchParams(liveSearch);
  for (const name of DT_HD_PARAMS) params.delete(name);
  return setDtHdParams(params, p).toString();
}

/** Codec URL của màn DT-HĐ (dạng `UrlCodec` của `useUrlState`): chỉ vá tham số của nó. */
export const DT_HD_URL = {
  parse: (search: string): DtHdParams => parseDtHdQuery(search),
  write: (p: DtHdParams, liveSearch: string): string => patchDtHdQuery(liveSearch, p),
};
