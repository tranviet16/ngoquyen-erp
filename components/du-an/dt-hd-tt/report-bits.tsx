/**
 * Mảnh dùng chung cho ba báo cáo "Đối chiếu DT-HĐ-TT": định dạng số vi-VN, ô số, dòng đối soát
 * ✓ / ✗ kèm Δ, băng cảnh báo chưa cài đặt tỷ lệ và thanh công cụ In A4 + Xuất Excel; cùng các mảnh của
 * màn hình (Tổng quan và màn báo cáo): chip lọc, dòng "đang lọc: hiện n / m dòng" và đầu mục thu gọn.
 * Không có "use client" — dùng được trong Server Component (PrintButton tự là client).
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode, SyntheticEvent } from "react";
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

export type ReportKey = "dt-hd" | "dt-tt" | "hd-tt";

/** Link tải Excel của một báo cáo (cùng số liệu với màn hình). */
export const reportExportHref = (projectId: number, report: ReportKey): string => `/api/du-an/${projectId}/dt-hd-tt/export?report=${report}`;

/** Tiêu đề báo cáo + In (mặc định A4 ngang) + Xuất Excel cùng số liệu. */
export function ReportToolbar({ title, subtitle, projectId, report }: { title: string; subtitle?: string; projectId: number; report: ReportKey }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        <a href={reportExportHref(projectId, report)} className="rounded border px-3 py-1.5 text-sm hover:bg-muted">
          Xuất Excel
        </a>
        <PrintButton label="In" defaultPageSize="a4" defaultOrientation="landscape" />
      </div>
    </div>
  );
}

/**
 * Thứ tự của trang báo cáo có màn hình riêng: thanh công cụ, băng cài đặt, màn hình (`print:hidden`), rồi
 * bản in (`hidden print:block`, `data-print-view`) là con CUỐI. Tailwind v4 `space-y-*` đặt lề dưới cho
 * mọi con trừ con cuối, và khi in màn hình không có hộp — nên trên giấy khoảng cách y như trang chỉ có
 * bản in. View in bên trong giữ nguyên từng byte.
 */
export function ReportPageLayout({ toolbar, banner, screen, print }: { toolbar: ReactNode; banner: ReactNode; screen: ReactNode; print: ReactNode }) {
  return (
    <div className="space-y-4">
      {toolbar}
      {banner}
      <div className="print:hidden" data-report-screen="">
        {screen}
      </div>
      <div className="hidden print:block" data-print-view="">
        {print}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mảnh của màn hình (không dùng trong bản in)
// ---------------------------------------------------------------------------

const CHIP = "no-print inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors";
const CHIP_ON = "border-primary bg-primary text-primary-foreground";
const CHIP_OFF = "bg-background text-muted-foreground hover:bg-muted hover:text-foreground";

/**
 * Chip lọc "nhãn n". Có `href` → link (Server Component dùng được); không có → nút, màn client tự xử lý
 * `onClick`. `active` = bộ lọc đang bật.
 */
export function FilterChip({
  label,
  count,
  active = false,
  href,
  onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const className = `${CHIP} ${active ? CHIP_ON : CHIP_OFF}`;
  const body = (
    <>
      {label}
      {count !== undefined && <span className="tabular-nums opacity-80">{count}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-current={active ? "true" : undefined} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/** Dòng "Đang lọc: hiện n / m dòng · Bỏ lọc"; không lọc thì không hiện gì. */
export function ActiveFilterLine({
  active,
  shown,
  total,
  clearHref,
  onClear,
}: {
  active: boolean;
  shown: number;
  total: number;
  clearHref?: string;
  onClear?: () => void;
}) {
  if (!active) return null;
  const clear = clearHref ? (
    <Link href={clearHref} className="underline hover:text-foreground">Bỏ lọc</Link>
  ) : onClear ? (
    <button type="button" onClick={onClear} className="underline hover:text-foreground">Bỏ lọc</button>
  ) : null;
  return (
    <p className="no-print text-xs text-muted-foreground" data-active-filter={`${shown}/${total}`}>
      Đang lọc: hiện <span className="tabular-nums">{shown}</span> / <span className="tabular-nums">{total}</span> dòng
      {clear && <> · {clear}</>}
    </p>
  );
}

/**
 * Mục thu gọn được, dựng trên `<details>` của trình duyệt — chạy được cả ở Server Component, không cần
 * JS. Màn client muốn giữ trạng thái mở (vd. trên URL) thì truyền `open` + `onToggle`.
 */
export function CollapsibleSection({
  id,
  title,
  summary,
  open,
  onToggle,
  className,
  children,
}: {
  id?: string;
  title: ReactNode;
  summary?: ReactNode;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={open}
      onToggle={onToggle ? (e: SyntheticEvent<HTMLDetailsElement>) => onToggle(e.currentTarget.open) : undefined}
      className={`group scroll-mt-4 ${className ?? ""}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded py-1 text-sm hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
        <span className="font-semibold">{title}</span>
        {summary && <span className="text-xs text-muted-foreground">{summary}</span>}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
