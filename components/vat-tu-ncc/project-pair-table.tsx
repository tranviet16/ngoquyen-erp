"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useSortableRows } from "@/components/sortable-table/use-sortable-rows";
import { formatDate, formatNumber, formatVND } from "@/lib/utils/format";
import type { PairPeriodStatus, ProjectPairRow } from "@/lib/vat-tu-ncc/project-overview-service";

interface Props {
  projectId: number;
  pairs: ProjectPairRow[];
  /** Hiện cột nợ TT/HĐ (người dùng có quyền đọc cong-no-vt). */
  debtVisible: boolean;
  /** Hiện liên kết tab Thanh toán (cùng điều kiện với layout NCC). */
  showPaymentLink: boolean;
  /** NCC chưa có hoạt động ở công trình — để mở cặp mới (nhập phiếu đầu tiên). */
  otherSuppliers: { id: number; name: string }[];
}

const STATUS_LABEL: Record<PairPeriodStatus, string> = {
  cutover: "Kỳ chuyển đổi (khóa)",
  signed: "Đã ký",
  unsigned: "Chưa ký",
};

const STATUS_CLASS: Record<PairPeriodStatus, string> = {
  cutover: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  signed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  unsigned: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

const selectClass = "h-8 max-w-xs rounded-md border border-input bg-transparent px-2 text-sm";

/** Các NCC của một công trình — liên kết dẫn sang trang NCC hiện có với `?projectId=`. */
export function ProjectPairTable({ projectId, pairs, debtVisible, showPaymentLink, otherSuppliers }: Props) {
  const router = useRouter();
  const [newSupplier, setNewSupplier] = useState("");
  const columns = useMemo(() => ({
    supplier: { accessor: (r: ProjectPairRow) => r.supplierName, kind: "text" as const },
    deliveries: { accessor: (r: ProjectPairRow) => r.deliveryCount, kind: "number" as const },
    lastDelivery: { accessor: (r: ProjectPairRow) => r.lastDeliveryDate, kind: "date" as const },
    period: { accessor: (r: ProjectPairRow) => r.latestPeriod?.periodTo ?? null, kind: "date" as const },
    debtTt: { accessor: (r: ProjectPairRow) => (r.debt ? Number(r.debt.tt) : null), kind: "currency" as const },
    debtHd: { accessor: (r: ProjectPairRow) => (r.debt ? Number(r.debt.hd) : null), kind: "currency" as const },
  }), []);
  const { sort, sortedRows, toggleSort } = useSortableRows(pairs, columns);
  const pairHref = (supplierId: number, tab: string) => `/vat-tu-ncc/${supplierId}/${tab}?projectId=${projectId}`;

  const totals = useMemo(() => {
    if (!debtVisible) return null;
    return pairs.reduce(
      (acc, r) => ({ tt: acc.tt + Number(r.debt?.tt ?? 0), hd: acc.hd + Number(r.debt?.hd ?? 0) }),
      { tt: 0, hd: 0 },
    );
  }, [pairs, debtVisible]);
  const colCount = 5 + (debtVisible ? 2 : 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <SortableTableHead column="supplier" label="Nhà cung cấp" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="deliveries" label="Số phiếu" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
              <SortableTableHead column="lastDelivery" label="Phiếu gần nhất" sort={sort} onToggle={toggleSort} className="font-medium" />
              <SortableTableHead column="period" label="Kỳ gần nhất" sort={sort} onToggle={toggleSort} className="font-medium" />
              {debtVisible && (
                <>
                  <SortableTableHead column="debtTt" label="Còn nợ TT" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
                  <SortableTableHead column="debtHd" label="Còn nợ HĐ" sort={sort} onToggle={toggleSort} align="right" className="font-medium" />
                </>
              )}
              <th className="px-3 py-2 font-medium">Mở</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-muted-foreground">
                  Công trình chưa có NCC nào có phiếu hoặc sổ vật tư.
                </td>
              </tr>
            )}
            {sortedRows.map((r) => (
              <tr key={r.supplierId} className="border-t align-top">
                <td className="px-3 py-2 font-medium">
                  <Link href={pairHref(r.supplierId, "ngay")} className="hover:underline">{r.supplierName}</Link>
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(r.deliveryCount)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.lastDeliveryDate)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.latestPeriod ? (
                    <Link href={pairHref(r.supplierId, `doi-chieu/${r.latestPeriod.id}`)} className="inline-flex items-center gap-2 hover:underline">
                      <span>{formatDate(r.latestPeriod.periodFrom)} – {formatDate(r.latestPeriod.periodTo)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.latestPeriod.status]}`}>
                        {STATUS_LABEL[r.latestPeriod.status]}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Chưa có kỳ</span>
                  )}
                </td>
                {debtVisible && (
                  <>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatVND(Number(r.debt?.tt ?? 0))}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatVND(Number(r.debt?.hd ?? 0))}</td>
                  </>
                )}
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <Link href={pairHref(r.supplierId, "ngay")} className="text-primary hover:underline">Vật tư ngày</Link>
                    <Link href={pairHref(r.supplierId, "thang")} className="text-primary hover:underline">Tháng</Link>
                    <Link href={pairHref(r.supplierId, "chot-ky")} className="text-primary hover:underline">Chốt kỳ</Link>
                    <Link href={pairHref(r.supplierId, "doi-chieu")} className="text-primary hover:underline">Đối chiếu</Link>
                    {showPaymentLink && (
                      <Link href={pairHref(r.supplierId, "thanh-toan")} className="text-primary hover:underline">Thanh toán</Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {totals && pairs.length > 0 && (
            <tfoot className="border-t bg-muted/30">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right font-medium">Cộng công trình:</td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatVND(totals.tt)}</td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatVND(totals.hd)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {otherSuppliers.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (newSupplier) router.push(pairHref(Number(newSupplier), "ngay"));
          }}
        >
          <label htmlFor="project-pair-new-supplier" className="text-muted-foreground">
            Nhập phiếu cho NCC khác:
          </label>
          <select
            id="project-pair-new-supplier"
            className={selectClass}
            value={newSupplier}
            onChange={(e) => setNewSupplier(e.target.value)}
          >
            <option value="">— Chọn NCC —</option>
            {otherSuppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline" disabled={!newSupplier}>
            Mở
          </Button>
        </form>
      )}
    </div>
  );
}
