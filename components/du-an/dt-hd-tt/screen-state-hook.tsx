/**
 * Phần tử ẩn cho lệnh đo `filters` (scripts/dt-hd-tt-ui-measure/filters.ts). Lưới vẽ trên canvas nên
 * script đọc trạng thái lọc ở đây thay vì đọc ô:
 *   - `data-grid-state`: tên màn / lưới;
 *   - `data-filters`: trạng thái lọc đang áp dụng (JSON khóa đã sắp xếp — so được với URL);
 *   - `data-visible-rows`: số dòng còn lại sau lọc, tính bằng chính `applyFilter` của lưới;
 *   - `data-samples`: theo từng cột lọc, một giá trị có thật trong dữ liệu và các giá trị đặc biệt
 *     (none / chưa gán / chưa chốt / 0) đang có dòng — để script không phải đoán id.
 * Không đổi giao diện: phần tử `hidden`, không có nội dung.
 */

import { applyFilter } from "@/components/data-grid/apply-filter-sort";
import type { DataGridColumn, RowWithId } from "@/components/data-grid/types";
import { canonicalJson } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { SPECIAL_FILTER_VALUES } from "@/lib/du-an/dt-hd-tt/screen-links";
import type { FilterValue } from "@/lib/table/types";

export function ScreenStateHook({
  name,
  state,
  visibleRows,
  samples,
  extra,
}: {
  name: string;
  state: unknown;
  visibleRows: number;
  samples: Record<string, string[]>;
  /** Thuộc tính `data-*` riêng của màn (vd. khóa đang mở). */
  extra?: Record<`data-${string}`, string | number>;
}) {
  return (
    <div
      hidden
      data-grid-state={name}
      data-filters={canonicalJson(state)}
      data-visible-rows={visibleRows}
      data-samples={canonicalJson(samples)}
      {...extra}
    />
  );
}

/**
 * Mẫu giá trị lọc theo cột: giá trị thường đầu tiên + các giá trị đặc biệt (none / chưa gán / chưa chốt
 * / 0) đang có dòng — script đo chỉ thử giá trị đặc biệt khi có dòng mang nó.
 */
export function gridFilterSamples<T extends RowWithId>(
  rows: readonly T[],
  columns: readonly DataGridColumn<T>[],
  ids: readonly string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of ids) {
    const col = columns.find((c) => c.id === id);
    if (!col) continue;
    const valueOf = (row: T) => (col.filterAccessor ? col.filterAccessor(row) : String((row as Record<string, unknown>)[id] ?? ""));
    const values = rows.map(valueOf);
    const first = values.find((v) => v !== "" && !SPECIAL_FILTER_VALUES.includes(v));
    out[id] = [...(first === undefined ? [] : [first]), ...SPECIAL_FILTER_VALUES.filter((s) => values.includes(s))];
  }
  return out;
}

export function GridStateHook<T extends RowWithId>({
  name,
  filters,
  rows,
  columns,
  synced,
}: {
  name: string;
  filters: Record<string, FilterValue>;
  rows: T[];
  columns: DataGridColumn<T>[];
  /** Cột đồng bộ URL của lưới (khóa `filterable` trong spec URL của nó). */
  synced: readonly string[];
}) {
  return (
    <ScreenStateHook
      name={name}
      state={filters}
      visibleRows={applyFilter(rows, filters, columns).length}
      samples={gridFilterSamples(rows, columns, synced)}
    />
  );
}
