"use client";

import dynamic from "next/dynamic";
import { useMemo, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import { Button } from "@/components/ui/button";
import { SupplierMultiSelect } from "./supplier-multi-select";
import { vndFormatter, numberFormatter } from "@/lib/format";
import type {
  SupplierDebtRow,
  SupplierDebtSummary,
} from "@/lib/du-an/supplier-debt-service";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

interface DebtGridRow extends RowWithId {
  supplierName: string;
  itemName: string;
  qty: number;
  unit: string;
  amountTaken: number;
  amountTakenHd: number;
  amountPaid: number;
  amountPaidHd: number;
  balance: number;
  balanceHd: number;
  note: string;
}

interface Props {
  rows: SupplierDebtRow[];
  summary: SupplierDebtSummary;
  supplierNames: string[];
  initialSuppliers: string[];
}

export function CongNoClient({
  rows: source,
  summary,
  supplierNames,
  initialSuppliers,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selected = useMemo<string[]>(() => {
    const sp = searchParams?.get("suppliers");
    if (sp) return sp.split(",").map((s) => s.trim()).filter(Boolean);
    return initialSuppliers;
  }, [searchParams, initialSuppliers]);

  const pushFilter = (next: string[]) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (next.length > 0) {
      params.set("suppliers", next.join(","));
    } else {
      params.delete("suppliers");
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?");
    });
  };

  const rows: DebtGridRow[] = source.map((r) => ({
    id: r.id,
    supplierName: r.supplierName,
    itemName: r.itemName ?? "",
    qty: r.qty ?? 0,
    unit: r.unit ?? "",
    amountTaken: r.amountTaken ?? 0,
    amountTakenHd: r.amountTakenHd ?? 0,
    amountPaid: r.amountPaid ?? 0,
    amountPaidHd: r.amountPaidHd ?? 0,
    balance: r.balance ?? 0,
    balanceHd: r.balanceHd ?? 0,
    note: r.note ?? "",
  }));

  const columns: DataGridColumn<DebtGridRow>[] = [
    { id: "supplierName", title: "Nhà cung cấp", kind: "text", width: 240, readonly: true },
    { id: "itemName", title: "Vật tư", kind: "text", width: 200, readonly: true },
    {
      id: "qty",
      title: "SL",
      kind: "number",
      width: 100,
      readonly: true,
      format: (v) => numberFormatter(Number(v ?? 0), 2),
    },
    { id: "unit", title: "ĐVT", kind: "text", width: 80, readonly: true },
    { id: "amountTaken", title: "Lấy hàng TT", kind: "currency", width: 140, readonly: true },
    { id: "amountTakenHd", title: "Lấy hàng HĐ", kind: "currency", width: 140, readonly: true },
    { id: "amountPaid", title: "Đã trả TT", kind: "currency", width: 140, readonly: true },
    { id: "amountPaidHd", title: "Đã trả HĐ", kind: "currency", width: 140, readonly: true },
    { id: "balance", title: "Còn nợ TT", kind: "currency", width: 140, readonly: true },
    { id: "balanceHd", title: "Còn nợ HĐ", kind: "currency", width: 140, readonly: true },
    { id: "note", title: "Ghi chú", kind: "text", width: 200, readonly: true },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Số dòng" value={summary.rowCount.toString()} />
        <SummaryCard label="Lấy hàng TT" value={vndFormatter(summary.totalTaken)} />
        <SummaryCard label="Lấy hàng HĐ" value={vndFormatter(summary.totalTakenHd)} />
        <SummaryCard label="Còn nợ TT" value={vndFormatter(summary.totalBalance)} />
        <SummaryCard label="Còn nợ HĐ" value={vndFormatter(summary.totalBalanceHd)} />
        <SummaryCard
          label="Còn nợ tổng (TT+HĐ)"
          value={vndFormatter(summary.totalBalanceCombined)}
          highlight
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
        <span className="text-sm font-medium">Lọc NCC:</span>
        <SupplierMultiSelect options={supplierNames} value={selected} onChange={pushFilter} />
        {selected.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => pushFilter([])} disabled={pending}>
            Tất cả NCC
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Dữ liệu được nhập từ file Quản Lý Dự Án Xây Dựng (sheet &quot;Công Nợ&quot;).
        </span>
      </div>

      <DataGrid<DebtGridRow> columns={columns} rows={rows} handlers={{}} height={520} />
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"mt-1 text-base font-semibold " + (highlight ? "text-destructive" : "")}>
        {value || "—"}
      </div>
    </div>
  );
}
