"use client";

/**
 * Sổ Chi thực tế của đội: chuyển khoản + tiền mặt, mục I–IV, đầu mối và / hoặc NCC pháp nhân. Form thêm
 * dòng hai hàng, thu gọn được (`ChiThucTeAddForm`) + lưới sửa tại ô cao theo cửa sổ (mỗi lần sửa chỉ gửi
 * ô vừa đổi). NCC chỉ chọn trong danh sách NCC đang hoạt động. Bộ lọc NCC / đầu mối (cả "trống") / nội
 * dung do trang giữ và đồng bộ URL (`filter.<cột>`).
 */

import dynamic from "next/dynamic";
import { useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { BOOK_GRID_HEIGHT } from "@/components/du-an/dt-hd-tt/collapsible-add-form";
import { noneFilterable } from "@/components/du-an/dt-hd-tt/none-filter-column";
import { GridStateHook } from "@/components/du-an/dt-hd-tt/screen-state-hook";
import { useUrlState } from "@/components/du-an/dt-hd-tt/use-url-state";
import { vndFormatter } from "@/lib/format";
import type { PaymentPatch } from "@/lib/du-an/dt-hd-tt/entry-schemas";
import { isoToDmy, parseDateCell, parseNumberCell } from "@/lib/du-an/dt-hd-tt/entry-cell-parse";
import type { GridFilters } from "@/lib/du-an/dt-hd-tt/grid-url-codec";
import { softDeletePayment, updatePayment, type PaymentRow } from "@/lib/du-an/dt-hd-tt/payment-service";
import { CHI_THUC_TE_GRID_SPEC, CHI_THUC_TE_URL } from "@/lib/du-an/dt-hd-tt/screen-links";
import { ChiThucTeAddForm } from "./chi-thuc-te-add-form";

const DataGrid = dynamic(() => import("@/components/data-grid").then((m) => m.DataGrid), { ssr: false }) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  filters?: GridFilters;
  onFiltersChange?: (filters: GridFilters) => void;
}) => ReactElement;

const SYNCED = Object.keys(CHI_THUC_TE_GRID_SPEC.filterable);

const SECTIONS = ["I", "II", "III", "IV"] as const;
type Section = (typeof SECTIONS)[number];

interface GridRow extends RowWithId {
  /** Ô chữ dd/mm/yyyy (hoặc chữ ngày gốc của file khi chưa đọc được). */
  date: string;
  content: string;
  bankVnd: number;
  cashVnd: number;
  totalVnd: number;
  section: string;
  counterpartyId: number | string;
  supplierId: number | string;
  note: string;
}

const toGrid = (r: PaymentRow): GridRow => ({
  id: r.id, date: r.date ? isoToDmy(r.date) : r.dateText ?? "", content: r.content, bankVnd: r.bankVnd, cashVnd: r.cashVnd,
  totalVnd: r.bankVnd + r.cashVnd, section: r.section, counterpartyId: r.counterpartyId ?? "", supplierId: r.supplierId ?? "", note: r.note ?? "",
});

/** Ô vừa sửa → bản sửa một phần gửi server (chữ / số không đọc được thì báo lỗi, không lưu). */
function cellPatch(col: string, value: unknown): PaymentPatch {
  const text = value == null ? "" : String(value);
  switch (col) {
    case "date": return { date: parseDateCell(value) };
    case "content": return { content: text };
    case "note": return { note: text || null };
    case "section": return { section: text as Section };
    case "bankVnd": return { bankVnd: parseNumberCell(value, "Chuyển khoản") };
    case "cashVnd": return { cashVnd: parseNumberCell(value, "Tiền mặt") };
    case "counterpartyId": return { counterpartyId: parseNumberCell(value, "Đầu mối") };
    case "supplierId": return { supplierId: parseNumberCell(value, "NCC") };
    default: throw new Error(`Cột "${col}" không sửa được`);
  }
}

