"use client";

/**
 * Sổ Thực tế nhập (thành tiền gồm VAT): form thêm dòng hai hàng, thu gọn được (`ThucTeNhapAddForm` — bắt
 * buộc chọn đầu mối) và lưới sửa tại ô cao theo cửa sổ. Mỗi lần sửa chỉ gửi ô vừa đổi; server gộp vào
 * dòng đang lưu (KL / đơn giá đổi → tính lại thành tiền). Đầu mối đã gắn không được bỏ trống. Bộ lọc
 * đầu mối (cả "chưa gắn") / Ánh xạ / tên do trang giữ và đồng bộ URL (`filter.<cột>`), nên sống qua lần
 * lưới dựng lại và qua Back.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { BOOK_GRID_HEIGHT } from "@/components/du-an/dt-hd-tt/collapsible-add-form";
import { noneFilterable } from "@/components/du-an/dt-hd-tt/none-filter-column";
import { GridStateHook } from "@/components/du-an/dt-hd-tt/screen-state-hook";
import { useUrlState } from "@/components/du-an/dt-hd-tt/use-url-state";
import { vndFormatter } from "@/lib/format";
import type { ReceiptPatch } from "@/lib/du-an/dt-hd-tt/entry-schemas";
import { isoToDmy, parseDateCell, parseNumberCell } from "@/lib/du-an/dt-hd-tt/entry-cell-parse";
import type { GridFilters } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { softDeleteReceipt, updateReceipt, type ReceiptRow } from "@/lib/du-an/dt-hd-tt/receipt-service";
import { anhXaQuery, screenHref, THUC_TE_NHAP_GRID_SPEC, THUC_TE_NHAP_URL, UNMAPPED_TEXT } from "@/lib/du-an/dt-hd-tt/screen-links";
import { ThucTeNhapAddForm } from "./thuc-te-nhap-add-form";

const DataGrid = dynamic(() => import("@/components/data-grid").then((m) => m.DataGrid), { ssr: false }) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  filters?: GridFilters;
  onFiltersChange?: (filters: GridFilters) => void;
}) => ReactElement;

const SYNCED = Object.keys(THUC_TE_NHAP_GRID_SPEC.filterable);

interface GridRow extends RowWithId {
  /** Ô chữ dd/mm/yyyy (hoặc chữ ngày gốc của file khi chưa đọc được). */
  date: string;
  itemName: string;
  unit: string;
  qty: number | null;
  unitPrice: number | null;
  amountVnd: number;
  counterpartyId: number | string;
  mapping: string;
  note: string;
}

const toGrid = (r: ReceiptRow): GridRow => ({
  id: r.id, date: r.date ? isoToDmy(r.date) : r.dateText ?? "", itemName: r.itemName, unit: r.unit, qty: r.qty, unitPrice: r.unitPrice,
  amountVnd: r.amountVnd, counterpartyId: r.counterpartyId ?? "", mapping: r.mapped ? "" : UNMAPPED_TEXT, note: r.note ?? "",
});

/** Ô vừa sửa → bản sửa một phần gửi server (chữ / số không đọc được thì báo lỗi, không lưu). */
function cellPatch(col: string, value: unknown): ReceiptPatch {
  const text = value == null ? "" : String(value);
  switch (col) {
    case "date": return { date: parseDateCell(value) };
    case "itemName": return { itemName: text };
    case "unit": return { unit: text };
    case "note": return { note: text || null };
    case "counterpartyId": return { counterpartyId: parseNumberCell(value, "Đầu mối") };
    case "qty": return { qty: parseNumberCell(value, "KL") };
    case "unitPrice": return { unitPrice: parseNumberCell(value, "Đơn giá") };
    case "amountVnd": return { amountVnd: parseNumberCell(value, "Thành tiền") };
    default: throw new Error(`Cột "${col}" không sửa được`);
  }
}

interface Props {
  projectId: number;
  rows: ReceiptRow[];
  counterparties: SelectOption[];
  canCreate: boolean;
  canEdit: boolean;
  /** Bộ lọc server đọc từ URL — chỉ dùng cho lần render đầu (xem useUrlState). */
  initialFilters: GridFilters;
}

