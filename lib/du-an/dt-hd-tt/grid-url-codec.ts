/**
 * Bộ lọc lưới (DataGrid chạy ở client) ↔ URL `filter.<cột>`, dựng trên codec sẵn có
 * `lib/table/query-params.ts` — không đổi codec đó. Bốn chỗ codec chưa phủ được xử lý ở đây:
 *   - giá trị "không có" (`""`) bị codec bỏ và ô lọc chọn hiểu là "Tất cả" → dùng `none`, cột tự quy
 *     đổi qua `filterAccessor`;
 *   - một trang chỉ có một không gian `filter.` → trang nhiều lưới (Đầu mối) đồng bộ các tập cột rời
 *     nhau, mỗi lưới chỉ ghi lại cột của mình (`writeGridQuery`);
 *   - `ResourceSpec` đòi các trường phân trang server mà lưới client không dùng → `gridUrlSpec` điền
 *     giá trị trung tính;
 *   - `buildQueryString` dựng lại cả query → chỉ dùng ở trang không có tham số nào khác.
 * Module thuần, an toàn cho bundle client.
 */

import { buildQueryString, parseTableQuery } from "@/lib/table/query-params";
import type { FilterSpec, FilterValue, ResourceSpec } from "@/lib/table/types";

export type GridFilters = Record<string, FilterValue>;

/** Giá trị lọc "không có" (đầu mối / NCC để trống) trên URL và ở ô lọc chọn. */
export const NONE_FILTER_VALUE = "none";

/** Cột tối thiểu để dựng spec URL: `id` + kiểu ô, cùng nghĩa với `DataGridColumn`. */
export interface UrlSpecColumn {
  id: string;
  kind: "text" | "number" | "currency" | "date" | "select" | "boolean" | "fk";
}

/** Ô chọn của các sổ là id số nguyên dương, `0` (không thuộc đầu mối) hoặc `none`. */
const ID_VALUE = /^(?:none|\d{1,9})$/;
const NEUTRAL_PAGE_SIZE = 50;

function filterKindOf(kind: UrlSpecColumn["kind"]): FilterSpec["kind"] {
  switch (kind) {
    case "text":
      return "text";
    case "select":
    case "fk":
    case "boolean":
      return "equals";
    case "number":
    case "currency":
      return "range";
    case "date":
      return "dateRange";
  }
}

/**
 * Spec URL của một lưới client: chỉ các cột `synced` được đọc / ghi. Cột chữ → `text`, cột chọn →
 * `equals`, cột số / tiền → `range`; `overrides` cho cột lọc khác kiểu ô (vd. "chưa chốt" trên cột tiền).
 */
export function gridUrlSpec(
  columns: readonly UrlSpecColumn[],
  synced: readonly string[],
  overrides: Readonly<Record<string, FilterSpec>> = {},
): ResourceSpec {
  const filterable: Record<string, FilterSpec> = {};
  for (const id of synced) {
    const col = columns.find((c) => c.id === id);
    if (!col) throw new Error(`gridUrlSpec: không có cột "${id}"`);
    filterable[id] = overrides[id] ?? { kind: filterKindOf(col.kind) };
  }
  return {
    searchableColumns: [],
    sortable: {},
    filterable,
    defaultSort: { col: synced[0] ?? "id", dir: "asc" },
    defaultPageSize: NEUTRAL_PAGE_SIZE,
  };
}

/** Gộp spec của các lưới cùng trang (tập cột phải rời nhau, vì cả trang chỉ có một `filter.`). */
export function mergeGridUrlSpecs(...specs: ResourceSpec[]): ResourceSpec {
  const filterable: Record<string, FilterSpec> = {};
  for (const spec of specs) {
    for (const [id, f] of Object.entries(spec.filterable)) {
      if (id in filterable) throw new Error(`mergeGridUrlSpecs: cột "${id}" bị đồng bộ hai lần`);
      filterable[id] = f;
    }
  }
  return { ...specs[0], filterable };
}

