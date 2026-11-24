/**
 * Dòng kiểm tổng của màn HĐ-TT (phần của hd-tt-screen.tsx; bản in giữ `TieOutLine` của `HdTtView`):
 *   - kiểm khớp → một dòng chữ nhạt; lệch → huy hiệu "Lệch đối soát", kỳ vọng ≠ thực tế — lệch Δ;
 *   - Σ T lệch mà có dòng đang lưu S ngoài quy tắc (`splitBlockers`, vd. số import) → thêm "do S ở dòng {NCC}",
 *     mỗi tên link tới lưới NCC của Đầu mối lọc theo tên (ở đó S vẫn sửa được vì action lưu không đổi);
 *   - giải thích Σ T khác Σ thực tế đầu mối NCC (phần tạm = HĐ, đầu mối không có NCC xuất HĐ), như bản in.
 * Hook đo: `data-hd-tt-checks`, `data-split-blockers`.
 */

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import type { HdTtReport } from "@/lib/du-an/dt-hd-tt/hd-tt-report";
import { isActualCheck, type HdTtScreenRow } from "@/lib/du-an/dt-hd-tt/hd-tt-screen-model";
import type { TieOut } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { DAU_MOI_ANCHORS, dauMoiQuery, screenHref } from "@/lib/du-an/dt-hd-tt/screen-links";
import { moneyOrZero } from "./report-bits";

function CheckLine({ t, cause }: { t: TieOut; cause?: ReactNode }) {
  if (t.ok) return <p className="text-xs text-muted-foreground">Kiểm tổng khớp — {t.label}: {moneyOrZero(t.expected)}</p>;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-red-700 dark:text-red-300">
      <StatusBadge tone="danger" label="Lệch đối soát" />
      <span>
        {t.label}: {moneyOrZero(t.expected)} ≠ {moneyOrZero(t.actual)} — lệch {moneyOrZero(t.actual - t.expected)}
        {cause}
      </span>
    </p>
  );
}

function SplitCause({ projectId, rows }: { projectId: number; rows: readonly HdTtScreenRow[] }) {
  return (
    <span data-split-blockers={rows.length}>
      {" "}— do S ở dòng{" "}
      {rows.map((r, i) => (
        <Fragment key={r.supplierId}>
          {i > 0 && ", "}
          <Link
            href={screenHref(projectId, "dau-moi", { query: dauMoiQuery({ supplierName: r.supplierName }), hash: DAU_MOI_ANCHORS.ncc })}
            className="font-medium underline underline-offset-2"
            title="Sửa S ở lưới NCC của trang Đầu mối"
          >
            {r.supplierName}
          </Link>
        </Fragment>
      ))}
      {" "}(S chỉ giữ Σ T khớp ở NCC sau của đầu mối nhiều NCC đã chốt thực tế)
    </span>
  );
}

export function HdTtScreenChecks({ projectId, report, blockers }: { projectId: number; report: HdTtReport; blockers: readonly HdTtScreenRow[] }) {
  const gap = report.actualGap;
  return (
    <div className="space-y-1" data-hd-tt-checks="">
      {report.checks.map((c) => (
        <CheckLine key={c.label} t={c} cause={!c.ok && isActualCheck(c) && blockers.length > 0 ? <SplitCause projectId={projectId} rows={blockers} /> : undefined} />
      ))}
      {(Math.round(gap.temporaryFromInvoices) !== 0 || gap.counterpartiesWithoutRows.length > 0) && (
        <div className="text-xs text-muted-foreground">
          <p>Σ T khác Σ thực tế các đầu mối NCC vì:</p>
          <ul className="list-disc pl-5">
            {Math.round(gap.temporaryFromInvoices) !== 0 && (
              <li>{moneyOrZero(gap.temporaryFromInvoices)} của các đầu mối chưa chốt thực tế đang tạm lấy bằng HĐ;</li>
            )}
            {gap.counterpartiesWithoutRows.map((c) => (
              <li key={c.name}>đầu mối {c.name} ({moneyOrZero(c.actual)}) không có NCC xuất HĐ nên không có dòng ở bảng này;</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
