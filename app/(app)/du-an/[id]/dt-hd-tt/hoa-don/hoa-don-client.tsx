"use client";

/**
 * Sổ Hóa đơn: form thêm dòng hai hàng, thu gọn được (`HoaDonAddForm` — giữ lại ngày / số HĐ / NCC / VAT %
 * cho dòng kế tiếp của cùng hóa đơn) + lưới sửa tại ô cao theo cửa sổ. Mỗi lần sửa chỉ gửi ô vừa đổi;
 * server gộp vào dòng đang lưu và tính lại thành tiền / tiền VAT. NCC chỉ chọn trong danh sách NCC đang
 * hoạt động (NCC mới do quản trị tạo). Bộ lọc NCC / số HĐ / Ánh xạ do trang giữ và đồng bộ URL
 * (`filter.<cột>`), nên sống qua lần lưới dựng lại sau "Thêm dòng" và qua Back.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { GridStateHook } from "@/components/du-an/dt-hd-tt/screen-state-hook";
import { BOOK_GRID_HEIGHT } from "@/components/du-an/dt-hd-tt/collapsible-add-form";
import { useUrlState } from "@/components/du-an/dt-hd-tt/use-url-state";
import { vndFormatter } from "@/lib/format";
import type { InvoiceLinePatch } from "@/lib/du-an/dt-hd-tt/entry-schemas";
import { isoToDmy, parseDateCell, parseNumberCell } from "@/lib/du-an/dt-hd-tt/entry-cell-parse";
import type { GridFilters } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { softDeleteInvoiceLine, updateInvoiceLine, type InvoiceLineRow } from "@/lib/du-an/dt-hd-tt/invoice-service";
import { anhXaQuery, HOA_DON_GRID_SPEC, HOA_DON_URL, screenHref, UNMAPPED_TEXT } from "@/lib/du-an/dt-hd-tt/screen-links";
import { HoaDonAddForm } from "./hoa-don-add-form";

const DataGrid = dynamic(() => import("@/components/data-grid").then((m) => m.DataGrid), { ssr: false }) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  filters?: GridFilters;
  onFiltersChange?: (filters: GridFilters) => void;
}) => ReactElement;

const SYNCED = Object.keys(HOA_DON_GRID_SPEC.filterable);

interface GridRow extends RowWithId {
  /** Ô chữ dd/mm/yyyy (hoặc chữ ngày gốc của file khi chưa đọc được). */
  invoiceDate: string;
  invoiceNo: string;
  supplierId: number;
  itemName: string;
  unit: string;
  qty: number | null;
  unitPrice: number | null;
  amountVnd: number;
  vatPercent: number | null;
  vatVnd: number;
  totalVnd: number;
  mapping: string;
  note: string;
}

const toGrid = (r: InvoiceLineRow): GridRow => ({
  id: r.id, invoiceDate: r.invoiceDate ? isoToDmy(r.invoiceDate) : r.invoiceDateText ?? "", invoiceNo: r.invoiceNo, supplierId: r.supplierId,
  itemName: r.itemName, unit: r.unit, qty: r.qty, unitPrice: r.unitPrice, amountVnd: r.amountVnd,
  vatPercent: r.vatPct === null ? null : Math.round(r.vatPct * 10_000) / 100, vatVnd: r.vatVnd, totalVnd: r.amountVnd + r.vatVnd,
  mapping: r.mapped ? "" : UNMAPPED_TEXT, note: r.note ?? "",
});

/** Ô vừa sửa → bản sửa một phần gửi server (chữ / số không đọc được thì báo lỗi, không lưu). */
function cellPatch(col: string, value: unknown): InvoiceLinePatch {
  const text = value == null ? "" : String(value);
  switch (col) {
    case "invoiceDate": return { invoiceDate: parseDateCell(value) };
    case "invoiceNo": return { invoiceNo: text };
    case "supplierId": {
      const supplierId = parseNumberCell(value, "NCC");
      if (supplierId === null) throw new Error("Chọn NCC");
      return { supplierId };
    }
    case "itemName": return { itemName: text };
    case "unit": return { unit: text };
    case "note": return { note: text || null };
    case "qty": return { qty: parseNumberCell(value, "SL") };
    case "unitPrice": return { unitPrice: parseNumberCell(value, "Đơn giá") };
    case "amountVnd": return { amountVnd: parseNumberCell(value, "Thành tiền") };
    case "vatPercent": {
      const pct = parseNumberCell(value, "VAT %");
      return { vatPct: pct === null ? null : pct / 100 };
    }
    case "vatVnd": return { vatVnd: parseNumberCell(value, "Tiền VAT") };
    default: throw new Error(`Cột "${col}" không sửa được`);
  }
}

