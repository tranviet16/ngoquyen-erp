"use client";

import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule, type ColDef, type GridOptions } from "ag-grid-community";
import { useRef } from "react";
import { vndFormatter, numberFormatter } from "@/lib/format";

export { vndFormatter, numberFormatter };

ModuleRegistry.registerModules([AllCommunityModule]);

// Vietnamese locale overrides
const VI_LOCALE: Record<string, string> = {
  page: "Trang",
  more: "thêm",
  to: "đến",
  of: "trên",
  next: "Tiếp",
  last: "Cuối",
  first: "Đầu",
  previous: "Trước",
  loadingOoo: "Đang tải...",
  noRowsToShow: "Không có dữ liệu",
  filterOoo: "Lọc...",
  applyFilter: "Áp dụng",
  equals: "Bằng",
  notEqual: "Không bằng",
  contains: "Chứa",
  notContains: "Không chứa",
  startsWith: "Bắt đầu bằng",
  endsWith: "Kết thúc bằng",
  andCondition: "VÀ",
  orCondition: "HOẶC",
  columns: "Cột",
  filters: "Bộ lọc",
  rowGroupColumnsEmptyMessage: "Kéo cột vào đây để nhóm",
  sum: "Tổng",
  min: "Min",
  max: "Max",
  none: "Không",
  count: "Đếm",
  average: "Trung bình",
  sortAscending: "Sắp xếp tăng dần",
  sortDescending: "Sắp xếp giảm dần",
};

export const VND_COL_DEF: Partial<ColDef> = {
  valueFormatter: (p) => vndFormatter(p.value),
  type: "numericColumn",
  cellStyle: { textAlign: "right" },
};

export const NUMBER_COL_DEF: Partial<ColDef> = {
  valueFormatter: (p) => numberFormatter(p.value, 4),
  type: "numericColumn",
  cellStyle: { textAlign: "right" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface AgGridBaseProps<T = any> {
  rowData: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columnDefs: ColDef<T, any>[];
  gridOptions?: GridOptions<T>;
  height?: number | string;
  onGridReady?: (params: { api: unknown }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AgGridBase<T = any>({
  rowData,
  columnDefs,
  gridOptions,
  height = 500,
  onGridReady,
}: AgGridBaseProps<T>) {
  const gridRef = useRef<AgGridReact<T>>(null);

  const defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 80,
  };

  return (
    <div style={{ height, width: "100%" }} className="ag-theme-alpine">
      <AgGridReact<T>
        ref={gridRef}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        localeText={VI_LOCALE}
        pagination={true}
        paginationPageSize={50}
        animateRows={true}
        onGridReady={onGridReady}
        {...gridOptions}
      />
    </div>
  );
}
