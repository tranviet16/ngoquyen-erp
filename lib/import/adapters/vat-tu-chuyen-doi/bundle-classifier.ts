/**
 * Phân loại file trong gói thư mục "Quản Lý Công Nợ":
 * - file tổng: có sheet "Nhập Liệu" và "Số Dư Ban Đầu";
 * - CSV: đuôi .csv và có chữ "Tổng phát sinh";
 * - file theo dõi: .xlsx trong thư mục con, có sheet "Đối chiếu công nợ*" / "Vật tư ngày";
 * - còn lại bị bỏ qua và liệt kê. Phải có đúng 1 file tổng và tối đa 1 CSV.
 */

import type * as XLSX from "xlsx";
import { normKey, readWorkbook } from "./cell-reader";
import { decodeCsv } from "./csv-lifetime-parser";
import { fileRef, type IssueSink } from "./parse-issues";
import {
  extensionOf,
  folderFromPath,
  isDailySheet,
  isHiddenPath,
  isReconciliationSheet,
  normalizeBundlePath,
} from "./source-names";
import type { BundleFile, SkippedFile } from "./types";

export interface ClassifiedWorkbook {
  path: string;
  workbook: XLSX.WorkBook;
}

export interface ClassifiedBundle {
  main: ClassifiedWorkbook | null;
  csv: { path: string; text: string } | null;
  tracking: ClassifiedWorkbook[];
  skipped: SkippedFile[];
}

function hasSheet(wb: XLSX.WorkBook, name: string): boolean {
  const key = normKey(name);
  return wb.SheetNames.some((n) => normKey(n) === key);
}

export function classifyBundle(files: readonly BundleFile[], sink: IssueSink): ClassifiedBundle {
  const mains: ClassifiedWorkbook[] = [];
  const csvs: { path: string; text: string }[] = [];
  const tracking: ClassifiedWorkbook[] = [];
  const skipped: SkippedFile[] = [];
  const sorted = [...files]
    .map((f) => ({ ...f, path: normalizeBundlePath(f.path) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const f of sorted) {
    const ext = extensionOf(f.path);
    if (isHiddenPath(f.path)) {
      skipped.push({ path: f.path, reason: "Thư mục / file ẩn" });
      continue;
    }
    if (ext === "csv") {
      let text: string;
      try {
        text = decodeCsv(f.buffer);
      } catch {
        sink.block("csv-encoding", "CSV không phải UTF-8.", fileRef(f.path));
        continue;
      }
      if (normKey(text).includes("tong phat sinh")) csvs.push({ path: f.path, text });
      else skipped.push({ path: f.path, reason: 'CSV không có cột "Tổng phát sinh"' });
      continue;
    }
    if (ext !== "xlsx") {
      skipped.push({ path: f.path, reason: "Không phải .xlsx / .csv" });
      continue;
    }
    let workbook: XLSX.WorkBook;
    try {
      workbook = readWorkbook(f.buffer);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      sink.block("xlsx-unreadable", `Không đọc được file Excel: ${detail}`, fileRef(f.path));
      continue;
    }
    if (hasSheet(workbook, "Nhập Liệu") && hasSheet(workbook, "Số Dư Ban Đầu")) {
      mains.push({ path: f.path, workbook });
    } else if (folderFromPath(f.path) && workbook.SheetNames.some((n) => isReconciliationSheet(n) || isDailySheet(n))) {
      tracking.push({ path: f.path, workbook });
    } else {
      skipped.push({ path: f.path, reason: "Không phải file tổng hay file theo dõi" });
    }
  }

  if (mains.length !== 1) {
    const message = mains.length === 0
      ? 'Gói thiếu file tổng (có sheet "Nhập Liệu" và "Số Dư Ban Đầu").'
      : `Gói có ${mains.length} file tổng; chỉ được có 1: ${mains.map((m) => m.path).join(", ")}.`;
    sink.block("bundle-main-count", message, fileRef(mains[1]?.path ?? ""));
  }
  if (csvs.length > 1) {
    sink.block("bundle-csv-count", `Gói có ${csvs.length} CSV "Tổng công nợ"; tối đa 1: ${csvs.map((c) => c.path).join(", ")}.`, fileRef(csvs[1].path));
  }
  return {
    main: mains.length === 1 ? mains[0] : null,
    csv: csvs.length === 1 ? csvs[0] : null,
    tracking,
    skipped,
  };
}