/** Danh sách chọn của lưới: "(trống)" + mục đang dùng + mục dòng cũ trỏ tới nhưng đã ngừng dùng. */
function withMissing(options: SelectOption[], refs: { id: number | null; name: string | null }[], suffix: string): SelectOption[] {
  const out: SelectOption[] = [{ id: "", name: "(trống)" }, ...options];
  const known = new Set(options.map((o) => String(o.id)));
  for (const ref of refs) {
    if (ref.id === null || known.has(String(ref.id))) continue;
    known.add(String(ref.id));
    out.push({ id: ref.id, name: `${ref.name ?? `#${ref.id}`} (${suffix})` });
  }
  return out;
}

interface Props {
  projectId: number;
  rows: PaymentRow[];
  counterparties: SelectOption[];
  suppliers: SelectOption[];
  canCreate: boolean;
  canEdit: boolean;
  /** Bộ lọc server đọc từ URL — chỉ dùng cho lần render đầu (xem useUrlState). */
  initialFilters: GridFilters;
}

export function ChiThucTeClient({ projectId, rows, counterparties, suppliers, canCreate, canEdit, initialFilters }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useUrlState(initialFilters, CHI_THUC_TE_URL);
  const refresh = () => startTransition(() => router.refresh());

  const totals = rows.reduce((t, r) => ({ bank: t.bank + r.bankVnd, cash: t.cash + r.cashVnd }), { bank: 0, cash: 0 });
  const bySection = SECTIONS.map((s) => ({ s, v: rows.filter((r) => r.section === s).reduce((a, r) => a + r.bankVnd + r.cashVnd, 0) }));
  const locked = !canEdit; // cột nhập được chỉ sửa khi có quyền `edit`
  const sectionOptions: SelectOption[] = SECTIONS.map((s) => ({ id: s, name: `Mục ${s}` }));
  const cpOptions = withMissing(counterparties, rows.map((r) => ({ id: r.counterpartyId, name: r.counterpartyName })), "đã xóa");
  const supplierOptions = withMissing(suppliers, rows.map((r) => ({ id: r.supplierId, name: r.supplierName })), "ngừng dùng");

  const columns: DataGridColumn<GridRow>[] = [
    { id: "date", title: "Ngày", kind: "text", width: 100, readonly: locked },
    { id: "content", title: "Nội dung", kind: "text", width: 260, readonly: locked, filterable: true },
    { id: "bankVnd", title: "Chuyển khoản", kind: "currency", width: 130, readonly: locked },
    { id: "cashVnd", title: "Tiền mặt", kind: "currency", width: 130, readonly: locked },
    { id: "totalVnd", title: "Cộng", kind: "currency", width: 130, readonly: true },
    { id: "section", title: "Mục", kind: "select", width: 80, options: sectionOptions, readonly: locked },
    { id: "counterpartyId", title: "Đầu mối", kind: "select", width: 180, options: cpOptions, readonly: locked, ...noneFilterable<GridRow>("counterpartyId", cpOptions) },
    { id: "supplierId", title: "NCC", kind: "select", width: 180, options: supplierOptions, readonly: locked, ...noneFilterable<GridRow>("supplierId", supplierOptions) },
    { id: "note", title: "Ghi chú", kind: "text", width: 180, readonly: locked },
  ];
  const gridRows = rows.map(toGrid);

  const handlers: DataGridHandlers<GridRow> = {
    // Lỗi ném ra ở đây: lưới hiện thông điệp và trả ô về giá trị cũ.
    onCellEdit: async (id, col, value) => {
      const result = await updatePayment(id, projectId, cellPatch(col, value));
      if (!result.ok) throw new Error(result.message);
      refresh();
      return toGrid(result.row);
    },
    onDeleteRows: async (ids) => {
      try {
        for (const id of ids) {
          const result = await softDeletePayment(id, projectId);
          if (!result.ok) throw new Error(result.message);
        }
      } finally {
        refresh(); // lỗi giữa chừng: tải lại để thấy đúng các dòng đã xóa
      }
    },
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Sổ Chi thực tế</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} khoản · CK <strong>{vndFormatter(totals.bank)}</strong> · TM <strong>{vndFormatter(totals.cash)}</strong> · Cộng{" "}
          <strong>{vndFormatter(totals.bank + totals.cash)}</strong>
        </p>
        <p className="text-xs text-muted-foreground">{bySection.map(({ s, v }) => `Mục ${s}: ${vndFormatter(v)}`).join(" · ")}</p>
      </div>

      {canCreate && <ChiThucTeAddForm projectId={projectId} counterparties={counterparties} suppliers={suppliers} onAdded={refresh} />}

      <DataGrid<GridRow>
        key={rows.map((r) => r.id).join(",")}
        columns={columns}
        rows={gridRows}
        handlers={canEdit ? handlers : {}}
        height={BOOK_GRID_HEIGHT}
        filters={filters}
        onFiltersChange={setFilters}
      />
      <GridStateHook name="chi-thuc-te" filters={filters} rows={gridRows} columns={columns} synced={SYNCED} />
    </div>
  );
}
