"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PendingDeliveriesNotice } from "@/components/du-an/pending-deliveries-notice";
import { formatNumber } from "@/lib/utils/format";
import type { PairTotals } from "@/lib/du-an/contract-detail/list-figures";
import type { PendingSummary } from "@/lib/du-an/project-ledger/supplier-balances";
import type { ProjectSupplierBalance } from "@/lib/du-an/project-ledger/project-ledger-loader";
import { SupplierMultiSelect } from "./supplier-multi-select";

interface Props {
  projectId: number;
  suppliers: ProjectSupplierBalance[];
  options: { id: number; name: string }[];
  totals: PairTotals;
  pending: PendingSummary;
  /** Mã NCC đang lọc (`?ncc=`); rỗng = mọi NCC. */
  selected: number[];
  /** Có quyền Vật tư NCC → hiện link mở sổ NCC. */
  canOpenSupplierBook: boolean;
}

const AMOUNT_COLS = [
  ["openingTt", "Đầu kỳ"],
  ["phatSinhTt", "Phát sinh"],
  ["daTraTt", "Đã trả"],
  ["cuoiKyTt", "Còn nợ"],
  ["openingHd", "Đầu kỳ"],
  ["phatSinhHd", "Phát sinh"],
  ["daTraHd", "Đã trả"],
  ["cuoiKyHd", "Còn nợ"],
] as const satisfies readonly (readonly [keyof PairTotals, string])[];

const CELL = "px-3 py-1.5 border text-right tabular-nums";

export function CongNoClient({ projectId, suppliers, options, totals, pending, selected, canOpenSupplierBook }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [navigating, startTransition] = useTransition();
  const filtered = selected.length > 0;

  const pushFilter = (next: number[]) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (next.length > 0) params.set("ncc", next.join(","));
    else params.delete("ncc");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `?${qs}` : "?"));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Số NCC" value={String(suppliers.length)} />
        <SummaryCard label="Phát sinh TT" value={formatNumber(totals.phatSinhTt)} />
        <SummaryCard label="Còn nợ TT" value={formatNumber(totals.cuoiKyTt)} highlight />
        <SummaryCard label="Còn nợ HĐ" value={formatNumber(totals.cuoiKyHd)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
        <span className="text-sm font-medium">Lọc NCC:</span>
        <SupplierMultiSelect
          options={options.map((o) => ({ id: o.id, label: o.name }))}
          value={selected}
          onChange={pushFilter}
        />
        {filtered && (
          <Button variant="outline" size="sm" onClick={() => pushFilter([])} disabled={navigating}>
            Tất cả NCC
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Nguồn: sổ Công nợ vật tư, lũy kế toàn bộ, cộng mọi Chủ thể. Từng dòng sổ xem ở tab Giao Dịch.
        </span>
        {canOpenSupplierBook && (
          <Link href={`/vat-tu-ncc/cong-trinh/${projectId}`} className="text-xs font-medium text-primary hover:underline">
            Theo công trình →
          </Link>
        )}
      </div>

      <PendingDeliveriesNotice count={pending.count} unpricedCount={pending.unpricedCount} />

      {suppliers.length === 0 ? (
        <p className="rounded-md border py-8 text-center text-sm text-muted-foreground">
          {filtered ? (
            "Không có NCC nào khớp bộ lọc."
          ) : (
            <>
              Công trình chưa có công nợ nhà cung cấp trong sổ Công nợ vật tư. Giao dịch nhập tay của công trình (nếu
              có) xem ở{" "}
              <Link href={`/du-an/${projectId}/giao-dich?nguon=so-du-an`} className="font-medium text-primary hover:underline">
                Giao Dịch (Sổ dự án)
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted text-xs font-semibold uppercase tracking-wide">
                <th rowSpan={2} className="sticky left-0 z-10 min-w-[200px] border bg-muted px-3 py-2 text-left">
                  Nhà cung cấp
                </th>
                <th colSpan={4} className="border px-3 py-2 text-center">Thực tế (TT)</th>
                <th colSpan={4} className="border px-3 py-2 text-center">Hóa đơn (HĐ)</th>
                <th rowSpan={2} className="min-w-[90px] border px-3 py-2 text-right">Phiếu chưa chốt</th>
              </tr>
              <tr className="bg-muted text-xs font-semibold uppercase tracking-wide">
                {AMOUNT_COLS.map(([key, label]) => (
                  <th key={key} className="min-w-[110px] border px-3 py-2 text-right">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.supplierId} className="hover:bg-muted/40">
                  <td className="sticky left-0 z-10 border bg-background px-3 py-1.5">
                    <div>
                      {s.supplierName}
                      {s.supplierDeleted && <span className="ml-1 text-xs text-muted-foreground">(đã xóa khỏi danh mục)</span>}
                    </div>
                    {canOpenSupplierBook && !s.supplierDeleted && (
                      <Link
                        href={`/vat-tu-ncc/${s.supplierId}/ngay?projectId=${projectId}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Mở sổ NCC
                      </Link>
                    )}
                  </td>
                  {AMOUNT_COLS.map(([key]) => (
                    <td key={key} className={CELL}>{formatNumber(s[key])}</td>
                  ))}
                  <td className={CELL}>
                    {s.pendingCount > 0 && (
                      <span title={s.unpricedCount > 0 ? `${s.unpricedCount} phiếu chưa có giá` : undefined}>
                        {s.pendingCount}
                        {s.unpricedCount > 0 && "*"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td className="sticky left-0 z-10 border bg-muted px-3 py-1.5 text-left">
                  {filtered ? "Tổng các NCC đang lọc" : "Tổng"}
                </td>
                {AMOUNT_COLS.map(([key]) => (
                  <td key={key} className={CELL}>{formatNumber(totals[key])}</td>
                ))}
                <td className={CELL}>{pending.count > 0 ? pending.count : ""}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"mt-1 text-base font-semibold tabular-nums " + (highlight ? "text-destructive" : "")}>{value}</div>
    </div>
  );
}
