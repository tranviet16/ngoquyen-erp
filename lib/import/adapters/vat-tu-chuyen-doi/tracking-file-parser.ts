/**
 * File theo dõi `Theo Dõi Vật Tư/<công trình>/<NCC>.xlsx`: mặc định thuộc (NCC theo
 * tên file, công trình theo thư mục). Đọc các sheet "Đối chiếu công nợ*" (nguồn chính,
 * có giá) và "Vật tư ngày"; bỏ "Vật tư tháng*", "SGV" và sheet khác.
 */

import { toWorkbook, workbookGrid, type WorkbookInput } from "./cell-reader";
import { dayQtyKey, itemQtyKey, readDailySheet, type DailyReferences } from "./daily-sheet-reader";
import { addDays } from "./day-utils";
import { fileRef, IssueSink } from "./parse-issues";
import { readReconciliationSheet, type TrackingReadContext } from "./reconciliation-sheet-reader";
import {
  folderFromPath,
  isDailySheet,
  isReconciliationSheet,
  normalizeBundlePath,
  supplierHintFromFileName,
} from "./source-names";
import type { DateChoices, ReconciliationBlock, TrackingDelivery, TrackingFileParseResult } from "./types";

export interface TrackingParseOptions {
  dateChoices?: DateChoices;
}

/** Tham chiếu từ phiếu đối chiếu cùng file để giải ngày của "Vật tư ngày". */
function dailyReferences(deliveries: readonly TrackingDelivery[]): DailyReferences {
  const dayQty = new Set<string>();
  const itemQty = new Set<string>();
  let min: Date | null = null;
  let max: Date | null = null;
  for (const d of deliveries) {
    itemQty.add(itemQtyKey(d.itemName, d.qty));
    for (const date of d.date ? [d.date] : d.dateCandidates) dayQty.add(dayQtyKey(date, d.qty));
    if (d.date) {
      if (!min || d.date < min) min = d.date;
      if (!max || d.date > max) max = d.date;
    }
  }
  const expected = min && max ? { from: addDays(min, -31), to: addDays(max, 31) } : null;
  return { dayQty, itemQty, expected };
}

export function parseTrackingFile(
  input: WorkbookInput,
  rawPath: string,
  options: TrackingParseOptions = {},
): TrackingFileParseResult {
  const path = normalizeBundlePath(rawPath);
  const sink = new IssueSink();
  const wb = toWorkbook(input);
  const ctx: TrackingReadContext = {
    file: path,
    folder: folderFromPath(path),
    supplierHint: supplierHintFromFileName(path),
    choices: options.dateChoices ?? {},
    sink,
  };
  const sheetsRead: string[] = [];
  const sheetsSkipped: string[] = [];
  const blocks: ReconciliationBlock[] = [];
  const deliveries: TrackingDelivery[] = [];
  const dailyRows: TrackingDelivery[] = [];

  for (const name of wb.SheetNames) {
    if (!isReconciliationSheet(name)) continue;
    const grid = workbookGrid(wb, name, path);
    if (!grid) continue;
    const read = readReconciliationSheet(grid, ctx);
    blocks.push(...read.blocks);
    deliveries.push(...read.deliveries);
    sheetsRead.push(name);
  }

  const refs = dailyReferences(deliveries);
  for (const name of wb.SheetNames) {
    if (isReconciliationSheet(name)) continue;
    if (!isDailySheet(name)) {
      sheetsSkipped.push(name);
      continue;
    }
    const grid = workbookGrid(wb, name, path);
    if (!grid) continue;
    dailyRows.push(...readDailySheet(grid, ctx, refs));
    sheetsRead.push(name);
  }
  if (sheetsRead.length === 0) {
    sink.block("tracking-no-sheet", 'File theo dõi không có sheet "Đối chiếu công nợ" hoặc "Vật tư ngày".', fileRef(path));
  }

  return {
    file: path,
    folder: ctx.folder,
    supplierHint: ctx.supplierHint,
    sheetsRead,
    sheetsSkipped,
    blocks,
    deliveries,
    dailyRows,
    ...sink.snapshot(),
  };
}