export function ThucTeNhapClient({ projectId, rows, counterparties, canCreate, canEdit, initialFilters }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useUrlState(initialFilters, THUC_TE_NHAP_URL);
  const refresh = () => startTransition(() => router.refresh());

  const total = rows.reduce((s, r) => s + r.amountVnd, 0);
  const unmapped = rows.filter((r) => !r.mapped).length;
  const noCounterparty = rows.filter((r) => r.counterpartyId === null).length;
  const gridOptions: SelectOption[] = [{ id: "", name: "(chưa gắn)" }, ...counterparties];
  const known = new Set(counterparties.map((c) => String(c.id)));
  for (const r of rows) {
    if (r.counterpartyId !== null && !known.has(String(r.counterpartyId))) {
      known.add(String(r.counterpartyId));
      gridOptions.push({ id: r.counterpartyId, name: `${r.counterpartyName ?? `#${r.counterpartyId}`} (đã xóa)` });
    }
  }
  const locked = !canEdit; // cột nhập được chỉ sửa khi có quyền `edit`

  const columns: DataGridColumn<GridRow>[] = [
    { id: "date", title: "Ngày", kind: "text", width: 100, readonly: locked },
    { id: "itemName", title: "Tên", kind: "text", width: 260, readonly: locked, filterable: true },
    { id: "unit", title: "ĐVT", kind: "text", width: 60, readonly: locked },
    { id: "qty", title: "KL", kind: "number", width: 90, readonly: locked },
    { id: "unitPrice", title: "Đơn giá", kind: "currency", width: 110, readonly: locked },
    { id: "amountVnd", title: "Thành tiền gồm VAT", kind: "currency", width: 140, readonly: locked },
    // "(chưa gắn)" lọc được: ô lọc mang `none` (`""` là "Tất cả").
    { id: "counterpartyId", title: "Đầu mối", kind: "select", width: 200, options: gridOptions, readonly: locked, ...noneFilterable<GridRow>("counterpartyId", gridOptions) },
    { id: "mapping", title: "Ánh xạ", kind: "text", width: 80, readonly: true, filterable: true },
    { id: "note", title: "Ghi chú", kind: "text", width: 200, readonly: locked },
  ];
  const gridRows = rows.map(toGrid);

  const handlers: DataGridHandlers<GridRow> = {
    // Lỗi ném ra ở đây: lưới hiện thông điệp và trả ô về giá trị cũ.
    onCellEdit: async (id, col, value) => {
      const result = await updateReceipt(id, projectId, cellPatch(col, value));
      if (!result.ok) throw new Error(result.message);
      refresh();
      return toGrid(result.row);
    },
    onDeleteRows: async (ids) => {
      try {
        for (const id of ids) {
          const result = await softDeleteReceipt(id, projectId);
          if (!result.ok) throw new Error(result.message);
        }
      } finally {
        refresh(); // lỗi giữa chừng: tải lại để thấy đúng các dòng đã xóa
      }
    },
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Sổ Thực tế nhập</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} dòng · Thành tiền gồm VAT <strong>{vndFormatter(total)}</strong>
            {noCounterparty > 0 && <> · {noCounterparty} dòng chưa gắn đầu mối</>}
          </p>
        </div>
        {unmapped > 0 && (
          <Link
            href={screenHref(projectId, "anh-xa", { query: anhXaQuery({ tab: "tt", status: "chua_gan" }) })}
            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900 hover:underline"
          >
            {unmapped} dòng chưa gán — mở Ánh xạ
          </Link>
        )}
      </div>

      {canCreate && counterparties.length === 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Công trình chưa có đầu mối nào — cần tạo đầu mối trước khi nhập thực tế.
        </p>
      )}
      {canCreate && counterparties.length > 0 && <ThucTeNhapAddForm projectId={projectId} counterparties={counterparties} onAdded={refresh} />}

      <DataGrid<GridRow>
        key={rows.map((r) => r.id).join(",")}
        columns={columns}
        rows={gridRows}
        handlers={canEdit ? handlers : {}}
        height={BOOK_GRID_HEIGHT}
        filters={filters}
        onFiltersChange={setFilters}
      />
      <GridStateHook name="thuc-te-nhap" filters={filters} rows={gridRows} columns={columns} synced={SYNCED} />
    </div>
  );
}
