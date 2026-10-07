"use client";

/**
 * Bộ chọn mốc thời gian báo cáo công nợ dùng chung (Toàn bộ / Năm / Quý / Tháng / Tuần ISO /
 * Kỳ chuẩn 27→26 / Tuỳ chọn). Controlled: `value` là tham số URL chuẩn (`period`, `y`, `q`, `m`,
 * `w`, `from`, `to`); component KHÔNG đẩy URL, trang cha ghi URL khi bấm Xem / Áp dụng.
 */

import {
  isoWeekOf,
  isoWeekRange,
  resolveReportPeriod,
  weeksInIsoYear,
  REPORT_PERIOD_PRESETS,
  type ReportPeriodPreset,
  type ResolvedReportPeriod,
} from "@/lib/ledger/report-period";
import { DateInput } from "@/components/ui/date-input";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { Label } from "@/components/ui/label";

export type ReportPeriodValue = Record<string, string>;

const PRESET_LABELS: Record<ReportPeriodPreset, string> = {
  all: "Toàn bộ",
  year: "Năm",
  quarter: "Quý",
  month: "Tháng",
  week: "Tuần (ISO)",
  ncc: "Kỳ chuẩn 27→26",
  custom: "Tuỳ chọn",
};

const SELECT_CLS =
  "h-10 rounded-md border border-input bg-background text-foreground px-3 text-sm";

interface Props {
  value: ReportPeriodValue;
  onChange: (next: ReportPeriodValue) => void;
  /** Giới hạn các preset hiển thị; mặc định tất cả. */
  presets?: readonly ReportPeriodPreset[];
}

/** Giải `value` thành cửa sổ (hoặc lỗi) bằng đúng module server dùng. */
export function resolvePeriodValue(
  value: ReportPeriodValue
): ResolvedReportPeriod | { error: string } {
  return resolveReportPeriod(value, { defaultPreset: "all", legacyMode: "cutoff", today: new Date() });
}

/** Giá trị khởi tạo cho một preset, dựa trên ngày hiện tại. */
function defaultsFor(preset: ReportPeriodPreset): ReportPeriodValue {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  switch (preset) {
    case "year":
      return { period: preset, y: String(y) };
    case "quarter":
      return { period: preset, y: String(y), q: String(Math.floor((m - 1) / 3) + 1) };
    case "month":
    case "ncc":
      return { period: preset, y: String(y), m: String(m) };
    case "week": {
      const w = isoWeekOf(now);
      return { period: preset, y: String(w.year), w: String(w.week) };
    }
    default:
      return { period: preset };
  }
}

function yearOptions(selected: number): number[] {
  const cur = new Date().getFullYear();
  const lo = Math.min(cur - 5, selected);
  const hi = Math.max(cur + 1, selected);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

function fmtDm(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function ReportPeriodSelector({ value, onChange, presets = REPORT_PERIOD_PRESETS }: Props) {
  const preset = (REPORT_PERIOD_PRESETS as readonly string[]).includes(value.period)
    ? (value.period as ReportPeriodPreset)
    : "all";
  const resolved = resolvePeriodValue({ ...value, period: preset });
  const set = (patch: Record<string, string>) => onChange({ ...value, period: preset, ...patch });

  const year = Number(value.y) || new Date().getFullYear();
  const month = Number(value.m) || new Date().getMonth() + 1;
  const week = Number(value.w) || 1;

  function renderYearSelect(label: string, current: number, onPick: (y: number) => void) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        <select
          className={SELECT_CLS}
          value={current}
          onChange={(e) => onPick(Number(e.target.value))}
        >
          {yearOptions(current).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Mốc thời gian</Label>
          <select
            className={SELECT_CLS}
            value={preset}
            onChange={(e) => onChange(defaultsFor(e.target.value as ReportPeriodPreset))}
          >
            {presets.map((p) => (
              <option key={p} value={p}>{PRESET_LABELS[p]}</option>
            ))}
          </select>
        </div>

        {preset === "year" && renderYearSelect("Năm", year, (y) => set({ y: String(y) }))}

        {preset === "quarter" && (
          <>
            {renderYearSelect("Năm", year, (y) => set({ y: String(y) }))}
            <div className="flex flex-col gap-1.5">
              <Label>Quý</Label>
              <select
                className={SELECT_CLS}
                value={Number(value.q) || 1}
                onChange={(e) => set({ q: e.target.value })}
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>Quý {q}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {(preset === "month" || preset === "ncc") && (
          <div className="flex flex-col gap-1.5">
            <Label>{preset === "ncc" ? "Kỳ chuẩn của tháng" : "Tháng / Năm"}</Label>
            <MonthYearPicker
              year={year}
              month={month}
              onChange={(y, m) => set({ y: String(y), m: String(m) })}
            />
          </div>
        )}

        {preset === "week" && (
          <>
            {renderYearSelect("Năm ISO", year, (y) =>
              set({ y: String(y), w: String(Math.min(week, weeksInIsoYear(y))) })
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Tuần</Label>
              <select
                className={SELECT_CLS}
                value={week}
                onChange={(e) => set({ w: e.target.value })}
              >
                {Array.from({ length: weeksInIsoYear(year) }, (_, i) => i + 1).map((w) => {
                  const r = isoWeekRange(year, w);
                  return (
                    <option key={w} value={w}>
                      {r ? `T${w} · ${fmtDm(r.from)}–${fmtDm(r.to)}` : `T${w}`}
                    </option>
                  );
                })}
              </select>
            </div>
          </>
        )}

        {preset === "custom" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Từ ngày</Label>
              <DateInput value={value.from ?? ""} onChange={(iso) => set({ from: iso })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Đến ngày</Label>
              <DateInput value={value.to ?? ""} onChange={(iso) => set({ to: iso })} />
            </div>
          </>
        )}
      </div>

      {"error" in resolved ? (
        <p role="alert" className="text-xs text-destructive">{resolved.error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Kỳ xem: <span className="font-medium text-foreground">{resolved.label}</span>
          {preset === "ncc" && " (cửa sổ chung, không thay cho kỳ chốt riêng từng NCC)"}
        </p>
      )}
    </div>
  );
}