interface Props {
  projectId: number;
  rows: InvoiceLineRow[];
  suppliers: SelectOption[];
  canCreate: boolean;
  canEdit: boolean;
  /** Bộ lọc server đọc từ URL — chỉ dùng cho lần render đầu (xem useUrlState). */
  initialFilters: GridFilters;
}

export function HoaDonClient({ projectId, rows, suppliers, canCreate, canEdit, initialFilters }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useUrlState(initialFilters, HOA_DON_URL);
  const refresh = () => startTransition(() => router.refresh());

  // NCC đã ngừng dùng vẫn hiện tên ở dòng cũ, nhưng không có trong danh sách chọn cho dòng mới.
  const activeIds = new Set(suppliers.map((s) => String(s.id)));
  const gridOptions: SelectOption[] = [...suppliers];
  for (const r of rows) {
    if (!activeIds.has(String(r.supplierId))) { activeIds.add(String(r.supplierId)); gridOptions.push({ id: r.supplierId, name: `${r.supplierName} (ngừng dùng)` }); }
  }
  const totals = rows.reduce((t, r) => ({ amount: t.amount + r.amountVnd, vat: t.vat + r.vatVnd }), { amount: 0, vat: 0 });
  const unmapped = rows.filter((r) => !r.mapped).length;
  const locked = !canEdit; // cột nhập được chỉ sửa khi có quyền `edit`

  const columns: DataGridColumn<GridRow>[] = [
    { id: "invoiceDate", title: "Ngày", kind: "text", width: 100, readonly: locked },
    { id: "invoiceNo", title: "Số HĐ", kind: "text", width: 100, readonly: locked, filterable: true },
    { id: "supplierId", title: "NCC", kind: "select", width: 200, options: gridOptions, readonly: locked, filterable: true },
    { id: "itemName", title: "Tên hàng", kind: "text", width: 240, readonly: locked },
    { id: "unit", title: "ĐVT", kind: "text", width: 60, readonly: locked },
    { id: "qty", title: "SL", kind: "number", width: 90, readonly: locked },
    { id: "unitPrice", title: "Đơn giá", kind: "currency", width: 110, readonly: locked },
    { id: "amountVnd", title: "Thành tiền chưa VAT", kind: "currency", width: 140, readonly: locked },
    { id: "vatPercent", title: "VAT %", kind: "number", width: 70, readonly: locked },
    { id: "vatVnd", title: "Tiền VAT", kind: "currency", width: 120, readonly: locked },
    { id: "totalVnd", title: "Gồm VAT", kind: "currency", width: 130, readonly: true },
    { id: "mapping", title: "Ánh xạ", kind: "text", width: 80, readonly: true, filterable: true },
    { id: "note", title: "Ghi chú", kind: "text", width: 180, readonly: locked },
  ];
  const gridRows = rows.map(toGrid);

  const handlers: DataGridHandlers<GridRow> = {
    // Lỗi ném ra ở đây: lưới hiện thông điệp và trả ô về giá trị cũ.
    onCellEdit: async (id, col, value) => {
      const result = await updateInvoiceLine(id, projectId, cellPatch(col, value));
      if (!result.ok) throw new Error(result.message);
      if (result.warning) toast.warning(result.warning);
      refresh();
      return toGrid(result.row);
    },
    onDeleteRows: async (ids) => {
      try {
        for (const id of ids) {
          const result = await softDeleteInvoiceLine(id, projectId);
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
          <h2 className="text-lg font-semibold">Sổ Hóa đơn</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} dòng · Chưa VAT <strong>{vndFormatter(totals.amount)}</strong> · VAT <strong>{vndFormatter(totals.vat)}</strong> · Gồm VAT{" "}
            <strong>{vndFormatter(totals.amount + totals.vat)}</strong>
          </p>
        </div>
        {unmapped > 0 && (
          <Link
            href={screenHref(projectId, "anh-xa", { query: anhXaQuery({ tab: "hd", status: "chua_gan" }) })}
            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900 hover:underline"
          >
            {unmapped} dòng chưa gán — mở Ánh xạ
          </Link>
        )}
      </div>

      {canCreate && <HoaDonAddForm projectId={projectId} suppliers={suppliers} onAdded={refresh} />}

      <DataGrid<GridRow>
        key={rows.map((r) => r.id).join(",")}
        columns={columns}
        rows={gridRows}
        handlers={canEdit ? handlers : {}}
        height={BOOK_GRID_HEIGHT}
        filters={filters}
        onFiltersChange={setFilters}
      />
      <GridStateHook name="hoa-don" filters={filters} rows={gridRows} columns={columns} synced={SYNCED} />
    </div>
  );
}
