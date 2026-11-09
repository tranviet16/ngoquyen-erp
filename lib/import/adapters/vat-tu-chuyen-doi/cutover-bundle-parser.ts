/**
 * Điểm vào của parser chuyển đổi: nhận cả gói thư mục `Quản Lý Công Nợ` ({path, buffer}),
 * trả file tổng, CSV lũy kế, file theo dõi, phiếu đã khử trùng (kèm bổ sung từ "Vật tư
 * ngày"), file bị bỏ qua, cảnh báo, lỗi chặn và quyết định ngày. Module thuần, không DB.
 *
 * Gọi lại với `dateChoices` (khóa `date:<file>:<sheet>!<ô>` → "yyyy-mm-dd") sau khi người
 * dùng chọn ngày trong màn xem trước.
 */

import { classifyBundle } from "./bundle-classifier";
import { parseCsvLifetime } from "./csv-lifetime-parser";
import { cutoverConstantsForReview } from "./cutover-constants";
import { supplementFromDaily } from "./daily-supplement";
import { dedupeDeliveries, type PairKeyFn } from "./delivery-dedupe";
import { parseMainFile } from "./main-file-parser";
import { IssueSink } from "./parse-issues";
import { parseTrackingFile } from "./tracking-file-parser";
import type { BundleFile, CutoverBundleParseResult, DateChoices, ParseIssues } from "./types";

export interface ParseCutoverBundleOptions {
  /** Lựa chọn ngày của người dùng cho các quyết định ngày. */
  dateChoices?: DateChoices;
  /** Khóa cặp (NCC, công trình) khi khử trùng; mặc định theo tên chuẩn hóa. */
  pairKeyOf?: PairKeyFn;
}

function collect(parts: (ParseIssues | null)[]): ParseIssues {
  const present = parts.filter((p): p is ParseIssues => p !== null);
  return {
    warnings: present.flatMap((p) => p.warnings),
    blockingErrors: present.flatMap((p) => p.blockingErrors),
    dateDecisions: present.flatMap((p) => p.dateDecisions),
  };
}

export function parseCutoverBundle(
  files: readonly BundleFile[],
  options: ParseCutoverBundleOptions = {},
): CutoverBundleParseResult {
  const bundleSink = new IssueSink();
  const classified = classifyBundle(files, bundleSink);
  const dateChoices = options.dateChoices ?? {};

  const mainFile = classified.main ? parseMainFile(classified.main.workbook, classified.main.path) : null;
  const csv = classified.csv ? parseCsvLifetime(classified.csv.text, classified.csv.path) : null;
  const trackingFiles = classified.tracking.map((t) => parseTrackingFile(t.workbook, t.path, { dateChoices }));

  const reconciled = dedupeDeliveries(
    trackingFiles.flatMap((t) => t.deliveries),
    { pairKeyOf: options.pairKeyOf },
  );
  const supplementSink = new IssueSink();
  const supplements = supplementFromDaily(
    reconciled,
    trackingFiles.flatMap((t) => t.dailyRows),
    { pairKeyOf: options.pairKeyOf, sink: supplementSink },
  );

  return {
    constants: cutoverConstantsForReview(),
    mainFile,
    csv,
    trackingFiles,
    deliveries: [...reconciled, ...supplements],
    skipped: classified.skipped,
    ...collect([bundleSink, mainFile, csv, ...trackingFiles, supplementSink]),
  };
}
