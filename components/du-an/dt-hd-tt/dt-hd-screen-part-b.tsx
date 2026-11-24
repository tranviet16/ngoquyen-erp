/**
 * Phần B của màn DT-HĐ: hóa đơn chưa nằm trong dự toán, tách hai danh sách theo `outsideReason`
 *   - "Chưa gán": mỗi dòng có link "Gán ở Ánh xạ" mở ĐÚNG khóa tên|ĐVT mà engine đã xếp xuống Phần B
 *     (`anh-xa?tab=hd&key=…`, builder của screen-links). Khóa đọc ở trang theo id dòng HĐ;
 *   - "Ngoài DT": đã quyết định nằm ngoài dự toán, chỉ xem.
 * Số tiền duy nhất ở mức Phần B là `partBTotal` của báo cáo; từng dòng hiện số tiền của chính nó.
 * Hai danh sách thu gọn mặc định để trang mở ra ngắn.
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { DtHdInvoiceRow, DtHdReport } from "@/lib/du-an/dt-hd-tt/dt-hd-report";
import { splitPartB } from "@/lib/du-an/dt-hd-tt/dt-hd-screen-model";
import { anhXaQuery, screenHref } from "@/lib/du-an/dt-hd-tt/screen-links";
import { CollapsibleSection, money, moneyOrZero, qty, TD, TD_NUM, TH } from "./report-bits";

const HEAD = ["NCC", "Số HĐ", "Tên hàng", "ĐVT", "SL", "Số tiền chưa VAT"];

function LinesTable({ lines, link }: { lines: DtHdInvoiceRow[]; link?: (i: DtHdInvoiceRow) => string | null }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {HEAD.map((h) => (
            <th key={h} className={TH}>{h}</th>
          ))}
          {link && <th className={TH} />}
        </tr>
      </thead>
      <tbody>
        {lines.map((i) => {
          const href = link?.(i) ?? null;
          return (
            <tr key={i.invoiceLineId} data-part-b-line={i.outsideReason ?? ""}>
              <td className={TD}>{i.supplierName}</td>
              <td className={TD}>{i.invoiceNo || "—"}</td>
              <td className={TD}>{i.itemName}</td>
              <td className={TD}>{i.unit}</td>
              <td className={TD_NUM}>{qty(i.qty)}</td>
              <td className={TD_NUM}>{money(i.amount)}</td>
              {link && (
                <td className={TD}>
                  {href && (
                    <Link href={href} data-part-b-link="" className="inline-flex items-center gap-0.5 whitespace-nowrap text-primary hover:underline">
                      Gán ở Ánh xạ
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function DtHdScreenPartB({
  projectId,
  report,
  partBKeys,
}: {
  projectId: number;
  report: Pick<DtHdReport, "partB" | "partBTotal">;
  /** Khóa tên|ĐVT đang lưu của từng dòng HĐ "Chưa gán", theo id dòng. */
  partBKeys: Readonly<Record<number, string>>;
}) {
  const { chuaGan, ngoaiDt } = splitPartB(report);
  const anhXaHref = (i: DtHdInvoiceRow): string | null => {
    const key = partBKeys[i.invoiceLineId];
    return key ? screenHref(projectId, "anh-xa", { query: anhXaQuery({ tab: "hd", key }) }) : null;
  };
  return (
    <section className="space-y-2" data-dt-hd-part-b={`${chuaGan.length}/${ngoaiDt.length}`}>
      <h3 className="text-sm font-semibold">
        B. Hóa đơn ngoài dự toán / chưa gán dòng dự toán
        <span className="font-normal text-muted-foreground"> · Cộng Phần B (chưa VAT) </span>
        <span className="tabular-nums">{moneyOrZero(report.partBTotal)}</span>
      </h3>
      {chuaGan.length + ngoaiDt.length === 0 ? (
        <p className="text-xs text-muted-foreground">Không có.</p>
      ) : (
        <>
          {chuaGan.length > 0 && (
            <CollapsibleSection title="Chưa gán" summary={`${chuaGan.length} dòng · bấm "Gán ở Ánh xạ" để mở đúng khóa của dòng`}>
              <LinesTable lines={chuaGan} link={anhXaHref} />
            </CollapsibleSection>
          )}
          {ngoaiDt.length > 0 && (
            <CollapsibleSection title="Ngoài DT" summary={`${ngoaiDt.length} dòng · đã quyết định nằm ngoài dự toán`}>
              <LinesTable lines={ngoaiDt} />
            </CollapsibleSection>
          )}
        </>
      )}
    </section>
  );
}
