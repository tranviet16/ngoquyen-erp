/**
 * Mảnh dùng chung cho ba báo cáo "Đối chiếu DT-HĐ-TT": định dạng số vi-VN, ô số, dòng đối soát
 * ✓ / ✗ kèm Δ, băng cảnh báo chưa cài đặt tỷ lệ và thanh công cụ In A4 + Xuất Excel.
 * Không có "use client" — dùng được trong Server Component (PrintButton tự là client).
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/export-buttons";
import type { RateSettings, TieOut } from "@/lib/du-an/dt-hd-tt/report-inputs";

const moneyFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const qtyFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });

/** Tiền: làm tròn đồng, 0 hoặc trống → "". */
export const money = (v: number | null | undefined): string => (v == null || Math.round(v) === 0 ? "" : moneyFmt.format(Math.round(v)));
/** Như `money` nhưng giữ "0" (dòng tổng, chênh lệch). */
export const moneyOrZero = (v: number | null | undefined): string => (v == null ? "" : moneyFmt.format(Math.round(v)));
export const qty = (v: number | null | undefined): string => (v == null ? "" : qtyFmt.format(v));
export const pct = (v: number | null | undefined): string => (v == null ? "" : pctFmt.format(v));

export const TH = "border px-2 py-1 text-left font-medium bg-muted/60 align-bottom";
export const TD = "border px-2 py-1 align-top";
export const TD_NUM = "border px-2 py-1 align-top text-right tabular-nums whitespace-nowrap print-nowrap";

/** Bảng có cuộn ngang trên màn hình; khi in, CSS in mở rộng hết khổ. */
export function ReportTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Dòng đối soát / kiểm tổng: "✓ nhãn" hoặc "✗ nhãn — lệch Δ" (Δ = thực tế − kỳ vọng). */
export function TieOutLine({ t }: { t: TieOut }) {
  const delta = t.actual - t.expected;
  return (
    <p className={t.ok ? "text-xs text-emerald-700" : "text-xs font-medium text-red-700"}>
      {t.ok ? "✓" : "✗"} {t.label}: {moneyOrZero(t.expected)}
      {t.ok ? "" : ` ≠ ${moneyOrZero(t.actual)} — lệch ${moneyOrZero(delta)}`}
    </p>
  );
}

export function SettingsBanner({ settings, projectId }: { settings: RateSettings; projectId: number }) {
  if (!settings.missing) return null;
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Công trình chưa cài đặt tỷ lệ — báo cáo đang dùng tỷ lệ mặc định (VAT {pct(settings.vatPct)}, chi phí chung{" "}
      {pct(settings.generalCostPct)}, nhà tạm {pct(settings.tempHousingPct)}, KL không xác định {pct(settings.unmeasuredPct)}, thu nhập
      tính trước {pct(settings.presumptiveIncomePct)}).{" "}
      <Link href={`/du-an/${projectId}/cai-dat`} className="no-print underline">
        Lưu Cài đặt
      </Link>
    </div>
  );
}

/** Tiêu đề báo cáo + In (mặc định A4 ngang) + Xuất Excel cùng số liệu. */
export function ReportToolbar({ title, subtitle, projectId, report }: { title: string; subtitle?: string; projectId: number; report: "dt-hd" | "dt-tt" | "hd-tt" }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        <a href={`/api/du-an/${projectId}/dt-hd-tt/export?report=${report}`} className="rounded border px-3 py-1.5 text-sm hover:bg-muted">
          Xuất Excel
        </a>
        <PrintButton label="In" defaultPageSize="a4" defaultOrientation="landscape" />
      </div>
    </div>
  );
}
