/**
 * Dòng nguồn của khóa đang mở trong ô gán Ánh xạ (tối đa 20, đọc riêng bằng `loadAliasSourceLines`):
 * NCC / đầu mối, số HĐ, SL, đơn giá, thành tiền. Số HĐ của dòng hóa đơn mở sổ Hóa đơn lọc đúng NCC + số
 * HĐ đó (link dựng bằng builder của screen-links). Móc kiểm thử: `data-source-lines` (khóa),
 * `data-source-line-count`, `data-source-line` (id dòng).
 */

import Link from "next/link";
import { vndFormatter } from "@/lib/format";
// Chỉ kiểu: module loader đọc Prisma, không được vào bundle client.
import type { AliasSourceLine } from "@/lib/du-an/dt-hd-tt/alias-source-lines";
import { hoaDonQuery, screenHref } from "@/lib/du-an/dt-hd-tt/screen-links";

const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 });
const qtyText = (v: number | null) => (v === null ? "" : numberFormatter.format(v));
const moneyText = (v: number | null) => (v === null ? "" : vndFormatter(v));

interface Props {
  projectId: number;
  source: "hd" | "tt";
  itemKey: string;
  lines: readonly AliasSourceLine[];
  /** Số dòng nguồn của khóa trên bảng (có thể hơn số dòng hiện). */
  lineCount: number;
}

export function AnhXaSourceLines({ projectId, source, itemKey, lines, lineCount }: Props) {
  const isHd = source === "hd";
  const shown = lines.length < lineCount ? `${lines.length} / ${lineCount} dòng đầu` : `${lines.length} dòng`;
  return (
    <div className="border-t bg-muted/20 px-3 py-2" data-source-lines={itemKey} data-source-line-count={lines.length}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">Dòng nguồn ({shown})</p>
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">Không còn dòng nào mang tên|ĐVT này.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-0.5 pr-2 font-normal">{isHd ? "NCC" : "Đầu mối"}</th>
              {isHd && <th className="py-0.5 pr-2 font-normal">Số HĐ</th>}
              <th className="py-0.5 pr-2 text-right font-normal">SL</th>
              <th className="py-0.5 pr-2 text-right font-normal">Đơn giá</th>
              <th className="py-0.5 text-right font-normal">{isHd ? "Thành tiền chưa VAT" : "Thành tiền gồm VAT"}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-border/50" data-source-line={l.id}>
                <td className="max-w-64 truncate py-0.5 pr-2" title={l.party ?? undefined}>{l.party ?? <span className="text-muted-foreground">(chưa gắn)</span>}</td>
                {isHd && (
                  <td className="py-0.5 pr-2">
                    {l.supplierId !== null && l.invoiceNo ? (
                      <Link
                        href={screenHref(projectId, "hoa-don", { query: hoaDonQuery({ supplierId: l.supplierId, invoiceNo: l.invoiceNo }) })}
                        className="text-primary hover:underline"
                        title="Mở sổ Hóa đơn, lọc đúng NCC và số HĐ này"
                      >
                        {l.invoiceNo}
                      </Link>
                    ) : (
                      l.invoiceNo
                    )}
                  </td>
                )}
                <td className="py-0.5 pr-2 text-right tabular-nums">{qtyText(l.qty)}</td>
                <td className="py-0.5 pr-2 text-right tabular-nums">{moneyText(l.unitPrice)}</td>
                <td className="py-0.5 text-right tabular-nums">{vndFormatter(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
