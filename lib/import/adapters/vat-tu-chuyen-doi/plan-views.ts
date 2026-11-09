/**
 * Phần hiển thị thuần của màn xem trước dựng thẳng từ kết quả parse: tóm tắt gói và quyết định ngày
 * (ô mơ hồ, ô không đọc được / trống — kèm chữ gốc và khối). Module thuần.
 */

import type { ImportMapping } from "../adapter-types";
import { dateDecisionKey } from "./date-settlement";
import { isoDay } from "./day-utils";
import type { DateDecisionView, SummaryView } from "./review-payload-types";
import type { CutoverBundleParseResult, SourceRef } from "./types";

const DATE_ERROR_CODES = new Set(["date-invalid", "date-missing"]);

export function isDateBlockingCode(code: string): boolean {
  return DATE_ERROR_CODES.has(code) || code === "date-choice-invalid";
}

function where(ref: SourceRef): string {
  return ref.sheet ? `${ref.file} ${ref.sheet}!${ref.cell}` : ref.file;
}

export function buildSummary(parse: CutoverBundleParseResult): SummaryView {
  const nl = parse.mainFile?.nhapLieu;
  const rows = nl?.rows ?? [];
  return {
    files: {
      main: parse.mainFile?.file ?? null,
      csv: parse.csv?.file ?? null,
      tracking: parse.trackingFiles.length,
      skipped: parse.skipped,
    },
    nhapLieu: {
      read: nl?.readRowCount ?? 0,
      layHang: rows.filter((r) => r.transactionType === "lay_hang").length,
      thueHd: rows.filter((r) => r.transactionType === "thue_hd").length,
      thanhToan: rows.filter((r) => r.transactionType === "thanh_toan").length,
      afterCutover: rows.filter((r) => r.afterCutover).length,
      skipped: (nl?.skipped ?? []).map((s) => ({ sourceKey: s.sourceKey, reason: s.reason })),
    },
    openingRows: parse.mainFile?.openingBalances.length ?? 0,
    csvRows: parse.csv?.rows.length ?? 0,
    csvSkipped: (parse.csv?.skipped ?? []).map((s) => ({ sourceKey: s.sourceKey, reason: s.reason })),
    deliveries: {
      kept: parse.deliveries.length,
      duplicatesMerged: parse.deliveries.reduce((s, d) => s + d.duplicates.length, 0),
      fromDailySheet: parse.deliveries.filter((d) => d.source === "vat-tu-ngay").length,
      pendingDate: parse.deliveries.filter((d) => d.date === null).length,
    },
    dateFixes: parse.warnings.filter((w) => w.code === "date-year-fixed" || w.code === "nl-year-fixed").length,
    warnings: parse.warnings.map((w) => ({ code: w.code, level: w.level, message: w.message, where: where(w.ref) })),
  };
}

export function buildDateViews(parse: CutoverBundleParseResult, mapping: ImportMapping): DateDecisionView[] {
  const views: DateDecisionView[] = [];
  const seen = new Set<string>();
  const chosenOf = (key: string) => {
    const v = mapping[key];
    return typeof v === "string" ? v : null;
  };
  for (const d of parse.dateDecisions) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    views.push({
      key: d.key,
      file: d.ref.file,
      sheet: d.ref.sheet,
      cell: d.ref.cell,
      raw: d.ref.raw,
      context: d.context,
      candidates: d.candidates.map(isoDay),
      chosen: d.chosen ? isoDay(d.chosen) : null,
      kind: "decision",
      message: `Ngày mơ hồ (${d.reason})`,
    });
  }
  const invalid = [
    ...parse.blockingErrors.filter((e) => DATE_ERROR_CODES.has(e.code)),
    ...parse.warnings.filter((w) => w.code === "date-chosen-for-invalid"),
  ];
  for (const e of invalid) {
    const key = dateDecisionKey(e.ref);
    if (seen.has(key)) continue;
    seen.add(key);
    views.push({
      key,
      file: e.ref.file,
      sheet: e.ref.sheet,
      cell: e.ref.cell,
      raw: e.ref.raw,
      context: e.message,
      candidates: [],
      chosen: chosenOf(key),
      kind: e.ref.raw ? "invalid" : "missing",
      message: e.message,
    });
  }
  return views;
}

/** Lỗi chặn về ngày: ô mơ hồ chưa chọn + lỗi ngày của parser. */
export function dateBlocking(parse: CutoverBundleParseResult): string[] {
  const out: string[] = [];
  for (const d of parse.dateDecisions) {
    if (!d.chosen) out.push(`Chưa chọn ngày cho ô ${where(d.ref)} "${d.ref.raw ?? ""}" (${d.context})`);
  }
  for (const e of parse.blockingErrors) {
    if (isDateBlockingCode(e.code)) out.push(`${where(e.ref)}: ${e.message}`);
  }
  return out;
}
