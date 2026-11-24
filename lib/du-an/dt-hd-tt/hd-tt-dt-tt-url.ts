/**
 * Hợp đồng URL của hai màn báo cáo HĐ-TT và DT-TT (dòng `hd-tt` / `dt-tt` của screen-links, xuất lại ở đó —
 * mọi nơi import qua screen-links):
 *   - HĐ-TT: `loc` = con-phai-lay-hd | con-phai-lay-ve | co-viec, đúng các khóa của `HD_TT_LOC_PREDICATES`
 *     (overview-todos.ts) nên số đếm của Tổng quan và dòng hiện ở màn đích dùng chung một vị từ;
 *   - DT-TT: neo `#phan-i`, `#phan-ii`, `#phan-iii` và `#dm-{id đầu mối}` (dòng Phần II).
 * Builder và parser đi cặp: dựng rồi đọc lại ra đúng đầu vào; giá trị lạ bị bỏ. Module thuần, an toàn cho
 * bundle client (chỉ import kiểu từ overview-todos).
 */

import type { HdTtLoc } from "./overview-todos";

// ---------------------------------------------------------------------------
// HĐ-TT: loc
// ---------------------------------------------------------------------------

export const HD_TT_LOCS = ["con-phai-lay-hd", "con-phai-lay-ve", "co-viec"] as const satisfies readonly HdTtLoc[];
const HD_TT_PARAMS = ["loc"] as const;

export interface HdTtParams {
  loc?: HdTtLoc;
}

const isHdTtLoc = (v: string | null | undefined): v is HdTtLoc => (HD_TT_LOCS as readonly string[]).includes(v ?? "");

function setHdTtParams(params: URLSearchParams, p: HdTtParams): URLSearchParams {
  if (isHdTtLoc(p.loc)) params.set("loc", p.loc);
  return params;
}

export function hdTtQuery(p: HdTtParams): string {
  return setHdTtParams(new URLSearchParams(), p).toString();
}

export function parseHdTtQuery(search: string | URLSearchParams): HdTtParams {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const loc = params.get("loc");
  return isHdTtLoc(loc) ? { loc } : {};
}

/** Ghi tham số HĐ-TT vào query đang hiện, giữ nguyên mọi tham số khác. */
export function patchHdTtQuery(liveSearch: string, p: HdTtParams): string {
  const params = new URLSearchParams(liveSearch);
  for (const name of HD_TT_PARAMS) params.delete(name);
  return setHdTtParams(params, p).toString();
}

/** Codec URL của màn HĐ-TT (dạng `UrlCodec` của `useUrlState`): chỉ vá tham số của nó. */
export const HD_TT_URL = {
  parse: (search: string): HdTtParams => parseHdTtQuery(search),
  write: (p: HdTtParams, liveSearch: string): string => patchHdTtQuery(liveSearch, p),
};

// ---------------------------------------------------------------------------
// DT-TT: neo
// ---------------------------------------------------------------------------

/** Neo ba phần của DT-TT. */
export const DT_TT_ANCHORS = { phanI: "phan-i", phanII: "phan-ii", phanIII: "phan-iii" } as const;
export type DtTtPartAnchor = (typeof DT_TT_ANCHORS)[keyof typeof DT_TT_ANCHORS];

/** Neo một đầu mối ở Phần II DT-TT. */
export const dtTtCounterpartyAnchor = (counterpartyId: number): string => `dm-${counterpartyId}`;

export type DtTtAnchor = { part: DtTtPartAnchor } | { counterpartyId: number };

const PARTS: readonly string[] = Object.values(DT_TT_ANCHORS);
const COUNTERPARTY_ANCHOR = /^dm-([1-9]\d{0,8})$/;

/** Neo dựng lại từ một `DtTtAnchor` (không có "#"). */
export function dtTtAnchor(a: DtTtAnchor): string {
  return "part" in a ? a.part : dtTtCounterpartyAnchor(a.counterpartyId);
}

/** Đọc neo (có hoặc không có "#"); neo lạ → null. */
export function parseDtTtAnchor(hash: string): DtTtAnchor | null {
  const h = hash.replace(/^#/, "");
  if (PARTS.includes(h)) return { part: h as DtTtPartAnchor };
  const m = COUNTERPARTY_ANCHOR.exec(h);
  return m ? { counterpartyId: Number(m[1]) } : null;
}
