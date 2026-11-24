/**
 * Cột chọn của sổ có lựa chọn "để trống" (id `""`, vd. "(chưa gắn)" / "(trống)") lọc được theo "trống":
 * ô lọc dùng `none` thay cho `""` (`""` của ô lọc là "Tất cả"), dòng trống lọc ra `none` qua
 * `filterAccessor`; sắp xếp vẫn theo tên lựa chọn như trước (`sortAccessor` tra cùng danh sách).
 */

import type { DataGridColumn, RowWithId, SelectOption } from "@/components/data-grid/types";
import { NONE_FILTER_VALUE } from "@/lib/du-an/dt-hd-tt/grid-url-codec";

type NoneFilterProps<T> = Required<Pick<DataGridColumn<T>, "filterable" | "filterOptions" | "filterAccessor" | "sortAccessor">>;

export function noneFilterable<T extends RowWithId>(id: keyof T & string, options: readonly SelectOption[]): NoneFilterProps<T> {
  const name = new Map(options.map((o) => [String(o.id), o.name]));
  const raw = (row: T) => (row as Record<string, unknown>)[id];
  return {
    filterable: true,
    filterOptions: options.map((o) => (o.id === "" ? { id: NONE_FILTER_VALUE, name: o.name } : o)),
    filterAccessor: (row) => {
      const v = raw(row);
      return v == null || v === "" ? NONE_FILTER_VALUE : String(v);
    },
    sortAccessor: (row) => name.get(String(raw(row))) ?? raw(row),
  };
}