/** Giá trị có hợp lệ cho cột không; giá trị lạ bị bỏ như cột lạ. */
function accepts(spec: FilterSpec | undefined, value: FilterValue): boolean {
  if (!spec || spec.kind !== value.kind) return false;
  if (value.kind === "text") return value.value !== "";
  if (value.kind !== "equals") return true;
  const options = spec.kind === "equals" ? spec.options : undefined;
  if (options) return options.some((o) => (typeof o === "string" ? o : o.id) === value.value);
  return ID_VALUE.test(value.value);
}

/** Thứ tự cột của spec — để chuỗi query sinh ra luôn như nhau với cùng bộ lọc. */
function ordered(filters: GridFilters, spec: ResourceSpec): GridFilters {
  const out: GridFilters = {};
  for (const id of Object.keys(spec.filterable)) if (filters[id]) out[id] = filters[id];
  return out;
}

/** Đọc bộ lọc từ query (`?a=b` hoặc `a=b`); cột ngoài spec và giá trị lạ bị bỏ. */
export function parseGridQuery(search: string | URLSearchParams, spec: ResourceSpec): GridFilters {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const { filters } = parseTableQuery(params, spec);
  const out: GridFilters = {};
  for (const [id, value] of Object.entries(filters)) if (accepts(spec.filterable[id], value)) out[id] = value;
  return ordered(out, spec);
}

/** Chuỗi query (không có "?") của bộ lọc — chỉ cột trong spec, giá trị hợp lệ. */
export function buildGridQuery(filters: GridFilters, spec: ResourceSpec): string {
  const kept: GridFilters = {};
  for (const [id, value] of Object.entries(filters)) if (accepts(spec.filterable[id], value)) kept[id] = value;
  return buildQueryString({ filters: ordered(kept, spec), page: 1, pageSize: spec.defaultPageSize }, spec);
}

/** Link builder của sổ: giá trị thô theo cột → query. Cột chữ → `text`, cột chọn → `equals`. */
export function gridQuery(spec: ResourceSpec, values: Readonly<Record<string, string | number | undefined>>): string {
  const filters: GridFilters = {};
  for (const [id, raw] of Object.entries(values)) {
    const kind = spec.filterable[id]?.kind;
    if (raw === undefined || raw === "" || (kind !== "text" && kind !== "equals")) continue;
    filters[id] = { kind, value: String(raw) };
  }
  return buildGridQuery(filters, spec);
}

/**
 * Query mới khi một lưới ghi bộ lọc của nó: tham số `filter.` của các lưới khác trên trang (đọc từ URL
 * đang hiện) giữ nguyên, cột của lưới này thay bằng `own`. Trang một lưới: `ownIds` = mọi cột của spec.
 */
export function writeGridQuery(liveSearch: string, pageSpec: ResourceSpec, ownIds: readonly string[], own: GridFilters): string {
  const merged: GridFilters = {};
  for (const [id, value] of Object.entries(parseGridQuery(liveSearch, pageSpec))) if (!ownIds.includes(id)) merged[id] = value;
  for (const id of ownIds) if (own[id]) merged[id] = own[id];
  return buildGridQuery(merged, pageSpec);
}

/** Codec URL của một lưới trên trang (dạng `UrlCodec` của `useUrlState`). */
export function gridUrlCodec(pageSpec: ResourceSpec, ownIds: readonly string[] = Object.keys(pageSpec.filterable)) {
  const pick = (filters: GridFilters): GridFilters => {
    const out: GridFilters = {};
    for (const id of ownIds) if (filters[id]) out[id] = filters[id];
    return out;
  };
  return {
    parse: (search: string): GridFilters => pick(parseGridQuery(search, pageSpec)),
    write: (filters: GridFilters, liveSearch: string): string => writeGridQuery(liveSearch, pageSpec, ownIds, filters),
  };
}

/** `searchParams` của trang (Promise đã await) → URLSearchParams; mảng (tham số lặp) bị bỏ. */
export function toSearchParams(record: Readonly<Record<string, string | string[] | undefined>>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) if (typeof value === "string") params.set(key, value);
  return params;
}

/** JSON khóa đã sắp xếp — so sánh / ghi trạng thái lọc ra `data-filters` không phụ thuộc thứ tự khóa. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
